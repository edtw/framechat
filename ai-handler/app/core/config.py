from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings for AFILIATORS AI Handler (DeepSeek-only)."""

    # DeepSeek — production-optimized defaults based on CRM best practices
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_MODEL: str = "deepseek-chat"
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"

    # Production defaults: low temperature for factual accuracy in CRM context
    DEEPSEEK_DEFAULT_TEMPERATURE: float = 0.3
    DEEPSEEK_DEFAULT_MAX_TOKENS: int = 200
    DEEPSEEK_CHAT_TEMPERATURE: float = 0.4
    DEEPSEEK_CHAT_MAX_TOKENS: int = 300

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Orchestrator
    ORCHESTRATOR_ENABLED: bool = True
    ORCHESTRATOR_POLL_INTERVAL_SECONDS: int = 10
    CONVERSATION_STALE_MINUTES: int = 1440  # 24h — mark as stale
    CONVERSATION_DEAD_MINUTES: int = 10080  # 7 days — archive

    # Alerting
    WEBHOOK_ALERT_URL: str = ""
    ALERT_ON_ANGRY_USER: bool = True
    ALERT_ON_AI_CONFUSION: bool = True
    ALERT_ON_REPEATED_MESSAGES: bool = True
    ALERT_ON_ESCALATION: bool = True

    # Monitoring
    METRICS_ENABLED: bool = True
    METRICS_RETENTION_HOURS: int = 24

    # Human-style AI layer (multilingual) — make replies sound like a real
    # person instead of an AI. Can be overridden per-request via
    # behavior.humanStyle.
    HUMAN_STYLE_ENABLED: bool = True

    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
    }


settings = Settings()
