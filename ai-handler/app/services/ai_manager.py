import logging
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.models.enums import AIProvider
from app.prompts.context_loader import (
    build_context_for_ai,
    estimate_tokens,
    should_load_context,
)
from app.prompts.human_style import build_style_directive
from app.prompts.self_signature import build_self_directive, merge_self_with_partner
from app.prompts.writing_signature import (
    merge_signature_directive,
    signature_to_directive,
)
from app.providers.deepseek import DeepSeekProvider

logger = logging.getLogger(__name__)


class AIProviderError(Exception):
    """Raised when the AI provider fails."""


class AIManager:
    """Single-provider AI manager for DeepSeek.

    Manages the DeepSeek provider lifecycle and composes system prompts
    from multiple sources (system prompt, behavior guidelines, knowledge base).
    """

    def __init__(self):
        self.provider: Optional[DeepSeekProvider] = None
        self._initialized = False
        self._cost_stats: Dict[str, Any] = {
            "total_requests": 0,
            "total_input_tokens": 0,
            "total_output_tokens": 0,
            "total_cost_usd": 0.0,
        }

    async def initialize(self) -> None:
        """Initialize the DeepSeek provider."""
        if self._initialized:
            return

        if not settings.DEEPSEEK_API_KEY:
            raise AIProviderError(
                "DeepSeek API key not configured. Set DEEPSEEK_API_KEY environment variable."
            )

        self.provider = DeepSeekProvider(
            api_key=settings.DEEPSEEK_API_KEY,
            model=settings.DEEPSEEK_MODEL,
            base_url=settings.DEEPSEEK_BASE_URL,
        )
        await self.provider.initialize()
        self._initialized = True
        logger.info("AI Manager ready with DeepSeek provider")

    async def generate_response(
        self,
        message: str,
        context: Optional[List] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        system_prompt: Optional[str] = None,
        behavior: Optional[Dict[str, Any]] = None,
        knowledge_base: Optional[List[Dict[str, Any]]] = None,
        **kwargs,
    ) -> tuple:
        """Generate an AI response.

        Args:
            message: The user's message.
            context: Previous conversation messages.
            max_tokens: Maximum tokens for the response.
            temperature: Sampling temperature.
            system_prompt: Base system prompt.
            behavior: Behavior/personality configuration.
            knowledge_base: Knowledge snippets for grounding.

        Returns:
            Tuple of (response_text, provider_name, tokens_used).
        """
        if not self._initialized:
            await self.initialize()

        # Compose the full system prompt
        instructions = self._compose_system_prompt(system_prompt, behavior, knowledge_base)

        # Human-style layer: append a multilingual directive that forces a
        # natural, person-like tone and avoids AI-tell jargon. Gated globally by
        # settings.HUMAN_STYLE_ENABLED and overridable per-request via
        # behavior.humanStyle (set to False to disable for a single reply).
        if self._human_style_enabled(behavior):
            style_directive = build_style_directive(message)
            instructions = (
                f"{instructions}\n\n{style_directive}" if instructions else style_directive
            )

        # Self-signature + writing-signature layer.
        #
        # Two signatures per conversation:
        # 1. self_signature — how the USER/operator writes → AI voice
        # 2. writing_signature — how the OTHER person writes → audience context
        #
        # The self directive takes HIGHEST priority: the AI must sound like
        # the user. The partner directive provides calibration for mirroring
        # level (e.g., if partner is formal, elevate slightly but stay in
        # the self voice).
        self_signature = kwargs.pop("self_signature", None)
        writing_signature = kwargs.pop("writing_signature", None)

        if self_signature and isinstance(self_signature, dict):
            self_dir = build_self_directive(self_signature)

            # Build partner directive from writing_signature if available
            partner_dir = ""
            if writing_signature and isinstance(writing_signature, dict):
                partner_dir = signature_to_directive(writing_signature)

            if self_dir:
                combined = merge_self_with_partner(self_dir, partner_dir)
                instructions = (
                    combined + "\n\n" + instructions if instructions else combined
                )
                logger.debug(
                    "Self-signature directive prepended to system prompt "
                    "(self_msg_count=%s, partner_msg_count=%s)",
                    self_signature.get("message_count"),
                    writing_signature.get("message_count") if writing_signature else 0,
                )
        elif writing_signature and isinstance(writing_signature, dict):
            # Original behavior: only writing_signature, no self_signature
            sig_directive = signature_to_directive(writing_signature)
            if sig_directive:
                instructions = merge_signature_directive(
                    instructions or "", sig_directive
                )
                logger.debug(
                    "Writing signature merged into system prompt (msg_count=%s)",
                    writing_signature.get("message_count"),
                )

        # ── Burst detection: rapid-fire social media messages ──
        # When the incoming message is formatted with a "[RÁPIDO" marker
        # (inserted by discord-service or upstream buffering), add a short
        # directive so the AI understands this is casual social-media chat
        # and replies in the same punchy, conversational style.
        if message and "[RÁPIDO" in message:
            burst_directive = (
                "The user sent rapid-fire short messages. This is casual "
                "social media chat. Reply in the same style — short, "
                "punchy, conversational."
            )
            instructions = (
                f"{instructions}\n\n{burst_directive}"
                if instructions
                else burst_directive
            )
            logger.debug("Burst directive appended to system prompt")

        # Context compression: when a writing signature is available and the
        # conversation has enough messages, compress the context to fit within
        # a token budget. This keeps the prompt lean without losing recency.
        if context and writing_signature:
            msg_count = len(context)
            # Use 0.0 for hours_since_last_message — this is a real-time call
            # so the conversation is active by definition.
            if should_load_context(msg_count, 0.0):
                original_tokens = estimate_tokens(
                    " ".join(
                        m.content if hasattr(m, "content") else m.get("content", "")
                        for m in context
                    )
                )
                context_max_tokens = kwargs.pop("context_max_tokens", 800)
                # Pass system_context="" because the system prompt is handled
                # separately (composed above and passed to the provider as
                # `system_prompt`).  build_context_for_ai is used here purely
                # for its conversation-compression capability.
                context = build_context_for_ai(
                    recent_messages=context,
                    writing_signature=writing_signature,
                    system_context="",
                    max_tokens=context_max_tokens,
                )
                compressed_tokens = estimate_tokens(
                    " ".join(m["content"] for m in context)
                )
                logger.info(
                    "Context compressed: %d -> %d tokens (budget=%d)",
                    original_tokens, compressed_tokens, context_max_tokens,
                )

        response_text = await self.provider.generate_response(
            message=message,
            context=context,
            max_tokens=max_tokens,
            temperature=temperature,
            system_prompt=instructions,
            **kwargs,
        )

        # Token estimation via context_loader for consistency
        prompt_tokens = estimate_tokens(instructions or "")
        message_tokens = estimate_tokens(message)
        context_tokens = sum(
            estimate_tokens(
                m.get("content", "") if isinstance(m, dict) else (
                    m.content if hasattr(m, "content") else ""
                )
            )
            for m in (context or [])
        )
        input_tokens = prompt_tokens + message_tokens + context_tokens
        output_tokens = estimate_tokens(response_text)
        tokens_used = input_tokens + output_tokens

        logger.info(
            "Token economy — input: %d (prompt:%d msg:%d ctx:%d), output: %d, total: %d",
            input_tokens, prompt_tokens, message_tokens, context_tokens,
            output_tokens, tokens_used,
        )

        # Track cost
        actual_cost = self.provider.estimate_cost(input_tokens, output_tokens)
        self._cost_stats["total_requests"] += 1
        self._cost_stats["total_input_tokens"] += input_tokens
        self._cost_stats["total_output_tokens"] += output_tokens
        self._cost_stats["total_cost_usd"] += actual_cost

        logger.info(
            "Response generated with DeepSeek — tokens: %d (in:%d out:%d), cost: $%.6f",
            tokens_used, input_tokens, output_tokens, actual_cost,
        )

        return response_text, AIProvider.DEEPSEEK.value, tokens_used

    @staticmethod
    def _human_style_enabled(behavior: Optional[Dict[str, Any]]) -> bool:
        """Decide whether to apply the human-style directive.

        Enabled by default (settings.HUMAN_STYLE_ENABLED). A request can opt out
        by setting behavior.humanStyle to False.
        """
        if behavior is not None and behavior.get("humanStyle") is False:
            return False
        return settings.HUMAN_STYLE_ENABLED

    def _compose_system_prompt(
        self,
        system_prompt: Optional[str],
        behavior: Optional[Dict[str, Any]],
        knowledge_base: Optional[List[Dict[str, Any]]],
    ) -> Optional[str]:
        """Combine system prompt, behavior guidelines, and knowledge base."""
        sections: List[str] = []

        if system_prompt:
            sections.append(system_prompt.strip())

        behavior_text = self._format_behavior(behavior)
        if behavior_text:
            sections.append(behavior_text)

        knowledge_text = self._format_knowledge(knowledge_base)
        if knowledge_text:
            sections.append(knowledge_text)

        final_prompt = "\n\n".join(filter(None, sections)).strip()
        return final_prompt or None

    def _format_behavior(self, behavior: Optional[Dict[str, Any]]) -> Optional[str]:
        """Format behavior configuration into prompt guidelines.

        Ported from prismatechapp AIManager._format_behavior.
        """
        if not behavior:
            return None

        lines = []
        persona = behavior.get("personality")
        language = behavior.get("language")
        response_style = behavior.get("responseStyle")
        greeting = behavior.get("greetingMessage")
        fallback = behavior.get("fallbackMessage")
        use_emojis = behavior.get("useEmojis")

        if persona:
            lines.append(f"Personality: {persona}")
        if language:
            lines.append(f"Language: {language}")
        if response_style:
            lines.append(f"Response style: {response_style}")
        if greeting:
            lines.append(f"Greeting message: {greeting}")
        if fallback:
            lines.append(f"Fallback message: {fallback}")
        if use_emojis:
            lines.append("Use emojis judiciously when appropriate.")

        business_hours = behavior.get("businessHours")
        if business_hours and isinstance(business_hours, dict):
            schedule_text = self._format_business_hours(business_hours)
            if schedule_text:
                lines.append(schedule_text)

        quick_replies = behavior.get("quickReplies")
        if quick_replies:
            quick_text = self._format_quick_replies(quick_replies)
            if quick_text:
                lines.append(quick_text)

        escalation = behavior.get("escalationKeywords")
        if escalation:
            lines.append(f"Escalation keywords: {', '.join(escalation)}")

        if not lines:
            return None

        return "Behavior guidelines:\n- " + "\n- ".join(lines)

    def _format_quick_replies(self, quick_replies: List[Dict]) -> Optional[str]:
        """Format quick reply triggers."""
        entries = []
        for reply in quick_replies:
            trigger = reply.get("trigger")
            response = reply.get("response")
            if trigger and response:
                entries.append(f'"{trigger}" -> "{response}"')
        if not entries:
            return None
        return "Use the following quick replies when relevant:\n" + "\n".join(
            f"* {entry}" for entry in entries[:10]
        )

    def _format_business_hours(self, business_hours: Dict) -> Optional[str]:
        """Format business hours schedule."""
        if not business_hours.get("enabled"):
            return None
        schedule = business_hours.get("schedule") or {}
        lines = []
        for day, config in schedule.items():
            if not isinstance(config, dict):
                continue
            status = "open" if config.get("enabled") else "closed"
            start = config.get("start")
            end = config.get("end")
            if status == "open" and start and end:
                lines.append(f"{day.capitalize()}: {start}-{end}")
            else:
                lines.append(f"{day.capitalize()}: {status}")
        if not lines:
            return None
        tz = business_hours.get("timezone") or "local timezone"
        return f"Business hours ({tz}):\n" + "\n".join(f"* {line}" for line in lines)

    def _format_knowledge(self, knowledge_base: Optional[List[Dict[str, Any]]]) -> Optional[str]:
        """Format knowledge base snippets.

        Ported from prismatechapp AIManager._format_knowledge.
        """
        if not knowledge_base:
            return None

        snippets = []
        for item in knowledge_base[:8]:
            if isinstance(item, dict):
                title = item.get("title") or "Informação"
                content = (item.get("content") or "").strip()
                tags = item.get("tags") or []
            else:
                title = getattr(item, "title", None) or "Informação"
                content = (getattr(item, "content", None) or "").strip()
                tags = getattr(item, "tags", None) or []

            if not content:
                continue
            snippet = content[:600]
            tag_suffix = f" (tags: {', '.join(tags)})" if tags else ""
            snippets.append(f"- {title}{tag_suffix}: {snippet}")

        if not snippets:
            return None

        return "Knowledge base snippets:\n" + "\n".join(snippets)

    async def get_provider_status(self) -> Dict[str, bool]:
        """Get the status of the configured AI provider."""
        if not self.provider:
            return {"deepseek": False}
        try:
            available = await self.provider.is_available()
            return {"deepseek": available}
        except Exception:
            return {"deepseek": False}

    def get_cost_stats(self) -> Dict[str, Any]:
        """Get accumulated cost tracking statistics."""
        return {
            "total": {
                "total_requests": self._cost_stats["total_requests"],
                "total_input_tokens": self._cost_stats["total_input_tokens"],
                "total_output_tokens": self._cost_stats["total_output_tokens"],
                "total_cost_usd": round(self._cost_stats["total_cost_usd"], 6),
            },
            "by_provider": {
                "deepseek": {
                    "requests": self._cost_stats["total_requests"],
                    "input_tokens": self._cost_stats["total_input_tokens"],
                    "output_tokens": self._cost_stats["total_output_tokens"],
                    "cost_usd": round(self._cost_stats["total_cost_usd"], 6),
                }
            },
        }


# Global singleton
ai_manager = AIManager()
