from enum import Enum


class AIProvider(str, Enum):
    """Supported AI providers."""
    DEEPSEEK = "deepseek"


class IntentType(str, Enum):
    """Intent types for affiliate lead conversations."""
    GREETING = "greeting"
    QUESTION = "question"
    LEAD_INTEREST = "lead_interest"
    SUPPORT = "support"
    PAYMENT = "payment"
    COMPLAINT = "complaint"
    SCHEDULE = "schedule"
    FOLLOW_UP = "follow_up"
    OTHER = "other"
