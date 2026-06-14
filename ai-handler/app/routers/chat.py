import json
import logging
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.models.enums import IntentType
from app.models.schemas import (
    AnalyzeSignatureRequest,
    AnalyzeSignatureResponse,
    ChatRequest,
    ChatResponse,
    FollowUpRequest,
    FollowUpResponse,
    HealthResponse,
    Intent,
    IntentDetectionRequest,
    IntentDetectionResponse,
    Message,
    ScoreLeadFactors,
    ScoreLeadRequest,
    ScoreLeadResponse,
)
from app.prompts.message_attention import format_outgoing_burst
from app.prompts.writing_signature import (
    analyze_writing_signature,
    merge_signature_directive,
)
from app.services.ai_manager import ai_manager, AIProviderError
from app.services.intent_detector import IntentDetector
from app.services.orchestrator import orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat"])
intent_detector = IntentDetector()


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Generate AI response for a chat message.

    This is the main chat endpoint. It detects intent, generates a response
    using DeepSeek, and returns the result with cost estimates.
    """
    try:
        # Detect intent if enabled
        detected_intent: Optional[Intent] = None
        if request.detect_intent:
            detected_intent = intent_detector.detect_intent(request.message)

        # ── Orchestrator: pipeline management ──
        # chat_jid identifies the individual contact within a session; fall back
        # to session_id only when the caller can't supply a per-chat identifier.
        orchestrator_result = None
        if request.session_id:
            chat_jid = request.chat_jid or request.session_id
            orchestrator_result = orchestrator.process_incoming_message(
                session_id=request.session_id,
                chat_jid=chat_jid,
                message_text=request.message,
                detected_intent=detected_intent.type.value if detected_intent else None,
                intent_confidence=detected_intent.confidence if detected_intent else 0.0,
                contact_name=request.contact_name or "",
                contact_phone=request.contact_phone or "",
            )
            logger.info(
                "Orchestrator pipeline: chat=%s stage=%s changed=%s alerts=%d",
                chat_jid,
                orchestrator_result.get("pipeline_stage"),
                orchestrator_result.get("stage_changed"),
                len(orchestrator_result.get("alerts", [])),
            )

        # Generate response — use production-optimized defaults
        response_text, provider_name, tokens_used = await ai_manager.generate_response(
            message=request.message,
            context=request.context,
            max_tokens=request.max_tokens or settings.DEEPSEEK_DEFAULT_MAX_TOKENS,
            temperature=request.temperature or settings.DEEPSEEK_DEFAULT_TEMPERATURE,
            system_prompt=request.system_prompt,
            behavior=request.behavior,
            knowledge_base=request.knowledge_base,
            writing_signature=request.writing_signature,
            self_signature=request.self_signature,
        )

        # ── Orchestrator: mark AI response ──
        if request.session_id:
            orchestrator.process_ai_response(
                request.session_id, request.chat_jid or request.session_id, response_text
            )

        # Calculate cost estimate
        cost_stats = ai_manager.get_cost_stats()
        cost_estimate = cost_stats["total"]["total_cost_usd"]

        # Split reply into burst-sized chunks for natural multi-message sending
        burst_chunks = format_outgoing_burst(response_text)
        if len(burst_chunks) <= 1:
            burst_chunks = None

        return ChatResponse(
            response=response_text,
            provider=provider_name,
            intent=detected_intent,
            tokens_used=tokens_used,
            cost_estimate=cost_estimate,
            orchestrator=orchestrator_result,
            burst_chunks=burst_chunks,
        )

    except AIProviderError as e:
        logger.error("AI provider error: %s", e)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error in chat endpoint")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/intent", response_model=IntentDetectionResponse)
async def detect_intent(request: IntentDetectionRequest):
    """Detect intent from a message text.

    Useful for pre-classifying messages before routing to the AI.
    """
    try:
        detected_intent = intent_detector.detect_intent(request.message)
        suggested_actions = intent_detector.suggest_actions(detected_intent)

        return IntentDetectionResponse(
            intent=detected_intent,
            suggested_actions=suggested_actions,
        )

    except Exception as e:
        logger.exception("Intent detection failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze-signature", response_model=AnalyzeSignatureResponse)
async def analyze_signature(request: AnalyzeSignatureRequest):
    """Analyze writing signature from a list of messages.

    Pure heuristic analysis — no AI/LLM calls. Computes statistical and
    pattern-based style traits from raw message text. Call this once per chat
    (or after accumulating 50+ new messages) and pass the result as
    ``writing_signature`` in the main /api/chat/ request body to make AI
    replies mirror the user's actual writing style.
    """
    try:
        signature = analyze_writing_signature(request.messages)
        return AnalyzeSignatureResponse(
            signature=signature,
            message_count=signature.get("message_count", 0),
        )
    except Exception as e:
        logger.exception("Signature analysis failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-followup", response_model=FollowUpResponse)
async def generate_followup(request: FollowUpRequest):
    """Generate a personalized follow-up message for a lead.

    Creates a short, human-sounding WhatsApp follow-up message in Portuguese
    based on the lead's pipeline stage, time since last contact, and recent
    conversation context.
    """
    try:
        system_prompt = _build_followup_system_prompt()
        instruction = _build_followup_instruction(request)

        # Format last_messages as Message objects for the AI context
        context: list[Message] = []
        if request.last_messages:
            context = [
                Message(
                    role=m.role if hasattr(m, "role") else m.get("role", "user"),
                    content=m.content if hasattr(m, "content") else m.get("content", ""),
                )
                for m in request.last_messages
            ]

        response_text, provider_name, tokens_used = await ai_manager.generate_response(
            message=instruction,
            context=context,
            max_tokens=150,
            temperature=0.7,
            system_prompt=system_prompt,
            behavior={"humanStyle": False},
        )

        intent = _infer_followup_intent(request.sequence_step, request.days_since_last_contact)
        confidence = 0.85 if response_text and len(response_text.strip()) > 10 else 0.5

        return FollowUpResponse(
            message=response_text.strip(),
            intent=intent,
            confidence=round(confidence, 2),
        )

    except AIProviderError as e:
        logger.error("AI provider error in follow-up: %s", e)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error in follow-up endpoint")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health", response_model=HealthResponse)
async def ai_health():
    """Check AI provider health."""
    try:
        provider_status = await ai_manager.get_provider_status()

        all_healthy = all(provider_status.values()) if provider_status else False
        return HealthResponse(
            status="healthy" if all_healthy else "degraded",
            providers=provider_status,
            version="1.0.0",
        )
    except Exception as e:
        logger.exception("Health check failed")
        return HealthResponse(
            status="unhealthy",
            providers={"deepseek": False},
            version="1.0.0",
        )


# ---------------------------------------------------------------------------
# Follow-up generation helpers
# ---------------------------------------------------------------------------

def _build_followup_system_prompt() -> str:
    """Build the system prompt for follow-up message generation.

    Returns a Portuguese prompt that instructs the AI to write a single short
    WhatsApp follow-up message with human-style constraints baked in (short
    sentences, no jargon, no AI-tells). We handle style here rather than via
    the auto human_style layer because the instruction text is in Portuguese.
    """
    return (
        "Você é um gerador de mensagens de follow-up para o programa de afiliados Revolut.\n"
        "Seu trabalho é escrever UMA mensagem curta de WhatsApp em português (pt-BR).\n"
        "\n"
        "REGRAS:\n"
        "- Chame o lead pelo nome.\n"
        '- Reconheça o tempo sem contato de forma natural ("Passando aqui pra ver como você está...").\n'
        "- Seja contextualmente relevante à última conversa.\n"
        "- Inclua uma chamada suave para ação (nada forçado).\n"
        "- Máximo 3 frases.\n"
        "- Escreva como uma pessoa real, não como um robô.\n"
        "- Use frases curtas e diretas.\n"
        "- Tom casual, caloroso e conversacional.\n"
        "- Nada de jargão corporativo ou palavras formais.\n"
        "- Evite pontuação excessiva.\n"
        "- NUNCA diga que você é uma IA, um robô ou assistente virtual.\n"
        "\n"
        "EXEMPLOS DE BOAS MENSAGENS:\n"
        '- "E aí João! Passando aqui pra ver como você tá. Conseguiu fazer aquele passo que a gente conversou?"\n'
        '- "Oi Maria, tudo bem? Vi que faz uns dias que a gente não se fala. Se precisar de ajuda com a conta do Revolut, tô por aqui!"\n'
        "\n"
        "RETORNE APENAS A MENSAGEM, sem aspas, sem explicações."
    )


def _build_followup_instruction(request: FollowUpRequest) -> str:
    """Build the instruction message that the AI treats as the incoming prompt."""
    parts = [
        f"Nome do lead: {request.lead_name}",
        f"Estágio do pipeline: {request.pipeline_stage}",
        f"Dias desde o último contato: {request.days_since_last_contact}",
        f"Passo da sequência: {request.sequence_step}",
    ]
    if request.custom_instruction:
        parts.append(f"Instrução adicional: {request.custom_instruction}")

    parts.append("\nGere uma mensagem de follow-up para este lead.")
    return "\n".join(parts)


def _infer_followup_intent(sequence_step: str, days_since_last_contact: int) -> str:
    """Infer a follow-up intent label from the sequence step and contact gap."""
    step_lower = sequence_step.lower()
    if "day1" in step_lower or "day_1" in step_lower or days_since_last_contact <= 1:
        return "quick_checkin"
    if "day3" in step_lower or "day_3" in step_lower:
        return "checkin"
    if "day7" in step_lower or "day_7" in step_lower or days_since_last_contact >= 5:
        return "nudge"
    if "reactivate" in step_lower or days_since_last_contact >= 14:
        return "reactivate"
    return "checkin"


# ---------------------------------------------------------------------------
# Lead Scoring
# ---------------------------------------------------------------------------

LEAD_SCORING_SYSTEM_PROMPT = (
    "Você é um analista de scoring de leads para o programa de afiliados Revolut.\n"
    "Analise a conversa e os dados do lead e retorne APENAS um JSON válido "
    "(sem markdown, sem ```json, sem explicações adicionais) com esta estrutura:\n"
    "{\n"
    '  "score": <0-100>,\n'
    '  "factors": {\n'
    '    "engagement": <0-100>,\n'
    '    "intent": <0-100>,\n'
    '    "urgency": <0-100>,\n'
    '    "sentiment": <0-100>,\n'
    '    "plan_interest": <0-100>,\n'
    '    "action_readiness": <0-100>\n'
    "  },\n"
    '  "explanation": "<1-2 frases curtas em português>",\n'
    '  "recommended_action": "<send_link | follow_up | nurture | urgent | qualify>"\n'
    "}\n"
    "\n"
    "CRITÉRIOS DE AVALIAÇÃO:\n"
    "- engagement (engajamento): o lead faz perguntas detalhadas? demonstra "
    "investimento na conversa? responde rapidamente?\n"
    "- intent (clareza de intenção): o lead claramente quer abrir conta no "
    "Revolut? ou está só navegando/tirando dúvidas genéricas?\n"
    "- urgency (urgência): menciona prazos, necessidades imediatas, pressa, "
    '"quero agora", "preciso para hoje"?\n'
    "- sentiment (sentimento): tom geral da conversa — positivo/entusiasmado "
    "(80-100), neutro (40-60), frustrado/confuso (0-30).\n"
    "- plan_interest (interesse em planos): pergunta sobre planos específicos "
    "(Standard, Premium, Metal)? compara planos? quer saber benefícios?\n"
    "- action_readiness (prontidão para ação): já pediu o link de cadastro? "
    "perguntou como se cadastrar? disse que vai fazer agora?\n"
    "\n"
    "AÇÕES RECOMENDADAS:\n"
    '- "send_link": lead quente (score 70+), pronto para receber o link de cadastro.\n'
    '- "follow_up": lead morno (score 40-69), precisa de mais informação ou '
    "acompanhamento.\n"
    '- "nurture": lead frio (score 0-39), precisa ser nutrido com conteúdo '
    "antes de avançar.\n"
    '- "urgent": lead com sinal claro de urgência — responder o mais rápido possível.\n'
    '- "qualify": lead ambíguo, precisa de mais perguntas de qualificação '
    "antes de classificar.\n"
    "\n"
    "SCORE GLOBAL (0-100):\n"
    "- 80-100: Lead quente — alta intenção + engajamento + pronto para agir.\n"
    "- 50-79: Lead morno — interesse moderado, precisa de acompanhamento.\n"
    "- 0-49: Lead frio — baixo engajamento, possível curiosidade passageira.\n"
    "\n"
    "IMPORTANTE: Retorne APENAS o JSON. Nada antes, nada depois."
)


def _parse_scoring_json(raw: str) -> dict:
    """Extract and parse a JSON object from an AI response.

    Handles markdown fences (```json ... ```) and leading/trailing noise.
    """
    # Strip markdown code fences if present
    cleaned = raw.strip()
    fence_match = re.match(r"```(?:json)?\s*\n?(.*?)\n?```", cleaned, re.DOTALL)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    # Find the outermost JSON object
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"No JSON object found in AI response: {raw[:200]}")

    json_str = cleaned[start:end + 1]
    return json.loads(json_str)


@router.post("/score-lead", response_model=ScoreLeadResponse)
async def score_lead(request: ScoreLeadRequest):
    """Score a lead by analyzing their conversation with DeepSeek.

    Evaluates six factors (engagement, intent, urgency, sentiment,
    plan_interest, action_readiness) and returns a 0-100 score with a
    recommended action.
    """
    try:
        # ── Build the user message with lead context ──
        lead_info_lines = []
        if request.lead_data:
            name = request.lead_data.get("name")
            phone = request.lead_data.get("phone")
            stage = request.lead_data.get("stage") or request.pipeline_stage
            source = request.lead_data.get("source")
            created_at = request.lead_data.get("createdAt")

            if name:
                lead_info_lines.append(f"Nome: {name}")
            if phone:
                lead_info_lines.append(f"Telefone: {phone}")
            if stage:
                lead_info_lines.append(f"Estágio do pipeline: {stage}")
            if source:
                lead_info_lines.append(f"Origem: {source}")
            if created_at:
                lead_info_lines.append(f"Lead criado em: {created_at}")

        lead_info_block = "\n".join(lead_info_lines) if lead_info_lines else ""

        conversation_block = ""
        if request.conversation_messages:
            lines = []
            for m in request.conversation_messages:
                role_label = "Lead" if m.role == "user" else "Agente"
                lines.append(f"[{role_label}]: {m.content}")
            conversation_block = "\n".join(lines)

        user_message = (
            "DADOS DO LEAD:\n"
            f"{lead_info_block}\n"
            "\n"
            "CONVERSA (últimas mensagens):\n"
            f"{conversation_block}\n"
            "\n"
            "Analise este lead e retorne o JSON com o score."
        )

        # ── Ensure AI provider is ready ──
        if not ai_manager._initialized:
            await ai_manager.initialize()

        # ── Call DeepSeek directly (no human-style, no signature layers) ──
        response_text = await ai_manager.provider.generate_response(
            message=user_message,
            max_tokens=300,
            temperature=0.3,  # lower temperature for consistent scoring
            system_prompt=LEAD_SCORING_SYSTEM_PROMPT,
        )

        # ── Parse the JSON response ──
        parsed = _parse_scoring_json(response_text)
        logger.info(
            "Lead scored: score=%s action=%s",
            parsed.get("score"),
            parsed.get("recommended_action"),
        )

        return ScoreLeadResponse(
            score=int(parsed["score"]),
            factors=ScoreLeadFactors(**{
                k: int(v)
                for k, v in parsed["factors"].items()
                if k in ScoreLeadFactors.model_fields
            }),
            explanation=str(parsed.get("explanation", "")),
            recommended_action=str(parsed.get("recommended_action", "qualify")),
        )

    except (json.JSONDecodeError, ValueError, KeyError, TypeError) as e:
        raw_preview = "N/A"
        try:
            raw_preview = response_text[:300]  # type: ignore[possibly-used-before-assignment]
        except Exception:
            pass
        logger.error("Failed to parse scoring response: %s — raw: %.300s", e, raw_preview)
        raise HTTPException(
            status_code=422,
            detail=f"AI returned invalid scoring JSON: {str(e)}",
        )
    except AIProviderError as e:
        logger.error("AI provider error during lead scoring: %s", e)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error in lead scoring")
        raise HTTPException(status_code=500, detail=str(e))
