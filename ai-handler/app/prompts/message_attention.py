"""
Message Attention Module — burst-aware social media conversation handling.

On Discord/WhatsApp, people write in rapid bursts:
  "oi" -> "queria saber uma coisa" -> "sobre o revolut"

These are 3 separate messages, NOT one paragraph. They arrive within 2-3
seconds of each other, each is an incomplete fragment, and together they form
a complete thought.

The current pipeline joins buffered messages with ``\\n``, losing the burst
structure. The AI sees ``"oi\\nqueria saber uma coisa\\nsobre o revolut"``
which reads like a formal paragraph, not rapid-fire chat.

This module fixes that by:

1. Detecting burst patterns from message timestamps and content.
2. Formatting inbound messages so the AI preserves their social-media nature.
3. Splitting long outgoing replies into natural burst-sized chunks.
4. Deciding whether to mirror a partner's burst-sending pattern.

Pure Python stdlib. No external dependencies.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Sentence boundary regex — matches sentence-ending punctuation followed by
# whitespace (or end-of-string). Handles Portuguese and English conventions.
# ---------------------------------------------------------------------------
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?…])\s+")

# ---------------------------------------------------------------------------
# Words that, when starting a message, strongly suggest it continues a
# previous message rather than starting a new independent thought.
# ---------------------------------------------------------------------------
_CONTINUATION_STARTERS: set[str] = {
    # Portuguese — prepositions and connectors that carry a thought forward
    "sobre", "pra", "pro", "para", "com", "sem", "porque", "pq",
    "tipo", "assim", "tipo assim", "que", "de", "da", "do", "das", "dos",
    "na", "no", "nas", "nos", "em", "pelo", "pela", "pelos", "pelas",
    "ou", "e", "mas", "também", "tambem", "tb", "tbm", "aí", "ai",
    "exemplo", "igual", "tipo o", "tipo a", "que nem",
    "quando", "onde", "como", "quem", "qual", "quais",
    "disso", "daquilo", "nesse", "nessa", "neste", "nesta",
    "desse", "dessa", "deste", "desta", "daquela", "daquele",
    "então", "entao", "depois", "antes", "durante",
    # English — prepositions and linking words
    "about", "for", "with", "without", "because", "like", "so",
    "of", "from", "to", "in", "on", "at", "by", "or", "and",
    "but", "also", "especially", "particularly", "specifically",
    "when", "where", "how", "who", "which", "that", "if",
    "maybe", "probably", "i think", "i mean", "you know",
    "regarding", "about that", "like the", "stuff like",
}

# ---------------------------------------------------------------------------
# Topic-shift / clause-boundary markers useful for splitting outgoing replies
# into natural burst chunks at sensible break points.
# ---------------------------------------------------------------------------
_TOPIC_BREAK_MARKERS: set[str] = {
    # Portuguese
    "mas", "porém", "por outro lado", "aliás", "alias",
    "ah", "outra coisa", "falando nisso", "mudando de assunto",
    "a propósito", "inclusive", "só que", "so que",
    "lembrando que", "lembrando", "ah e", "e aí", "e ai",
    "enfim", "resumindo", "basicamente", "no final",
    "daí", "dai", "aí", "ai", "depois", "antes",
    # English
    "but", "however", "on the other hand", "by the way", "btw",
    "also", "another thing", "speaking of", "anyway", "anyways",
    "oh", "oh and", "plus", "so anyway", "so yeah",
    "basically", "honestly", "tbh", "ngl", "fr",
}

# ---------------------------------------------------------------------------
# Portuguese sentence-final abbreviations that contain a period but should
# NOT be treated as sentence boundaries (e.g. "Sr.", "Dr.", "etc.").
# ---------------------------------------------------------------------------
_ABBREVIATIONS_PT: set[str] = {
    "sr", "sra", "dr", "dra", "prof", "profa", "etc",
    "ex", "v", "vs", "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _clean_message(msg: str) -> str:
    """Strip whitespace and return the message, or empty string."""
    if not isinstance(msg, str):
        return ""
    return msg.strip()


def _ends_with_sentence_punctuation(text: str) -> bool:
    """Check if *text* ends with a sentence-ending punctuation mark."""
    if not text:
        return False
    return text.rstrip()[-1] in ".!?…"


def _starts_with_continuation(text: str) -> bool:
    """Check if *text* starts like a continuation of a previous thought."""
    if not text:
        return False
    lowered = text.lower().strip()
    first_word = lowered.split()[0] if lowered.split() else ""
    first_two = " ".join(lowered.split()[:2]) if len(lowered.split()) >= 2 else first_word
    first_three = " ".join(lowered.split()[:3]) if len(lowered.split()) >= 3 else first_two
    return (
        first_word in _CONTINUATION_STARTERS
        or first_two in _CONTINUATION_STARTERS
        or first_three in _CONTINUATION_STARTERS
    )


def _word_count(text: str) -> int:
    """Count words in *text* (splits on whitespace)."""
    return len(text.split()) if text and text.strip() else 0


# Minimal stopword set for content-overlap purposes. We deliberately keep
# this very small — only articles, basic pronouns, and copula verbs that
# carry zero topical meaning. Content-bearing verbs (queria, saber, fazer)
# and topic words (sobre, conta, dinheiro) are intentionally NOT filtered so
# that short burst messages can still register content overlap with each
# other. This is the opposite of what a search-engine stopword list would do;
# we WANT "sobre o revolut" and "revolut é bom" to show overlap on "revolut".
_OVERLAP_STOPWORDS: set[str] = {
    # Articles and determiners (pt + en)
    "o", "a", "os", "as", "um", "uma", "uns", "umas",
    "the", "a", "an",
    # Basic pronouns
    "eu", "tu", "ele", "ela", "nós", "nos", "eles", "elas",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
    # Copula / aux in common short forms
    "é", "foi", "era", "está", "esta", "são", "ser", "estou", "tô", "to",
    "is", "was", "are", "were", "be", "been", "am",
    # Generic deictics
    "isso", "isto", "aquilo", "esse", "essa", "este", "esta", "aquele", "aquela",
    "this", "that", "these", "those",
    # Common conjunctions (only the purely grammatical ones)
    "e", "ou", "que", "se", "nem",
    "and", "or",
}

# Short-greeting patterns that signal the start of a conversational turn.
# When message N is a short greeting and message N+1 is substantive content,
# that is a strong flow signal — the greeting naturally precedes the point.
_SHORT_GREETINGS: set[str] = {
    "oi", "oii", "oiii", "oie", "olá", "ola", "hey", "heyy", "heyyy",
    "hi", "hii", "hiii", "hello", "yo", "eae", "iae", "eai", "salve",
    "coe", "fala", "opa", "sup", "bom", "boa",
}


def _content_overlap(a: str, b: str) -> float:
    """Compute Jaccard-like word overlap between two strings.

    Returns a value between 0.0 (no shared content words) and 1.0 (all
    content words shared). Only minimal grammatical stopwords and very
    short words (<2 chars) are excluded — content-bearing words like
    "queria", "saber", "sobre", "revolut" are deliberately retained so
    that short burst messages can register topical overlap.
    """
    words_a = {
        w.lower() for w in a.split()
        if len(w) >= 2 and w.lower() not in _OVERLAP_STOPWORDS
    }
    words_b = {
        w.lower() for w in b.split()
        if len(w) >= 2 and w.lower() not in _OVERLAP_STOPWORDS
    }
    if not words_a and not words_b:
        return 0.0
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    union = words_a | words_b
    return len(intersection) / len(union)


def _is_short_greeting(text: str) -> bool:
    """Check if *text* is essentially just a greeting (<= 10 chars, greeting word)."""
    cleaned = text.strip().lower()
    if len(cleaned) > 10:
        return False
    # Match whole greeting or first-word greeting (e.g. "oi" or "oi tudo")
    first_word = cleaned.split()[0] if cleaned.split() else cleaned
    return first_word in _SHORT_GREETINGS


def _split_sentences(text: str) -> list[str]:
    """Split *text* into sentences on sentence-ending punctuation.

    Handles Portuguese abbreviations (e.g. "Sr.", "etc.") that should not
    be treated as boundaries. Returns a list of sentence strings with
    trailing punctuation preserved.

    Edge cases:
        - Empty string returns [].
        - Single-word text returns [text].
        - Text with no sentence-ending punctuation returns [text].
    """
    if not text or not text.strip():
        return []

    # Split on sentence-ending punctuation followed by whitespace.
    # We use a lookbehind approach: find all split points, extract segments.
    segments: list[str] = []
    last_end = 0

    for match in _SENTENCE_SPLIT_RE.finditer(text):
        pos = match.start()
        sep = match.group()

        # Check if the period before the split is part of an abbreviation.
        before = text[last_end:pos + 1].rstrip()
        if before:
            last_word = before.split()[-1] if before.split() else ""
            last_word_clean = last_word.rstrip(".!?…").lower()
            if last_word.endswith(".") and last_word_clean in _ABBREVIATIONS_PT:
                # This period is an abbreviation, not a sentence boundary.
                # Skip this split — it will be absorbed into the current segment.
                continue

        segment = text[last_end : pos + 1]  # include the punctuation
        stripped = segment.strip()
        if stripped:
            segments.append(stripped)
        last_end = match.end()

    # Remainder after last sentence-ending punctuation
    remainder = text[last_end:].strip()
    if remainder:
        segments.append(remainder)

    # If no splits were found, return the whole text as one sentence.
    if not segments:
        return [text.strip()]

    return segments


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def analyze_burst(messages: list[dict]) -> dict:
    """Analyze a list of timestamped messages for burst patterns.

    A "burst" is a sequence of messages sent in rapid succession, typical
    of WhatsApp/Discord where people type and send fragments quickly::

        "oi" -> "queria saber uma coisa" -> "sobre o revolut"

    Each message dict is expected to have at minimum ``content`` (str) and
    ``timestamp`` (float/int, Unix seconds). Messages with missing or empty
    content are silently skipped; messages with missing timestamps are
    treated as having timestamp=0.

    Args:
        messages: List of message dicts, each with at least:
            - ``content`` (str): The message text.
            - ``timestamp`` (float|int): Unix timestamp in seconds.

    Returns:
        A dict with the following keys:

        - ``burst`` (bool): True if these messages form a rapid burst
          (every consecutive pair is within 3 seconds).
        - ``burst_size`` (int): Number of messages in the detected burst
          (0 if no messages).
        - ``avg_interval_ms`` (float): Average gap between consecutive
          messages, in milliseconds. 0.0 for a single message.
        - ``is_fragmented_thought`` (bool): True when the messages look
          like fragments of a single idea being typed out in real time.
        - ``primary_intent`` (str): The complete thought assembled from
          the fragments. For non-fragmented messages this is simply the
          concatenation of all messages.
        - ``total_span_ms`` (float): Total time span from first to last
          message, in milliseconds.

    Edge cases:
        - Empty list: ``burst=False``, ``burst_size=0``, neutral defaults.
        - Single message: ``burst=False``, ``burst_size=1``,
          ``is_fragmented_thought=False``, ``primary_intent`` is the message.
        - Missing timestamps: treated as 0.
        - Non-dict items: skipped.
    """
    # Filter and normalize
    valid: list[dict] = []
    for m in messages:
        if not isinstance(m, dict):
            continue
        content = _clean_message(m.get("content", ""))
        if not content:
            continue
        ts = m.get("timestamp")
        if ts is None:
            ts = 0.0
        valid.append({"content": content, "timestamp": float(ts)})

    n = len(valid)

    if n == 0:
        return {
            "burst": False,
            "burst_size": 0,
            "avg_interval_ms": 0.0,
            "is_fragmented_thought": False,
            "primary_intent": "",
            "total_span_ms": 0.0,
        }

    if n == 1:
        return {
            "burst": False,
            "burst_size": 1,
            "avg_interval_ms": 0.0,
            "is_fragmented_thought": False,
            "primary_intent": valid[0]["content"],
            "total_span_ms": 0.0,
        }

    # Compute intervals between consecutive messages
    timestamps = [m["timestamp"] for m in valid]
    intervals_ms: list[float] = []
    for i in range(1, n):
        delta_s = timestamps[i] - timestamps[i - 1]
        # Treat negative deltas (out-of-order) as 0
        intervals_ms.append(max(0.0, delta_s * 1000.0))

    total_span_ms = (timestamps[-1] - timestamps[0]) * 1000.0
    if total_span_ms < 0:
        total_span_ms = 0.0

    avg_interval_ms = sum(intervals_ms) / len(intervals_ms) if intervals_ms else 0.0

    # Burst detection: ALL consecutive messages must be within 3 seconds.
    max_interval_ms = max(intervals_ms) if intervals_ms else 0.0
    burst = n >= 2 and max_interval_ms <= 3000.0

    # ── Fragmented thought detection ──
    # A fragmented thought is a burst where:
    #   1. Each individual message is short (<100 chars).
    #   2. Most messages do NOT end with sentence-ending punctuation.
    #   3. Total span is under 5 seconds (rapid typing).
    #   4. Content flows across messages: consecutive messages either
    #      share content words, or the second message starts with a
    #      continuation word (preposition, connector).
    is_fragmented: bool = False

    if burst and n >= 2:
        # Criterion 1: all messages short
        all_short = all(len(m["content"]) < 100 for m in valid)

        # Criterion 2: most messages lack sentence-final punctuation
        ending_count = sum(1 for m in valid if _ends_with_sentence_punctuation(m["content"]))
        mostly_unterminated = ending_count <= n // 2  # at most half end with punctuation

        # Criterion 3: total span under 5 seconds
        rapid = total_span_ms <= 5000.0

        # Criterion 4: content flows across messages.
        # We score each consecutive pair on how strongly the second message
        # continues/refines the first. Multiple weak signals can add up.
        flow_score = 0.0
        flow_pairs = 0
        for i in range(1, n):
            prev = valid[i - 1]["content"]
            curr = valid[i]["content"]
            overlap = _content_overlap(prev, curr)
            starts_cont = _starts_with_continuation(curr)
            greeting_flow = _is_short_greeting(prev)
            # progressively_more_specific: each message longer than the last
            prog_specific = len(curr) > len(prev)

            pair_score = 0.0
            if overlap > 0.0:
                pair_score += 0.5
            if overlap > 0.2:
                pair_score += 0.3  # bonus for strong overlap
            if starts_cont:
                pair_score += 0.3
            if greeting_flow:
                pair_score += 0.3  # short greeting → content = natural flow
            if prog_specific:
                pair_score += 0.1  # getting more detailed = fragment pattern

            flow_score += pair_score
            flow_pairs += 1

        avg_flow = flow_score / flow_pairs if flow_pairs > 0 else 0.0
        # Low threshold (0.2): even one weak signal per pair is enough when
        # combined with the other criteria (short, unterminated, rapid).
        content_flows = avg_flow >= 0.2

        is_fragmented = all_short and mostly_unterminated and rapid and content_flows

    # ── Primary intent assembly ──
    # For fragmented thoughts: join messages with spaces, clean up
    # duplicate words at boundaries (e.g. "...revolut" + "revolut é...").
    # For non-fragmented: simple space-join.
    if is_fragmented:
        parts: list[str] = []
        for m in valid:
            content = m["content"]
            if parts:
                # Check for overlapping words at the boundary
                prev_words = parts[-1].split()
                curr_words = content.split()
                if prev_words and curr_words:
                    # Remove leading words from current that duplicate
                    # trailing words from previous
                    overlap_len = 0
                    max_check = min(len(prev_words), len(curr_words))
                    for k in range(1, max_check + 1):
                        prev_tail = " ".join(prev_words[-k:]).lower()
                        curr_head = " ".join(curr_words[:k]).lower()
                        if prev_tail == curr_head:
                            overlap_len = k
                    if overlap_len > 0:
                        content = " ".join(curr_words[overlap_len:])
                parts.append(content)
            else:
                parts.append(content)
        primary_intent = " ".join(p for p in parts if p)
    else:
        primary_intent = " ".join(m["content"] for m in valid)

    return {
        "burst": burst,
        "burst_size": n,
        "avg_interval_ms": round(avg_interval_ms, 1),
        "is_fragmented_thought": is_fragmented,
        "primary_intent": primary_intent,
        "total_span_ms": round(total_span_ms, 1),
    }


def format_burst_context(messages: list[dict]) -> str:
    """Format inbound messages for the AI with burst-awareness preserved.

    When messages arrive as a burst, they are formatted to show their
    temporal structure — the AI sees that these are rapid-fire fragments,
    not a single formal paragraph. When messages are NOT a burst (single
    message, or slow multi-message), they are formatted as normal.

    Args:
        messages: List of message dicts, each with ``content`` (str) and
            ``timestamp`` (float/int, Unix seconds).

    Returns:
        A formatted string ready to inject into the AI system/user prompt.

        **Non-burst (normal message)**::

            [Mensagem]: oi queria saber sobre o revolut

        **Burst (rapid fragments)**::

            [RÁPIDO - 3 mensagens em 2.8s]:
            ─ 0.0s: oi
            ─ 1.3s: queria saber uma coisa
            ─ 2.8s: sobre o revolut
            [Interpretação: o usuário está perguntando sobre o Revolut de forma casual e fragmentada]

        **Slow multi-message (not a burst)**::

            [2 mensagens com intervalo de 12.5s]:
            [1] oi tudo bem?
            [2] queria saber sobre o revolut

    Edge cases:
        - Empty list: returns ``"[Sem mensagens]"``.
        - Single message: returns standard ``[Mensagem]: ...`` format.
        - Messages without timestamps: treated as timestamp=0.
    """
    # Filter valid messages
    valid: list[dict] = []
    for m in messages:
        if not isinstance(m, dict):
            continue
        content = _clean_message(m.get("content", ""))
        if not content:
            continue
        ts = m.get("timestamp")
        if ts is None:
            ts = 0.0
        valid.append({"content": content, "timestamp": float(ts)})

    if not valid:
        return "[Sem mensagens]"

    # Analyze
    analysis = analyze_burst(valid)

    is_burst = analysis["burst"]
    is_fragmented = analysis["is_fragmented_thought"]
    primary_intent = analysis["primary_intent"]

    if not is_burst:
        # Single message: standard format
        if len(valid) == 1:
            return f"[Mensagem]: {valid[0]['content']}"

        # Multiple messages but not a burst (slow replies)
        total_span_s = analysis["total_span_ms"] / 1000.0
        avg_s = analysis["avg_interval_ms"] / 1000.0
        lines: list[str] = [
            f"[{len(valid)} mensagens com intervalo médio de {avg_s:.1f}s]:"
        ]
        for i, m in enumerate(valid, start=1):
            lines.append(f"[{i}] {m['content']}")
        return "\n".join(lines)

    # Burst detected — format with temporal structure
    burst = analysis
    base_ts = valid[0]["timestamp"]
    total_span_s = burst["total_span_ms"] / 1000.0

    header = (
        f"[RÁPIDO - {burst['burst_size']} mensagens em "
        f"{total_span_s:.1f}s]:"
    )
    lines = [header]
    for m in valid:
        rel_s = m["timestamp"] - base_ts
        lines.append(f"─ {rel_s:.1f}s: {m['content']}")

    # Add interpretation if fragmented
    if is_fragmented:
        lines.append(
            f"[Interpretação: o usuário está se expressando de forma "
            f"casual e fragmentada — '{primary_intent}']"
        )

    return "\n".join(lines)


def format_outgoing_burst(reply: str) -> list[str]:
    """Split an AI reply into natural burst-sized chunks for sending.

    On WhatsApp/Discord, real people rarely send long single messages.
    They send 2-3 short messages in quick succession. This function breaks
    a long AI reply into chunks that feel like a real person tapping out
    messages on their phone.

    Splitting rules:
        - Reply < 200 chars: keep as single message.
        - Reply 200-600 chars: split into 2-3 short messages.
        - Reply > 600 chars: split into 3+ messages.
        - Break at natural pause points: sentence boundaries first, then
          clause boundaries (commas before topic-shift words).
        - Never split mid-sentence unless a single sentence exceeds 300
          chars (then split at the best available comma/clause boundary).
        - Each chunk should be 50-250 chars to feel like a real person.

    Args:
        reply: The full AI-generated reply text.

    Returns:
        A list of message strings to send sequentially. Empty reply returns
        ``[""]``. A short reply returns a single-element list.

    Edge cases:
        - Empty/whitespace-only: returns ``[""]``.
        - Single short sentence: returns ``[reply]``.
        - Very long single sentence (>350 chars): split at commas or
          natural pause points, with a trailing "…" only when the sentence
          truly continues (never mid-word).
        - Reply with multiple paragraphs: breaks at paragraph boundaries
          when those align with chunk size targets.
    """
    cleaned = reply.strip()
    if not cleaned:
        return [""]

    # Short reply — no splitting needed
    if len(cleaned) < 200:
        return [cleaned]

    # Split into sentences
    sentences = _split_sentences(cleaned)

    # If we couldn't split (one big blob), try to split at commas or
    # topic-shift markers within the text.
    if len(sentences) <= 1 and len(cleaned) > 350:
        sentences = _split_long_sentence(cleaned)

    # If still a single sentence and it's long, we keep it as one message
    # rather than splitting arbitrarily.
    if len(sentences) <= 1:
        return [cleaned]

    # Group sentences into chunks of roughly 100-250 chars
    chunks = _group_into_chunks(sentences, min_chunk=80, max_chunk=250)

    # If grouping produced only one chunk and it's long, force-split at
    # the best available break point.
    if len(chunks) == 1 and len(chunks[0]) > 350:
        chunks = _force_split_long_chunk(chunks[0])

    return chunks


def should_send_as_burst(
    reply: str,
    partner_signature: dict | None = None,
) -> bool:
    """Decide whether a reply should be sent as multiple rapid messages.

    Uses two sources of signal:
        1. Partner's writing signature — if they write in short bursts,
           mirror their pattern.
        2. Reply characteristics — long conversational replies benefit
           from being split; formal/structured replies don't.

    Args:
        reply: The AI-generated reply text to send.
        partner_signature: Optional writing-signature dict (from
            ``writing_signature.analyze_writing_signature()``) describing
            how the conversation partner writes. Used to detect burst
            writers and mirror their style.

    Returns:
        True if the reply should be split into 2+ messages and sent
        rapidly (with small delays between them). False if it should be
        sent as a single message.

    Decision logic:
        | Condition                                                | Result |
        |----------------------------------------------------------|--------|
        | Reply < 60 chars (any partner)                           | False  |
        | Reply < 150 chars (no bursty partner)                    | False  |
        | Partner writes in bursts (avg < 6 words, casual) AND >60 | True   |
        | Partner is very casual (formality < 0.3) AND reply >250  | True   |
        | Partner writes short (avg < 10 words) AND reply >200     | True   |
        | Reply is long (>400 chars) AND conversational            | True   |
        | No partner data AND reply < 350 chars                    | False  |
        | No partner data AND reply is multi-paragraph (>250 chars) | True   |

    Edge cases:
        - Empty reply: False.
        - ``partner_signature`` is None: uses reply-only heuristics.
        - ``partner_signature`` with ``message_count < 3``: treated as
          no partner data (insufficient signal).
    """
    cleaned = reply.strip()
    if not cleaned:
        return False

    # ── Partner signature signal ──
    partner_has_signal = (
        partner_signature
        and partner_signature.get("message_count", 0) >= 3
    )
    partner_avg_words = partner_signature.get("avg_words_per_message", 99) if partner_signature else 99
    partner_formality = partner_signature.get("formality_score", 0.5) if partner_signature else 0.5
    partner_punct = partner_signature.get("punctuation_style", "standard") if partner_signature else "standard"

    # Partner writes in very short bursts — use a lower length guard.
    # Even a ~100-char reply feels long to someone who writes 4-word messages.
    partner_is_bursty = (
        partner_has_signal
        and partner_avg_words <= 6
        and partner_formality <= 0.35
        and partner_punct == "minimal"
    )

    # Length guard: very short replies never get split, but the threshold
    # is lower when the partner clearly writes in bursts.
    min_length = 60 if partner_is_bursty else 150
    if len(cleaned) < min_length:
        return False

    # ── Partner signature signal (continued) ──
    if partner_has_signal:
        # Partner writes in bursts (very short messages, casual, minimal punct)
        if partner_is_bursty:
            return True

        # Partner is very casual — mirror them
        if partner_formality <= 0.3 and len(cleaned) > 250:
            return True

        # Partner writes short messages — splitting keeps the rhythm
        if partner_avg_words <= 10 and len(cleaned) > 200:
            return True

    # ── Reply-only heuristics (no partner data or weak signal) ──

    sentence_count = len(_split_sentences(cleaned))

    # Many short sentences (>3) in a >200-char reply = conversational burst
    if sentence_count >= 3 and len(cleaned) > 200:
        return True

    # Long conversational reply with multiple sentences
    if sentence_count >= 2 and len(cleaned) > 400:
        return True

    # Multi-paragraph replies are natural burst candidates
    if "\n\n" in cleaned and len(cleaned) > 250:
        return True

    # Short-to-moderate reply with no strong burst signals
    if len(cleaned) <= 400:
        return False

    # Default: long enough to consider splitting
    return True


# ---------------------------------------------------------------------------
# Internal: sentence splitting helpers
# ---------------------------------------------------------------------------


def _split_long_sentence(text: str) -> list[str]:
    """Split a long single-sentence text at the best available break points.

    Tries to find clause boundaries signaled by:
        1. Comma + topic-shift word (e.g. ", mas", ", but", ", só que").
        2. Comma followed by a new independent clause feel.
        3. Semicolons.
        4. Em-dashes (—) when used as clause separators.
        5. Plain commas as a last resort.

    Never splits inside quoted text, parentheses, or mid-phrase.

    Args:
        text: A long text without sentence-ending punctuation.

    Returns:
        List of text segments. If no good break point is found, returns
        the original text as a single-element list.
    """
    if not text or len(text) <= 200:
        return [text] if text else []

    # Priority 1: comma + topic-shift word
    pattern_shift = re.compile(
        r",\s+(?=" + "|".join(re.escape(w) for w in sorted(_TOPIC_BREAK_MARKERS, key=len, reverse=True)) + r"\b)",
        re.IGNORECASE,
    )
    segments = _split_at_pattern(text, pattern_shift, keep_separator_prefix=True)
    if len(segments) > 1:
        return [s.strip() for s in segments if s.strip()]

    # Priority 2: semicolons
    if ";" in text:
        segments = text.split(";")
        if len(segments) > 1:
            # Rejoin small trailing fragments
            return _rebalance_segments([s.strip() + ";" for s in segments[:-1]] + [segments[-1].strip()])

    # Priority 3: em-dashes as separators
    if "—" in text:
        segments = text.split("—")
        if len(segments) > 1:
            return _rebalance_segments(
                [s.strip() + "—" for s in segments[:-1]] + [segments[-1].strip()]
            )

    # Priority 4: plain commas (only if the text is very long)
    if len(text) > 350 and text.count(",") >= 2:
        segments = text.split(",")
        if len(segments) > 2:
            return _rebalance_segments(
                [s.strip() + "," for s in segments[:-1]] + [segments[-1].strip()]
            )

    return [text]


def _split_at_pattern(
    text: str,
    pattern: re.Pattern,
    keep_separator_prefix: bool = False,
) -> list[str]:
    """Split *text* at each match of *pattern*, optionally keeping the
    matched separator at the start of the next segment."""
    segments: list[str] = []
    last_end = 0
    for match in pattern.finditer(text):
        segments.append(text[last_end : match.start()])
        if keep_separator_prefix:
            last_end = match.start() + 1  # skip the comma, keep the space+word
        else:
            last_end = match.end()
    segments.append(text[last_end:])
    return segments


def _rebalance_segments(segments: list[str]) -> list[str]:
    """Merge very short trailing segments into the preceding one so each
    chunk is at least 40 chars (or we accept a small final chunk)."""
    if len(segments) <= 1:
        return segments

    result: list[str] = []
    for seg in segments:
        seg = seg.strip()
        if not seg:
            continue
        if result and len(seg) < 40:
            result[-1] = result[-1] + " " + seg
        else:
            result.append(seg)

    return result


def _group_into_chunks(
    sentences: list[str],
    min_chunk: int = 80,
    max_chunk: int = 250,
) -> list[str]:
    """Group *sentences* into chunks of roughly *min_chunk* to *max_chunk*
    characters.

    Walks through sentences greedily: adds sentences to the current chunk
    until adding another would exceed max_chunk, then starts a new chunk.
    If a single sentence exceeds max_chunk, it becomes its own chunk
    (callers should pre-split long sentences).

    Args:
        sentences: List of sentence strings.
        min_chunk: Preferred minimum characters per chunk.
        max_chunk: Hard maximum — no chunk exceeds this unless a single
            sentence does.

    Returns:
        List of chunk strings.
    """
    if not sentences:
        return [""]

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for sentence in sentences:
        s_len = len(sentence)

        # If this sentence alone exceeds max, finalize current and start new
        if s_len > max_chunk:
            if current:
                chunks.append(" ".join(current))
                current = []
                current_len = 0
            chunks.append(sentence)
            continue

        # If adding this sentence would exceed max, finalize current
        if current and current_len + 1 + s_len > max_chunk:
            chunks.append(" ".join(current))
            current = []
            current_len = 0

        current.append(sentence)
        current_len += s_len + (1 if current_len > 0 else 0)  # +1 for space

    if current:
        chunks.append(" ".join(current))

    # Post-process: merge an undersized trailing chunk into the previous
    # one ONLY if the merged result stays within max_chunk. Otherwise the
    # small trailing chunk stands on its own — real people DO send short
    # follow-up messages (e.g. "demora uns 5 minutos só"). A 40-char
    # message is perfectly natural on WhatsApp.
    if len(chunks) >= 2 and len(chunks[-1]) < min_chunk:
        merged = chunks[-2] + " " + chunks[-1]
        if len(merged) <= max_chunk:
            chunks[-2] = merged
            chunks.pop()

    return chunks


def _force_split_long_chunk(text: str, target: int = 200) -> list[str]:
    """Force-split a long chunk that couldn't be split by normal means.

    Tries to break at commas, then at spaces near the target length.
    Each resulting piece should be roughly *target* chars.

    Args:
        text: The long text to split.
        target: Approximate target length for each piece.

    Returns:
        List of text pieces.
    """
    if len(text) <= target:
        return [text]

    # Try commas first
    if "," in text:
        comma_parts = text.split(",")
        chunks: list[str] = []
        buf: list[str] = []
        buf_len = 0
        for i, part in enumerate(comma_parts):
            part = part.strip()
            if i < len(comma_parts) - 1:
                part = part + ","
            p_len = len(part)
            if buf and buf_len + 1 + p_len > target:
                chunks.append(" ".join(buf))
                buf = [part]
                buf_len = p_len
            else:
                buf.append(part)
                buf_len += p_len + (1 if buf_len > 0 else 0)
        if buf:
            chunks.append(" ".join(buf))
        return chunks

    # Fall back to space-splitting at roughly target boundaries
    words = text.split()
    if len(words) <= 1:
        return [text]

    result: list[str] = []
    buf_words: list[str] = []
    buf_len = 0

    for word in words:
        w_len = len(word)
        if buf_words and buf_len + 1 + w_len > target:
            result.append(" ".join(buf_words))
            buf_words = [word]
            buf_len = w_len
        else:
            buf_words.append(word)
            buf_len += w_len + (1 if buf_len > 0 else 0)

    if buf_words:
        result.append(" ".join(buf_words))

    return result if result else [text]


__all__ = [
    "analyze_burst",
    "format_burst_context",
    "format_outgoing_burst",
    "should_send_as_burst",
]
