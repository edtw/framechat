"""
Orchestrator API — pipeline management, monitoring, and alerting endpoints.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings
from app.services.orchestrator import orchestrator, AlertSeverity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orchestrator", tags=["Orchestrator"])


@router.get("/health")
async def orchestrator_health():
    """Health check for the AI Orchestrator."""
    return orchestrator.get_health()


@router.get("/pipeline")
async def pipeline_summary():
    """Get pipeline summary — count of conversations per stage."""
    return {
        "success": True,
        "pipeline": orchestrator.get_pipeline_summary(),
    }


@router.get("/conversations")
async def list_conversations(
    stage: Optional[str] = Query(None, description="Filter by pipeline stage"),
    problematic: bool = Query(False, description="Only problematic conversations"),
):
    """List tracked conversations with optional stage/problematic filters."""
    conversations = orchestrator.get_all_conversations()

    if stage:
        conversations = [c for c in conversations if c.pipeline_stage.value == stage]
    if problematic:
        conversations = [
            c for c in conversations
            if c.angry_signals > 0 or c.confusion_signals > 0 or c.escalation_requested
        ]

    return {
        "success": True,
        "total": len(conversations),
        "conversations": [c.to_dict() for c in conversations],
    }


@router.get("/conversations/stale")
async def stale_conversations():
    """List conversations that need follow-up (stale)."""
    stale = orchestrator.find_stale_conversations()
    return {
        "success": True,
        "stale_count": len(stale),
        "conversations": [c.to_dict() for c in stale],
    }


@router.get("/alerts")
async def list_alerts(
    severity: Optional[str] = Query(None, description="Filter by severity"),
    limit: int = Query(50, ge=1, le=200),
):
    """List recent alerts with optional severity filter."""
    sev = AlertSeverity(severity) if severity else None
    alerts = orchestrator.get_alerts(severity=sev, limit=limit)
    return {
        "success": True,
        "total": len(alerts),
        "alerts": [
            {
                "severity": a.severity.value,
                "title": a.title,
                "message": a.message,
                "conversation": a.conversation_key,
                "timestamp": a.timestamp.isoformat(),
                "metadata": a.metadata,
            }
            for a in alerts
        ],
    }


@router.post("/conversations/{session_id}/{chat_jid}/takeover")
async def mark_takeover(session_id: str, chat_jid: str):
    """Mark a conversation as taken over by a human operator."""
    orchestrator.mark_operator_takeover(session_id, chat_jid)
    return {"success": True, "session_id": session_id, "chat_jid": chat_jid, "status": "taken_over"}


@router.post("/conversations/{session_id}/{chat_jid}/return")
async def mark_return(session_id: str, chat_jid: str):
    """Mark a conversation as returned to AI."""
    orchestrator.mark_operator_return(session_id, chat_jid)
    return {"success": True, "session_id": session_id, "chat_jid": chat_jid, "status": "returned_to_ai"}


@router.get("/metrics")
async def prometheus_metrics():
    """Export orchestrator metrics in Prometheus format."""
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(content=orchestrator.metrics.to_prometheus(), media_type="text/plain")
