from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.models.enums import AIProvider, IntentType


class Message(BaseModel):
    """Chat message model."""
    role: str = Field(..., description="Message role (user/assistant/system)")
    content: str = Field(..., description="Message content")


class ChatRequest(BaseModel):
    """Chat completion request."""
    message: str = Field(..., description="User message")
    session_id: Optional[str] = Field(None, description="WhatsApp session ID (one per connected number)")
    chat_jid: Optional[str] = Field(None, description="Chat JID — uniquely identifies the contact within a session")
    contact_name: Optional[str] = Field(None, description="Contact display name for alerts")
    contact_phone: Optional[str] = Field(None, description="Contact phone number for alerts")
    context: Optional[List[Message]] = Field(default=[], description="Conversation history")
    system_prompt: Optional[str] = Field(None, description="Custom system prompt")
    behavior: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Behavior/personality configuration",
    )
    knowledge_base: Optional[List[Dict[str, Any]]] = Field(
        default_factory=list,
        description="Knowledge base snippets to ground responses",
    )
    detect_intent: bool = Field(default=True, description="Enable intent detection")
    max_tokens: Optional[int] = Field(default=1000, description="Maximum tokens to generate")
    temperature: Optional[float] = Field(default=0.7, description="Temperature for generation")
    writing_signature: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Writing signature dict from /api/chat/analyze-signature — when provided, style traits are merged into the prompt to mirror this specific user's writing patterns",
    )
    self_signature: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Self writing signature — how the USER/operator writes. Used to generate replies in their voice.",
    )


class Intent(BaseModel):
    """Detected intent."""
    type: IntentType
    confidence: float = Field(..., ge=0.0, le=1.0)
    entities: Dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    """Chat completion response."""
    response: str = Field(..., description="AI generated response")
    provider: str = Field(..., description="Provider used")
    intent: Optional[Intent] = Field(None, description="Detected intent")
    tokens_used: Optional[int] = Field(None, description="Tokens used")
    cost_estimate: Optional[float] = Field(None, description="Estimated cost in USD")
    orchestrator: Optional[Dict[str, Any]] = Field(
        None,
        description="Orchestrator pipeline result (stage, alerts, follow-up) when session tracking is active",
    )
    burst_chunks: Optional[list[str]] = Field(
        None,
        description="Reply split into burst-sized chunks for natural multi-message sending",
    )


class IntentDetectionRequest(BaseModel):
    """Intent detection request."""
    message: str = Field(..., description="Message to analyze")


class IntentDetectionResponse(BaseModel):
    """Intent detection response."""
    intent: Intent
    suggested_actions: List[str] = Field(default_factory=list)


class AnalyzeSignatureRequest(BaseModel):
    """Request to analyze writing signature from messages."""
    messages: List[str] = Field(..., description="Message strings from a conversation to analyze")


class AnalyzeSignatureResponse(BaseModel):
    """Writing signature analysis result."""
    signature: Dict[str, Any] = Field(..., description="Writing-style trait analysis")
    message_count: int = Field(..., description="Number of valid messages analyzed")


class FollowUpRequest(BaseModel):
    """Follow-up message generation request."""
    lead_name: str = Field(..., description="Lead's name")
    pipeline_stage: str = Field(..., description="Current pipeline stage (e.g., EM_CONTATO)")
    days_since_last_contact: int = Field(..., description="Days since last contact")
    last_messages: List[Message] = Field(
        default_factory=list, description="Last few messages for conversation context"
    )
    sequence_step: str = Field("checkin_day3", description="Sequence step identifier")
    custom_instruction: Optional[str] = Field(
        None, description="Optional custom instruction for the follow-up"
    )


class FollowUpResponse(BaseModel):
    """Follow-up message generation response."""
    message: str = Field(..., description="Generated follow-up message in Portuguese")
    intent: str = Field(..., description="Follow-up intent (e.g., checkin, nudge, reactivate)")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score")


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    providers: Dict[str, bool]
    version: str


# ── Lead Scoring ──

class ScoreLeadRequest(BaseModel):
    """Lead scoring request — conversation messages + lead metadata."""
    conversation_messages: List[Message] = Field(
        ...,
        description="Last 20 messages of the conversation (role + content)",
    )
    lead_data: Dict[str, Any] = Field(
        default_factory=dict,
        description="Lead metadata: name, phone, stage, createdAt, source, etc.",
    )
    pipeline_stage: Optional[str] = Field(
        None,
        description="Current pipeline stage (EM_CONTATO, QUALIFICADO, CONVERTIDO, etc.)",
    )


class ScoreLeadFactors(BaseModel):
    """Per-factor scores for a lead (0-100)."""
    engagement: int = Field(..., ge=0, le=100)
    intent: int = Field(..., ge=0, le=100)
    urgency: int = Field(..., ge=0, le=100)
    sentiment: int = Field(..., ge=0, le=100)
    plan_interest: int = Field(..., ge=0, le=100)
    action_readiness: int = Field(..., ge=0, le=100)


class ScoreLeadResponse(BaseModel):
    """Lead scoring result returned by the AI."""
    score: int = Field(..., ge=0, le=100)
    factors: ScoreLeadFactors
    explanation: str = Field(..., description="1-2 sentence explanation in Portuguese (pt-BR)")
    recommended_action: str = Field(
        ...,
        description="send_link | follow_up | nurture | urgent | qualify",
    )
