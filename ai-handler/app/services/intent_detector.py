import re
from typing import Dict, List

from app.models.schemas import Intent
from app.models.enums import IntentType


class IntentDetector:
    """Rule-based intent detection tailored for affiliate lead conversations.

    Uses regex patterns to classify user messages into intent types
    relevant to affiliate marketing (lead follow-up, payment, scheduling, etc.).
    """

    def __init__(self):
        self.patterns: Dict[IntentType, List[str]] = {
            IntentType.GREETING: [
                r"\b(oi|ol[aá]|hey|opa|e a[ií]|bom dia|boa tarde|boa noite)\b",
                r"\b(hi|hello|hey|good morning|good afternoon|good evening)\b",
            ],
            IntentType.QUESTION: [
                r"\b(como|quando|onde|por que|qual|quem|quanto)\b",
                r"\?$",
                r"\b(can you|could you|would you|how|what|where|when|why)\b",
            ],
            IntentType.LEAD_INTEREST: [
                r"\b(quero|tenho interesse|me interessa|gostaria|queria|aceito)\b",
                r"\b(interessado|interessada|quero saber mais|me fala mais)\b",
                r"\b(want|interested|tell me more|sign me up|I(')?ll take)\b",
            ],
            IntentType.SUPPORT: [
                r"\b(ajuda|suporte|socorro|d[uú]vida|como funciona|n[aã]o consigo)\b",
                r"\b(help|support|assist|how (does|to)|trouble|issue)\b",
            ],
            IntentType.PAYMENT: [
                r"\b(pagar|pagamento|pix|cobran[cç]a|boleto|cart[aã]o|fatura|valor|pre[cç]o|quanto custa)\b",
                r"\b(pay|payment|price|cost|charge|bill|invoice)\b",
            ],
            IntentType.COMPLAINT: [
                r"\b(reclamar|reclama[cç][aã]o|problema|erro|bug|n[aã]o funciona|defeito|insatisfeit)\b",
                r"\b(complaint|problem|error|bug|not working|broken|unhappy)\b",
            ],
            IntentType.SCHEDULE: [
                r"\b(agendar|agendamento|hor[aá]rio|marcar|quando podemos|dispon[ií]vel|dia|semana|amanh[aã]|hoje)\b",
                r"\b(schedule|appointment|book|when can|available|tomorrow|today|call)\b",
            ],
            IntentType.FOLLOW_UP: [
                r"\b(retornar|retorno|resposta|ainda est[aá]|j[aá] faz|esperando|atualiza[cç][aã]o)\b",
                r"\b(follow[- ]?up|return|response|still|waiting|update|any news)\b",
            ],
        }

        self.entity_patterns: Dict[str, str] = {
            "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
            "phone": r"\b(?:\+55\s?)?(?:\(\d{2}\)|\d{2})\s?\d{4,5}-?\d{4}\b",
            "cpf": r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b",
            "money": r"R\$\s?\d+(?:[.,]\d{2})?",
            "date": r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
        }

    def detect_intent(self, message: str) -> Intent:
        """Detect intent from a user message.

        Scores each intent type based on matching regex patterns and
        returns the best match with confidence.
        """
        message_lower = message.lower()
        intent_scores: Dict[IntentType, int] = {}

        for intent_type, patterns in self.patterns.items():
            score = 0
            for pattern in patterns:
                if re.search(pattern, message_lower):
                    score += 1
            intent_scores[intent_type] = score

        if not any(intent_scores.values()):
            return Intent(
                type=IntentType.OTHER,
                confidence=0.5,
                entities=self._extract_entities(message),
            )

        best_intent = max(intent_scores.items(), key=lambda x: x[1])
        intent_type, score = best_intent
        total_patterns = len(self.patterns[intent_type])
        confidence = min(score / total_patterns, 1.0)

        return Intent(
            type=intent_type,
            confidence=round(confidence, 2),
            entities=self._extract_entities(message),
        )

    def _extract_entities(self, message: str) -> Dict[str, List[str]]:
        """Extract structured entities (email, phone, CPF, money, date)."""
        entities: Dict[str, List[str]] = {}
        for entity_type, pattern in self.entity_patterns.items():
            matches = re.findall(pattern, message)
            if matches:
                entities[entity_type] = matches
        return entities

    def suggest_actions(self, intent: Intent) -> List[str]:
        """Suggest follow-up actions based on detected intent."""
        action_map: Dict[IntentType, List[str]] = {
            IntentType.GREETING: [
                "Responder com saudação calorosa",
                "Perguntar como pode ajudar",
            ],
            IntentType.QUESTION: [
                "Responder com informações claras e objetivas",
                "Esclarecer dúvidas do lead",
            ],
            IntentType.LEAD_INTEREST: [
                "Qualificar o lead com perguntas específicas",
                "Oferecer material ou demonstração",
                "Encaminhar para fechamento",
            ],
            IntentType.SUPPORT: [
                "Oferecer ajuda direta",
                "Enviar FAQ ou tutorial",
                "Escalar para suporte humano se necessário",
            ],
            IntentType.PAYMENT: [
                "Gerar código PIX",
                "Explicar formas de pagamento",
                "Confirmar dados da transação",
            ],
            IntentType.COMPLAINT: [
                "Registrar reclamação formalmente",
                "Pedir desculpas e oferecer solução",
                "Encaminhar para supervisor",
            ],
            IntentType.SCHEDULE: [
                "Verificar disponibilidade",
                "Confirmar data e horário",
                "Agendar follow-up automático",
            ],
            IntentType.FOLLOW_UP: [
                "Verificar status anterior",
                "Reengajar com oferta personalizada",
                "Atualizar cadastro",
            ],
            IntentType.OTHER: [
                "Solicitar clarificação",
                "Oferecer menu de opções",
            ],
        }
        return action_map.get(intent.type, [])
