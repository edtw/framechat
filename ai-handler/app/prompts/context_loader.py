"""
Smart Context Loader — Tiered compression for token economy.

Sending full conversation history to the AI burns tokens fast. A 50-message
context can easily exceed 3000 input tokens. This module provides a tiered
compression strategy:

    Tier 1 (last 5 messages)   — raw, untouched; recent context is critical.
    Tier 2 (messages 6–15)     — truncated to 100 chars each.
    Tier 3 (messages 16–30)    — aggregated into one-line summaries.
    Tier 4 (messages 31+)      — dropped; a short omission note inserted.

All heuristics are pure Python stdlib — no AI/LLM calls, no extra dependencies.
Designed to produce output compatible with the DeepSeek provider and the
AIManager, both of which consume ``list[dict]`` with ``role`` and ``content``.

Typical usage inside ``ai_manager.generate_response()``::

    from app.prompts.context_loader import build_context_for_ai, should_load_context

    if should_load_context(msg_count, hours_since):
        ctx = build_context_for_ai(
            recent_messages=conversation_messages,
            writing_signature=signature_dict,
            system_context=instructions or "",
            max_tokens=1200,
        )
        # ctx is list[dict] ready for DeepSeekProvider.generate_response(context=ctx)
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# How many most-recent messages are kept verbatim (tier 1).
_RAW_COUNT: int = 5

# How many messages after the raw window are truncated (tier 2).
_TRUNCATE_COUNT: int = 10  # positions [-(RAW+TRUNC) : -RAW]

# How many messages after truncation are summarised (tier 3).
_SUMMARISE_COUNT: int = 15  # positions [-(RAW+TRUNC+SUMM) : -(RAW+TRUNC)]

# Character cap per message in tier 2.
_TRUNCATE_CHARS: int = 100

# Portuguese omission marker (matching the project's pt-BR convention).
_OMISSION_NOTE: str = "[...conversa anterior omitida]"

# Section header labels (kept short to save tokens).
_HEADER_RECENT: str = "[Historico recente]"
_HEADER_TRUNCATED: str = "[Historico anterior]"
_HEADER_SUMMARY: str = "[Resumo antigo]"

# Minimum meaningful chars for a summary entry — skip noise.
_MIN_SUMMARY_CHARS: int = 15

# Regex to collapse extra whitespace.
_MULTISPACE_RE = re.compile(r"\s+")

# Sentence-ending punctuation for naive first-sentence extraction.
_SENTENCE_END_RE = re.compile(r"[.!?]\s")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _clean(text: str) -> str:
    """Collapse all whitespace sequences into single spaces and strip."""
    return _MULTISPACE_RE.sub(" ", text).strip()


def _first_sentence(text: str, max_chars: int = 80) -> str:
    """Extract the first sentence (or first *max_chars* chars) from *text*.

    Used for tier-3 summarisation to pick a representative gist of each
    message without embedding the full content.
    """
    text = _clean(text)
    if not text:
        return ""
    m = _SENTENCE_END_RE.search(text)
    if m:
        sentence = text[: m.start() + 1].strip()
        if len(sentence) >= 10:
            return sentence[:max_chars]
    # Fallback: first *max_chars* chars, breaking at a word boundary.
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars].rsplit(" ", 1)[0]
    return truncated + "…"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def estimate_tokens(text: str) -> int:
    """Rough token-count estimate for budget decisions.

    Uses ``word_count * 1.3`` — a 30 % overhead for punctuation, special
    characters, and sub-word tokenisation artefacts. Cheap enough to call
    inline before every request; accurate enough for capping context under
    a budget.

    Args:
        text: Any string (may be empty).

    Returns:
        Integer token estimate (never negative).
    """
    if not text or not isinstance(text, str):
        return 0
    return max(0, round(len(text.split()) * 1.3))


def compress_context(
    messages: list[dict],
    max_tokens: int = 800,
) -> str:
    """Compress a conversation into a compact, tiered string fitting within
    *max_tokens*.

    Compression tiers (counted from the **end** of the list; newest messages
    are preserved at the highest fidelity):

    +-----------------+--------------------------------------------+
    | Tier            | Behaviour                                  |
    +=================+============================================+
    | 1 (last 5)      | Kept raw / verbatim.                       |
    +-----------------+--------------------------------------------+
    | 2 (messages     | Truncated to 100 chars each, word-boundary.|
    |     6–15)       |                                            |
    +-----------------+--------------------------------------------+
    | 3 (messages     | Aggregated into one summary line per role  |
    |     16–30)      | ("user asked about X; assistant explained  |
    |                 |  Y").                                      |
    +-----------------+--------------------------------------------+
    | 4 (messages     | Dropped entirely; replaced with a single   |
    |     31+)        | omission note.                             |
    +-----------------+--------------------------------------------+

    The returned string uses Portuguese labels (matching the project's pt-BR
    convention) and lightweight section headers so the AI can distinguish
    recency tiers at a glance.

    Args:
        messages: Chronological list of message dicts, each with keys
            ``"role"`` (``"user"`` | ``"assistant"``) and ``"content"``.
        max_tokens: Hard ceiling on the estimated token count of the output
            string (enforced via progressive truncation after assembly).

    Returns:
        A compact string ready for injection into the AI context. Returns an
        empty string when *messages* is empty, not a list, or contains no
        valid entries.

    Edge cases handled:
        - ``None`` or non-list input — returns ``""``.
        - Empty list — returns ``""``.
        - Single message — returned raw, no section header.
        - Messages with missing ``content`` or ``role`` — silently skipped.
        - All messages beyond tier 4 — only the omission note is returned.
    """
    # ── Guard: type and emptiness ───────────────────────────────────────
    if not isinstance(messages, list):
        return ""
    if not messages:
        return ""

    # Filter to valid dicts with non-empty, non-whitespace content.
    valid: list[dict] = []
    for m in messages:
        if not isinstance(m, dict):
            continue
        role = m.get("role", "")
        content = m.get("content", "")
        if (
            role in ("user", "assistant")
            and content
            and isinstance(content, str)
            and content.strip()
        ):
            valid.append({"role": role, "content": _clean(content)})

    if not valid:
        return ""

    total = len(valid)

    # ── Tier boundary indices (counted from the end) ────────────────────
    raw_start = max(0, total - _RAW_COUNT)
    trunc_start = max(0, total - _RAW_COUNT - _TRUNCATE_COUNT)
    summ_start = max(0, total - _RAW_COUNT - _TRUNCATE_COUNT - _SUMMARISE_COUNT)
    # Messages at indices [0, summ_start) fall into tier 4 (dropped).

    sections: list[str] = []

    # ── Tier 1: Raw (most recent messages) ──────────────────────────────
    raw_msgs = valid[raw_start:]
    if raw_msgs:
        if total > _RAW_COUNT:
            sections.append(_HEADER_RECENT)
        for m in raw_msgs:
            label = "Usuario" if m["role"] == "user" else "Assistente"
            sections.append(f"{label}: {m['content']}")

    # ── Tier 2: Truncated ───────────────────────────────────────────────
    trunc_msgs = valid[trunc_start:raw_start]
    if trunc_msgs:
        sections.append(_HEADER_TRUNCATED)
        for m in trunc_msgs:
            label = "Usuario" if m["role"] == "user" else "Assistente"
            text = m["content"]
            if len(text) > _TRUNCATE_CHARS:
                text = text[:_TRUNCATE_CHARS].rsplit(" ", 1)[0] + "…"
            sections.append(f"{label}: {text}")

    # ── Tier 3: Summarised ──────────────────────────────────────────────
    summ_msgs = valid[summ_start:trunc_start]
    if summ_msgs:
        user_topics: list[str] = []
        asst_topics: list[str] = []
        for m in summ_msgs:
            topic = _first_sentence(m["content"], max_chars=70)
            if topic and len(topic) >= _MIN_SUMMARY_CHARS:
                if m["role"] == "user":
                    user_topics.append(topic)
                else:
                    asst_topics.append(topic)

        if user_topics or asst_topics:
            parts: list[str] = [_HEADER_SUMMARY]
            if user_topics:
                sample = user_topics[:5]
                joined = "; ".join(sample)
                parts.append(f"Usuario perguntou sobre: {joined}.")
            if asst_topics:
                sample = asst_topics[:5]
                joined = "; ".join(sample)
                parts.append(f"Assistente explicou: {joined}.")
            sections.append(" ".join(parts))

    # ── Tier 4: Omitted ─────────────────────────────────────────────────
    dropped_count = summ_start  # messages at indices [0, summ_start)
    if dropped_count > 0:
        sections.append(_OMISSION_NOTE)

    # ── Assemble and enforce token budget ───────────────────────────────
    result = "\n\n".join(sections)

    # Progressive truncation: if the result exceeds the budget, shrink the
    # truncated tier first, then the raw tier, then the summary section.
    while estimate_tokens(result) > max_tokens and len(result) > 80:
        if _HEADER_TRUNCATED in result:
            idx = result.rfind(_HEADER_TRUNCATED)
            if idx >= 0:
                tail = result[idx:]
                tail_lines = tail.split("\n")
                if len(tail_lines) > 2:
                    result = result[:idx] + "\n".join(tail_lines[:-1])
                else:
                    result = result[:idx].rstrip()
            continue
        elif _HEADER_RECENT in result:
            idx = result.rfind(_HEADER_RECENT)
            if idx >= 0:
                tail = result[idx:]
                tail_lines = tail.split("\n")
                if len(tail_lines) > 2:
                    result = result[:idx] + "\n".join(tail_lines[:-1])
                else:
                    result = result[:idx].rstrip()
            continue
        elif _HEADER_SUMMARY in result:
            idx = result.rfind(_HEADER_SUMMARY)
            if idx >= 0:
                result = result[:idx].rstrip()
            continue
        else:
            # Last resort: halve the result at a word boundary.
            words = result.split()
            half = len(words) // 2
            result = " ".join(words[:half]) + "…"
            break

    return result.strip()


def build_context_for_ai(
    recent_messages: list[dict],
    writing_signature: dict | None = None,
    system_context: str = "",
    max_tokens: int = 1200,
) -> list[dict]:
    """Build a final context list ready for the AI provider.

    Produces a ``list[dict]`` with ``role`` / ``content`` keys suitable for
    passing as ``context`` to ``DeepSeekProvider.generate_response()``. The
    list is ordered so the model sees system-level instructions first, then
    the compressed conversation history as a labelled user-perspective block.

    Composition (in order):

    1. **System message** — *system_context* kept as-is, with the writing
       signature directive appended when available and meaningful (>= 3
       messages analysed). The signature directive adds roughly 50–100
       tokens.
    2. **History message** (``role: "user"``) — the compressed conversation
       history from ``compress_context()``, so the model sees prior turns
       without burning tokens on verbatim repetition.
    3. **Token budget** — if the combined system + history estimate exceeds
       *max_tokens*, the system message is trimmed first (keeping its tail
       where the most actionable instructions typically reside), then the
       history is re-compressed to fit the remaining budget.

    Args:
        recent_messages: Chronological conversation messages (same format
            as ``compress_context``).
        writing_signature: Dict from ``analyze_writing_signature()``, or
            ``None``. Only applied when ``message_count >= 3``.
        system_context: The composed system prompt / instructions string.
            Pass ``""`` when the caller handles the system prompt separately.
        max_tokens: Hard ceiling on the total estimated token count for the
            entire returned context list.

    Returns:
        A ``list[dict]`` where each dict has ``role`` and ``content`` keys.
        Never ``None`` — returns an empty list when there is nothing to
        load.

        Typical return shape::

            [
                {"role": "system", "content": "<system_context + style>"},
                {"role": "user",   "content": "<compressed history>"},
            ]

        When both *system_context* and *recent_messages* are empty the
        result is ``[]``.
    """
    # Guard: non-list messages.
    if not isinstance(recent_messages, list):
        recent_messages = []

    # ── System message ──────────────────────────────────────────────────
    sys_parts: list[str] = []

    if system_context and isinstance(system_context, str):
        sys_parts.append(system_context.strip())

    # Writing signature directive (~50-100 tokens).
    if writing_signature and isinstance(writing_signature, dict):
        if writing_signature.get("message_count", 0) >= 3:
            # Local import avoids circular dependency at module level.
            from app.prompts.writing_signature import signature_to_directive  # noqa: E402

            sig_directive = signature_to_directive(writing_signature)
            if sig_directive:
                sys_parts.append(sig_directive)

    system_content = "\n\n".join(sys_parts).strip() if sys_parts else ""

    # ── Compressed history ──────────────────────────────────────────────
    sys_tokens = estimate_tokens(system_content) if system_content else 0
    history_budget = max(0, max_tokens - sys_tokens)
    history_content = ""
    if recent_messages and history_budget > 0:
        history_content = compress_context(recent_messages, max_tokens=history_budget)

    # ── Enforce total token budget ──────────────────────────────────────
    hist_tokens = estimate_tokens(history_content) if history_content else 0

    if sys_tokens + hist_tokens > max_tokens and sys_tokens > 0:
        # Cap system at 40 % of budget, give the rest to history.
        sys_budget = int(max_tokens * 0.40)
        if sys_tokens > sys_budget:
            words = system_content.split()
            target = max(1, int(sys_budget / 1.3))
            if target < len(words):
                system_content = " ".join(words[-target:])
                sys_tokens = estimate_tokens(system_content)

        history_budget = max(0, max_tokens - sys_tokens)
        if hist_tokens > history_budget:
            history_content = compress_context(recent_messages, max_tokens=history_budget)

    # ── Assemble ────────────────────────────────────────────────────────
    result: list[dict] = []
    if system_content:
        result.append({"role": "system", "content": system_content})
    if history_content:
        result.append({"role": "user", "content": history_content})

    return result


def should_load_context(
    conversation_message_count: int,
    hours_since_last_message: float,
) -> bool:
    """Decide whether it is worth loading conversation context.

    Saves tokens by short-circuiting when context would not meaningfully
    improve the AI response.

    Args:
        conversation_message_count: Total number of messages in the
            conversation so far (including the current incoming message).
        hours_since_last_message: Time elapsed since the most recent
            message was sent. Use 0.0 for real-time conversations.

    Returns:
        ``True`` when there is enough history to compress and the
        conversation is still active. ``False`` otherwise.

    The heuristics (all must be satisfied):

        * ``conversation_message_count > 1`` — a single message means first
          contact; nothing to load.
        * ``hours_since_last_message <= 72.0`` — conversations idle for more
          than 3 days are considered cold; loading stale context wastes
          tokens without improving response quality.
    """
    # Type / sanity guards.
    if not isinstance(conversation_message_count, int) or conversation_message_count < 0:
        return False
    if not isinstance(hours_since_last_message, (int, float)) or hours_since_last_message < 0:
        return False

    # First contact — nothing to compress.
    if conversation_message_count <= 1:
        return False

    # Conversation went cold — context is stale.
    if hours_since_last_message > 72.0:
        return False

    return True


__all__ = [
    "compress_context",
    "estimate_tokens",
    "build_context_for_ai",
    "should_load_context",
]
