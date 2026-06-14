"""
Prompt Manager - Dynamic prompt generation with context injection.

Simplified version for affiliate templates. Ported from prismatechapp.
"""

import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.prompts.affiliate_templates import (
    AFFILIATE_OPERATOR_CONFIG,
    AFFILIATE_OPERATOR_PROMPT,
    LEAD_QUALIFICATION_CONFIG,
    LEAD_QUALIFICATION_PROMPT,
    PIX_PAYMENT_CONFIG,
    PIX_PAYMENT_PROMPT,
    VIRTUAL_CARD_CONFIG,
    VIRTUAL_CARD_PROMPT,
)


class PromptManager:
    """Manages AI prompts with dynamic context injection for affiliate use cases."""

    def __init__(self):
        self.templates = {
            "affiliate_operator": AFFILIATE_OPERATOR_PROMPT,
            "lead_qualification": LEAD_QUALIFICATION_PROMPT,
            "pix_payment": PIX_PAYMENT_PROMPT,
            "virtual_card": VIRTUAL_CARD_PROMPT,
        }
        self.configs = {
            "affiliate_operator": AFFILIATE_OPERATOR_CONFIG,
            "lead_qualification": LEAD_QUALIFICATION_CONFIG,
            "pix_payment": PIX_PAYMENT_CONFIG,
            "virtual_card": VIRTUAL_CARD_CONFIG,
        }

    def build_prompt(
        self,
        template_name: str = "affiliate_operator",
        company_data: Optional[Dict[str, Any]] = None,
        knowledge_base: Optional[str] = None,
        customer_history: Optional[List[Dict]] = None,
        customer_info: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Build a complete prompt with all context injected.

        Args:
            template_name: Name of the prompt template to use.
            company_data: Company information (name, services, hours, etc).
            knowledge_base: RAG knowledge base content.
            customer_history: Previous conversation messages.
            customer_info: Customer data (name, status, etc).
            context: Additional context variables.

        Returns:
            Complete prompt string ready for the AI.
        """
        template = self.templates.get(template_name, AFFILIATE_OPERATOR_PROMPT)

        # Build sections
        company_section = self._format_company_data(company_data or {})
        knowledge_section = self._format_knowledge_base(knowledge_base)
        history_section = self._format_customer_history(customer_history or [])

        # Extract customer info
        customer_name = (customer_info or {}).get("name", "Cliente")
        customer_status = (customer_info or {}).get("status", "novo")
        last_interaction = (customer_info or {}).get("last_interaction", "primeira vez")

        # Current time info
        now = datetime.now()
        current_time = now.strftime("%H:%M")
        greeting = self._get_greeting(now.hour)

        # Inject all variables into template
        prompt = template.format(
            company_data=company_section,
            knowledge_base=knowledge_section,
            customer_history=history_section,
            customer_name=customer_name,
            customer_status=customer_status,
            last_interaction=last_interaction,
            current_time=current_time,
            greeting=greeting,
            **(context or {}),
        )

        return prompt

    def _format_company_data(self, data: Dict[str, Any]) -> str:
        """Format company data into readable text."""
        if not data:
            return "Não há dados da empresa configurados."

        sections = []

        if "name" in data:
            sections.append(f"**Nome:** {data['name']}")

        if "description" in data:
            sections.append(f"**Sobre:** {data['description']}")

        if "services" in data and data["services"]:
            services_list = "\n".join([f"  * {s}" for s in data["services"]])
            sections.append(f"**Serviços:**\n{services_list}")

        if "hours" in data:
            sections.append(f"**Horário de Atendimento:** {data['hours']}")

        if "contact" in data:
            contact = data["contact"]
            contact_info = []
            if "phone" in contact:
                contact_info.append(f"Tel: {contact['phone']}")
            if "email" in contact:
                contact_info.append(f"Email: {contact['email']}")
            if "address" in contact:
                contact_info.append(f"Endereço: {contact['address']}")
            if contact_info:
                sections.append(f"**Contato:** {', '.join(contact_info)}")

        return "\n".join(sections) if sections else "Informações básicas da empresa."

    def _format_knowledge_base(self, knowledge: Optional[str]) -> str:
        """Format knowledge base content."""
        if not knowledge:
            return "Consulte a base de conhecimento quando necessário."

        # Truncate if too long
        if len(knowledge) > 2000:
            knowledge = knowledge[:2000] + "...\n\n[Base de conhecimento truncada - consulte para mais detalhes]"

        return f"**Base de Conhecimento Relevante:**\n{knowledge}"

    def _format_customer_history(self, history: List[Dict]) -> str:
        """Format customer conversation history."""
        if not history:
            return "Primeiro contato com este cliente."

        # Get last 5 interactions
        recent = history[-5:] if len(history) > 5 else history

        lines = ["**Histórico Recente:**"]
        for msg in recent:
            role = "Cliente" if msg.get("role") == "user" else "Você"
            text = msg.get("content", "")[:100]  # Truncate long messages
            timestamp = msg.get("timestamp", "")

            if timestamp:
                lines.append(f"[{timestamp}] {role}: {text}")
            else:
                lines.append(f"{role}: {text}")

        if len(history) > 5:
            lines.append(f"... (mais {len(history) - 5} mensagens anteriores)")

        return "\n".join(lines)

    def _get_greeting(self, hour: int) -> str:
        """Get appropriate greeting based on time of day."""
        if 5 <= hour < 12:
            return "Bom dia"
        elif 12 <= hour < 18:
            return "Boa tarde"
        else:
            return "Boa noite"

    def extract_action(self, ai_response: str) -> Optional[Dict[str, Any]]:
        """Extract suggested action from AI response.

        Format: [AÇÃO: ACTION_NAME | param1=value1, param2=value2]

        Returns:
            Dict with action name and parameters, or None.
        """
        pattern = r"\[AÇÃO:\s*([A-Z_]+)\s*\|\s*([^\]]+)\]"
        match = re.search(pattern, ai_response)

        if not match:
            return None

        action_name = match.group(1).strip()
        params_str = match.group(2).strip()

        # Parse parameters
        params = {}
        if params_str:
            for param in params_str.split(","):
                if "=" in param:
                    key, value = param.split("=", 1)
                    params[key.strip()] = value.strip()

        return {
            "action": action_name,
            "params": params,
            "raw": match.group(0),
        }

    def clean_response(self, ai_response: str) -> str:
        """Remove action markers from response text."""
        pattern = r"\[AÇÃO:[^\]]+\]"
        return re.sub(pattern, "", ai_response).strip()

    def get_config(self, template_name: str = "affiliate_operator") -> Dict[str, Any]:
        """Get configuration for a template."""
        return self.configs.get(template_name, AFFILIATE_OPERATOR_CONFIG).copy()

    def calculate_typing_delay(self, text: str, wpm: int = 300) -> float:
        """Calculate realistic typing delay based on text length.

        Args:
            text: Text to simulate typing.
            wpm: Words per minute (typing speed).

        Returns:
            Delay in seconds.
        """
        words = len(text.split())
        # Convert WPM to seconds per word
        seconds_per_word = 60 / wpm
        total_seconds = words * seconds_per_word

        # Add thinking time (1-2 seconds)
        thinking_time = 1.5

        # Cap maximum delay at 10 seconds
        return min(total_seconds + thinking_time, 10.0)


# Global singleton
prompt_manager = PromptManager()
