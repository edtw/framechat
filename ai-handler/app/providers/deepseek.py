import logging
from typing import List, Optional

from openai import AsyncOpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)


class DeepSeekProvider:
    """DeepSeek AI provider using OpenAI-compatible API.

    Pricing (per 1M tokens):
        - Input:  $0.14
        - Output: $0.28
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        self.api_key = api_key or settings.DEEPSEEK_API_KEY
        self.model = model or settings.DEEPSEEK_MODEL
        self.base_url = base_url or settings.DEEPSEEK_BASE_URL
        self._client: Optional[AsyncOpenAI] = None

    async def initialize(self) -> None:
        """Initialize the DeepSeek client."""
        if not self.api_key:
            raise ValueError(
                "DeepSeek API key not provided. Set DEEPSEEK_API_KEY environment variable."
            )

        self._client = AsyncOpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
        )
        logger.info("DeepSeek provider initialized (model=%s, base_url=%s)", self.model, self.base_url)

    async def generate_response(
        self,
        message: str,
        context: Optional[List] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        system_prompt: Optional[str] = None,
        **kwargs,
    ) -> str:
        """Generate a response using DeepSeek.

        Args:
            message: The user message.
            context: List of Message objects or dicts with 'role' and 'content'.
            max_tokens: Maximum tokens in the response.
            temperature: Sampling temperature (0-2).
            system_prompt: Optional system-level instruction.
            **kwargs: Additional parameters forwarded to the API.

        Returns:
            The assistant's response text.
        """
        if not self._client:
            await self.initialize()

        messages: list = []

        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        if context:
            for msg in context:
                if hasattr(msg, "role") and hasattr(msg, "content"):
                    messages.append({"role": msg.role, "content": msg.content})
                elif isinstance(msg, dict) and "role" in msg and "content" in msg:
                    messages.append({"role": msg["role"], "content": msg["content"]})

        messages.append({"role": "user", "content": message})

        response = await self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            **kwargs,
        )

        return response.choices[0].message.content

    def estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        """Estimate cost in USD based on token counts.

        DeepSeek pricing:
            - Input:  $0.14 per 1M tokens
            - Output: $0.28 per 1M tokens
        """
        input_cost = (input_tokens / 1_000_000) * 0.14
        output_cost = (output_tokens / 1_000_000) * 0.28
        return input_cost + output_cost

    async def is_available(self) -> bool:
        """Check if DeepSeek API is reachable and authenticated."""
        try:
            if not self._client:
                await self.initialize()
            # Lightweight check — list models to verify auth
            await self._client.models.list()
            return True
        except Exception as e:
            error_msg = str(e)
            if '401' in error_msg or 'Authentication' in error_msg or 'invalid' in error_msg:
                logger.error("DeepSeek API key is INVALID or expired. Set a valid DEEPSEEK_API_KEY.")
            else:
                logger.warning("DeepSeek availability check failed: %s", str(e)[:200])
            return False
