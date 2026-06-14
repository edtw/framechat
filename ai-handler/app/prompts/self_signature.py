"""
Self-Signature Analyzer — learns the USER'S own writing style.

Unlike writing_signature.py (which analyzes how the OTHER person writes),
this module analyzes how the USER (token owner) writes across their DMs.
The resulting signature is used to make AI replies sound like the USER,
not like the person who DMed them.

Two signatures per conversation:
1. "partner" signature — how the OTHER person writes (writing_signature.py)
2. "self" signature — how the USER writes (this module) ← for generating replies

Philosophy: The AI replies AS the user, so it must sound like the user.
No AI/LLM calls — pure heuristic analysis on the user's own sent messages.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Dict, List, Optional, Set

# Reuse core helpers from writing_signature to avoid duplication
# (private imports are intentional — these are stable internal helpers)
from app.prompts.writing_signature import (  # noqa: E402
    _EMOJI_RE,
    _PUNCT_CHARS_RE,
    _WORD_RE,
    _STOPWORDS,
    _ABBREVIATIONS,
    _extract_words,
    _extract_emojis,
    _count_punctuation,
    _count_questions,
    _count_exclamations,
    _classify_capitalization,
    _safe_median,
    analyze_writing_signature,
)

# ---------------------------------------------------------------------------
# Known greeting patterns (pt-BR + English)
# ---------------------------------------------------------------------------
# Mapped as pattern -> weight, where 1.0 = highly distinctive/casual greeting,
# 0.4 = standard/polite greeting that could also be mid-message content.
_GREETINGS: Dict[str, float] = {
    # Very casual Brazilian
    "eae": 1.0, "iae": 1.0, "eai": 1.0, "salve": 1.0,
    "coe": 1.0, "fala": 1.0, "diz": 0.8, "opa": 0.9,
    "oii": 0.8, "oiii": 0.8, "oie": 0.7,
    # Standard Brazilian
    "oi": 0.7, "olá": 0.5, "ola": 0.6,
    "bom dia": 0.4, "boa tarde": 0.4, "boa noite": 0.4,
    "b dia": 0.8, "b tarde": 0.8, "b noite": 0.8,
    "bomdi": 0.8, "boatarde": 0.8, "boanoite": 0.8,
    # English casual
    "hey": 0.7, "heyy": 0.8, "heyyy": 0.9, "yo": 1.0,
    "sup": 0.9, "hi": 0.6, "hello": 0.5, "hii": 0.7,
    "hiii": 0.8, "heya": 0.8, "howdy": 0.7,
    # English time-based
    "good morning": 0.4, "good afternoon": 0.4, "good evening": 0.4,
}

# ---------------------------------------------------------------------------
# Known farewell patterns
# ---------------------------------------------------------------------------
_FAREWELLS: Dict[str, float] = {
    # Brazilian casual
    "flw": 1.0, "vlw": 0.8, "tmj": 0.9, "tamo junto": 0.8,
    "tamojunto": 0.8, "falou": 0.8, "falo": 0.7, "ate": 0.6,
    "até": 0.6, "ate mais": 0.7, "até mais": 0.7, "tchau": 0.7,
    "xau": 0.8, "bjs": 0.8, "bj": 0.7, "beijo": 0.6,
    "beijos": 0.6, "abraco": 0.7, "abcs": 0.8, "abç": 0.8,
    "abs": 0.7, "valeu": 0.7, "obg": 0.7, "obgd": 0.7,
    "brigado": 0.6, "brigada": 0.6, "noix": 0.9, "nois": 0.9,
    "é nois": 0.9, "e nois": 0.9, "paz": 0.7, "tranquil": 0.7,
    "suave": 0.7, "boa": 0.7, "bora": 0.7, "partiu": 0.7,
    "ate logo": 0.6, "até logo": 0.6,
    # English casual
    "bye": 0.7, "byee": 0.8, "byeee": 0.9, "cya": 0.8,
    "see ya": 0.7, "see you": 0.6, "later": 0.7, "laters": 0.8,
    "ttyl": 0.8, "gn": 0.7, "gnight": 0.8, "night": 0.6,
    "take care": 0.5, "tc": 0.8, "peace": 0.8,
    "catch you": 0.7, "talk soon": 0.6,
}

# ---------------------------------------------------------------------------
# Filler words / verbal tics
# ---------------------------------------------------------------------------
# Discourse markers that reveal personal voice. Weight 1.0 = very distinctive
# filler; lower weights = could be content or filler depending on context.
_FILLER_WORDS: Dict[str, float] = {
    # Brazilian — high-signal fillers
    "tlg": 1.0, "tlgd": 0.9, "tipo": 0.9, "mano": 1.0,
    "mn": 0.8, "pdp": 1.0, "slc": 0.9, "slk": 0.9,
    "né": 0.8, "ne": 0.7, "neh": 0.7, "po": 0.8,
    "pô": 0.8, "véi": 0.9, "vei": 0.9, "mermao": 1.0,
    "mermão": 1.0, "irmao": 0.7, "irmão": 0.7,
    "sabe": 0.7, "sab": 0.8, "tendeu": 0.9, "entendeu": 0.6,
    "ta": 0.6, "tá": 0.6, "la": 0.6, "lá": 0.6,
    "cara": 0.8, "mlk": 0.9, "mlq": 0.9, "fi": 0.7,
    "cr": 0.6, "crl": 0.5, "fds": 0.8, "mds": 0.7,
    "pprt": 0.9, "ctz": 0.7,
    # Brazilian — medium-signal fillers
    "então": 0.6, "entao": 0.6, "assim": 0.5, "mto": 0.7,
    "mt": 0.7, "serio": 0.5, "sério": 0.5,
    "aí": 0.5, "ai": 0.4, "viu": 0.6, "ok": 0.3,
    "blz": 0.6, "deboa": 0.7, "deboas": 0.7, "rlx": 0.6,
    "tranqs": 0.7, "suave": 0.5, "dmr": 0.9, "dms": 0.8,
    # English — high-signal fillers
    "like": 0.7, "um": 0.7, "uh": 0.7, "uhh": 0.8,
    "kinda": 0.7, "sorta": 0.7, "literally": 0.6,
    "basically": 0.6, "honestly": 0.7, "actually": 0.5,
    "you know": 0.7, "i mean": 0.7, "right": 0.5,
    "bro": 0.8, "dude": 0.8, "fam": 0.7, "bruh": 1.0,
    "lol": 0.8, "lmao": 0.8, "haha": 0.7, "hehe": 0.7,
    "ngl": 0.8, "tbh": 0.7, "fr": 0.8, "rn": 0.6,
}

# ---------------------------------------------------------------------------
# Question-starting words (pt-BR + English)
# ---------------------------------------------------------------------------
_QUESTION_STARTERS_PT: Set[str] = {
    "oq", "oqe", "o que", "qual", "quais", "como", "onde",
    "quando", "pq", "porque", "por que", "quem", "quanto",
    "quantos", "quantas", "cadê", "cade", "será", "sera",
    "será que", "sera que", "vamos", "bora", "partiu",
    "consegue", "conseguiu", "da", "deu", "rola", "rolando",
    "tem como", "da pra", "dá pra", "sabe", "sabem",
    "alguém", "algm", "alguem",
}

_QUESTION_STARTERS_EN: Set[str] = {
    "what", "how", "where", "when", "why", "who", "which",
    "can", "could", "would", "will", "do", "does", "did",
    "is", "are", "was", "were", "should", "shall", "may",
    "have you", "has", "anyone", "anybody", "someone",
    "did you", "are you", "do you", "can you", "could you",
    "would you", "will you", "is there", "are there",
}

_ALL_QUESTION_STARTERS = _QUESTION_STARTERS_PT | _QUESTION_STARTERS_EN

# ---------------------------------------------------------------------------
# Rhetorical question markers (tag questions / fillers at end)
# ---------------------------------------------------------------------------
_RHETORICAL_MARKERS: Set[str] = {
    "né", "ne", "neh", "neah", "right", "huh", "eh",
    "não é", "nao e", "isnt it", "isn't it", "you know",
    "sabe", "ta ligado", "tlg", "tlgd", "cê liga",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_self_writing(
    messages: List[str],
    name: Optional[str] = None,
) -> Dict:
    """Analyze the USER's own writing style from their sent messages.

    This is the self-analogue of ``analyze_writing_signature()``. Instead of
    analyzing how the OTHER person writes, it analyzes how the USER (token
    owner) writes, so AI-generated replies sound like the user.

    Builds on ``analyze_writing_signature()`` for base stats (message length,
    emoji use, punctuation, formality, etc.) and adds voice-trait layers:
    greeting patterns, farewell patterns, filler words, question style,
    and emoji signature combinations.

    Args:
        messages: List of message strings the USER has sent across their DMs.
        name: Optional display name for the user (e.g. "KappK"). Used in
            the directive to make it personal. Defaults to "Você".

    Returns:
        A dict with all keys from ``analyze_writing_signature()`` plus:

        - greeting_patterns (list[str]): up to 5 greeting patterns the user
          commonly opens messages with (e.g. ["eae", "salve", "oi"])
        - farewell_patterns (list[str]): up to 5 farewell patterns the user
          commonly closes messages with (e.g. ["flw", "tmj", "ate"])
        - filler_words (list[str]): up to 8 verbal tic / filler words
          (e.g. ["tlg", "mano", "pdp", "tipo"])
        - question_style (str): one of "direct", "rhetorical", "mixed",
          "rarely_asks" — how the user tends to ask questions
        - emoji_signature (list[str]): up to 5 recurring emoji bigrams or
          trigrams (e.g. ["😂👍", "💀💀"])
        - name (str): the display name (from the name param or "Você")

    Edge cases:
        - Empty list: returns sparse result with empty/nil voice traits.
        - Fewer than 3 messages: voice traits are computed but less reliable;
          base stats come through from analyze_writing_signature().
        - Non-string items: silently skipped.
    """
    # Base statistical analysis (reuses writing_signature's math)
    base = analyze_writing_signature(messages)

    if base["message_count"] == 0:
        return {
            **base,
            "greeting_patterns": [],
            "farewell_patterns": [],
            "filler_words": [],
            "question_style": "unknown",
            "emoji_signature": [],
            "name": name or "Você",
        }

    valid: List[str] = [
        m for m in messages if isinstance(m, str) and m.strip()
    ]

    n = len(valid)

    # ── Greeting patterns ──
    # Check the first 1-2 words of each message against known greetings.
    greeting_counter: Counter = Counter()
    for msg in valid:
        lowered = msg.lower().strip()
        words = lowered.split()
        if not words:
            continue
        first_word = words[0]
        first_two = " ".join(words[:2]) if len(words) >= 2 else first_word
        first_three = " ".join(words[:3]) if len(words) >= 3 else first_two

        for pattern, weight in _GREETINGS.items():
            pattern_len = len(pattern.split())
            if pattern_len == 1:
                if first_word == pattern:
                    greeting_counter[pattern] += weight
            elif pattern_len == 2:
                if first_two == pattern:
                    greeting_counter[pattern] += weight
            elif pattern_len == 3:
                if first_three == pattern:
                    greeting_counter[pattern] += weight

    greeting_patterns = [g for g, _ in greeting_counter.most_common(5)]

    # ── Farewell patterns ──
    # Check the last 1-3 words of each message against known farewells.
    farewell_counter: Counter = Counter()
    for msg in valid:
        lowered = msg.lower().strip()
        words = lowered.split()
        if not words:
            continue

        for pattern, weight in _FAREWELLS.items():
            pattern_words = pattern.split()
            pattern_len = len(pattern_words)
            if pattern_len > len(words):
                continue
            msg_end = " ".join(words[-pattern_len:])
            if msg_end == pattern:
                farewell_counter[pattern] += weight

    farewell_patterns = [f for f, _ in farewell_counter.most_common(5)]

    # ── Filler words ──
    # Scan all messages for known filler words / discourse markers.
    # Match whole-word only so "po" doesn't hit "pode".
    filler_counter: Counter = Counter()
    for msg in valid:
        msg_lower = msg.lower()
        for filler, weight in _FILLER_WORDS.items():
            if re.search(rf"\b{re.escape(filler)}\b", msg_lower):
                filler_counter[filler] += weight

    filler_words = [f for f, _ in filler_counter.most_common(8)]

    # ── Question style ──
    # Classify how the user asks questions: direct (starts with question word
    # and has "?"), rhetorical (uses tag questions like "né"/"right"), or
    # indirect (statements that imply a question without "?").
    total_question_msgs = 0
    direct_count = 0
    rhetorical_count = 0

    for msg in valid:
        msg_stripped = msg.strip()
        msg_lower = msg_stripped.lower()
        has_qmark = "?" in msg_stripped
        starts_question = any(
            msg_lower.startswith(q) or msg_lower.split()[0] == q.split()[0]
            for q in _ALL_QUESTION_STARTERS
            if msg_lower.split()
        )
        has_rhetorical = any(
            re.search(rf"\b{re.escape(r)}\b", msg_lower)
            for r in _RHETORICAL_MARKERS
        )

        if has_qmark or starts_question or has_rhetorical:
            total_question_msgs += 1
            if has_rhetorical and not starts_question:
                rhetorical_count += 1
            elif starts_question or (has_qmark and not has_rhetorical):
                direct_count += 1

    if total_question_msgs == 0:
        question_style = "rarely_asks"
    elif rhetorical_count > direct_count:
        question_style = "rhetorical"
    elif direct_count > rhetorical_count:
        question_style = "direct"
    else:
        question_style = "mixed"

    # ── Emoji signature ──
    # Find recurring emoji bigrams (2 emojis in sequence) and trigrams (3)
    # that appear at least twice. This captures personal emoji combos like
    # "😂👍" or "💀💀💀" that single-emoji frequency misses.
    emoji_ngram_counter: Counter = Counter()
    for msg in valid:
        emojis = _extract_emojis(msg)
        for i in range(len(emojis) - 1):
            emoji_ngram_counter[emojis[i] + emojis[i + 1]] += 1
        for i in range(len(emojis) - 2):
            emoji_ngram_counter[emojis[i] + emojis[i + 1] + emojis[i + 2]] += 1

    emoji_signature = [
        seq for seq, count in emoji_ngram_counter.most_common(5)
        if count >= 2
    ]

    return {
        **base,
        "greeting_patterns": greeting_patterns,
        "farewell_patterns": farewell_patterns,
        "filler_words": filler_words,
        "question_style": question_style,
        "emoji_signature": emoji_signature,
        "name": name or "Você",
    }


def build_self_directive(signature: Dict) -> str:
    """Convert a self-signature dict into a voice directive for the system prompt.

    The output tells the AI model: "YOU ARE WRITING AS [name]. Your messages
    must sound EXACTLY like them:" followed by concrete, checkable rules
    derived from the self-signature.

    Unlike the partner directive from ``signature_to_directive()`` (which says
    "mirror the user's style"), this directive is PRESCRIPTIVE — it tells the
    model to BE the user, not to imitate them.

    Args:
        signature: A dict returned by ``analyze_self_writing()``.

    Returns:
        A voice directive string, e.g.:
        "YOU ARE WRITING AS kappk. Your messages must sound EXACTLY like them:
         - Message length: very short (avg 6 words)
         - Style: lowercase, no punctuation, casual
         - Common words: mano, tlg, pdp, tipo
         - Greeting style: 'eae' or 'salve', never 'olá'
         - Emoji style: 😂👍💀 (use these, avoid formal emojis)
         - Question style: direct and casual
         - NEVER use formal language, NEVER capitalize first word"

        Returns an empty string if the signature has insufficient data
        (message_count < 3).
    """
    msg_count = signature.get("message_count", 0)
    if msg_count < 3:
        return ""

    name = signature.get("name", "Você")
    lines: List[str] = [
        f"YOU ARE WRITING AS {name}. Your messages must sound EXACTLY like "
        f"{name}. Follow these rules strictly:",
    ]

    avg_words = signature.get("avg_words_per_message", 0)

    # ── Message length rule ──
    if avg_words <= 5:
        lines.append(
            f"- Message length: very short (avg {avg_words:.0f} words). "
            f"Keep every reply to {max(1, int(avg_words) * 2)} words or fewer."
        )
    elif avg_words <= 12:
        lines.append(
            f"- Message length: short (avg {avg_words:.0f} words). "
            f"Keep replies to around {int(avg_words)} words."
        )
    elif avg_words <= 25:
        lines.append(
            f"- Message length: medium (avg {avg_words:.0f} words). "
            f"Match this length in replies."
        )
    else:
        lines.append(
            f"- Message length: longer (avg {avg_words:.0f} words). "
            f"Match this length in replies."
        )

    # ── Capitalization rule ──
    cap = signature.get("capitalization", "lowercase")
    if cap == "lowercase":
        lines.append(
            "- capitalization: NEVER capitalize the first word of a sentence. "
            "Write everything in lowercase (except proper names)."
        )
    elif cap == "proper":
        lines.append(
            "- capitalization: Always capitalize the first word of sentences "
            "and proper names."
        )
    else:
        lines.append(
            "- capitalization: Mirror the mixed style — sometimes capitalize, "
            "sometimes don't."
        )

    # ── Punctuation rule ──
    punct = signature.get("punctuation_style", "standard")
    if punct == "minimal":
        lines.append(
            "- punctuation: Use NO punctuation at the end of sentences. "
            "No periods, no commas. At most use a single '?' when truly asking."
        )
    elif punct == "heavy":
        lines.append(
            "- punctuation: Use punctuation naturally — periods, commas, "
            "ellipsis (…). Match a heavier punctuation style."
        )

    # ── Tone / formality ──
    formality = signature.get("formality_score", 0.5)
    abbrev_rate = signature.get("abbreviation_rate", 0)
    if formality <= 0.3 or abbrev_rate >= 0.5:
        tone = (
            "- Tone: EXTREMELY casual. Use slang, abbreviations, internet "
            "shorthand. "
        )
        filler_words = signature.get("filler_words", [])
        if filler_words:
            tone += (
                f"Weave in these words naturally: {', '.join(filler_words[:5])}. "
            )
        tone += "NEVER sound formal or polite."
        lines.append(tone)
    elif formality <= 0.5 or abbrev_rate >= 0.3:
        lines.append(
            "- Tone: Casual and relaxed. Use some slang and abbreviations. "
            "Avoid being overly formal."
        )
    elif formality >= 0.8:
        lines.append(
            "- Tone: Polished and professional. Write clearly, avoid slang. "
            "Be warm but composed."
        )
    else:
        lines.append(
            "- Tone: Conversational. Not too formal, not too sloppy."
        )

    # ── Greeting style ──
    greeting_patterns = signature.get("greeting_patterns", [])
    if greeting_patterns:
        top_greetings = greeting_patterns[:3]
        greeting_rule = (
            f"- Greeting style: Open with {_or_list(top_greetings)}. "
            f"Never use {_forbidden_greetings(top_greetings)}."
        )
        lines.append(greeting_rule)
    else:
        lines.append(
            "- Greeting style: Do NOT use formal greetings like 'Olá' or "
            "'Hello'. Match the casual tone."
        )

    # ── Farewell style ──
    farewell_patterns = signature.get("farewell_patterns", [])
    if farewell_patterns:
        top_farewells = farewell_patterns[:3]
        lines.append(
            f"- Farewell style: Close with {_or_list(top_farewells)} when "
            f"ending a conversation. Avoid formal goodbyes."
        )

    # ── Filler words / voice markers ──
    filler_words = signature.get("filler_words", [])
    if filler_words:
        lines.append(
            f"- Voice markers: These words are part of {name}'s natural voice: "
            f"{', '.join(filler_words[:5])}. Use them naturally, don't force."
        )

    # ── Emoji style ──
    top_emojis = signature.get("top_emojis", [])
    emoji_sig = signature.get("emoji_signature", [])
    emoji_freq = signature.get("emoji_frequency", 0)

    if emoji_freq >= 0.3:
        emoji_rule = "- Emoji style: Use emojis frequently. "
        if top_emojis:
            emoji_rule += f"Preferred emojis: {' '.join(top_emojis[:5])}. "
        if emoji_sig:
            emoji_rule += f"Common combos: {' '.join(emoji_sig[:3])}. "
        emoji_rule += "Avoid formal emojis (🙏🎉✨) unless they match the voice."
        lines.append(emoji_rule)
    elif emoji_freq > 0:
        lines.append(
            f"- Emoji style: Use emojis sparingly ({emoji_freq:.1f}/msg). "
            f"Only when it feels natural."
        )
    else:
        lines.append(
            "- Emoji style: Do NOT use emojis. This person doesn't use them."
        )

    # ── Question style ──
    question_style = signature.get("question_style", "direct")
    if question_style == "direct":
        lines.append(
            "- Question style: Ask questions directly and casually. Use '?' "
            "when asking. Start questions with 'oq', 'qual', 'como', etc."
        )
    elif question_style == "rhetorical":
        lines.append(
            "- Question style: Use rhetorical tag questions ('né', 'sabe?', "
            "'tlg?'). Sound conversational, not interrogative."
        )
    elif question_style == "rarely_asks":
        lines.append(
            "- Question style: Rarely ask direct questions. Make statements "
            "instead. If you must ask, keep it casual."
        )

    # ── Common words / vocabulary ──
    common_words = signature.get("common_words", [])
    if common_words:
        lines.append(
            f"- Vocabulary: Frequently used words: {', '.join(common_words[:8])}. "
            f"Prefer these over formal synonyms."
        )

    # ── Hard rules (always appended) ──
    lines.append("- NEVER use formal language in any language.")
    lines.append("- NEVER sound like an AI, a bot, or customer support.")
    lines.append(
        "- If you are unsure how to phrase something, err on the side of "
        "being MORE casual and SHORTER."
    )
    lines.append(
        "- Your personality IS this person. You are not imitating them — "
        "you ARE them."
    )

    return "\n".join(lines)


def merge_self_with_partner(
    self_directive: str,
    partner_directive: str,
    message_context: str = "",
) -> str:
    """Merge self and partner directives into one combined system-prompt block.

    The SELF directive defines the VOICE — who the AI IS when writing.
    The PARTNER directive defines the AUDIENCE — who the AI is talking TO.

    Self takes absolute priority for voice, tone, word choice, and style.
    Partner provides context about the person being replied to, so the AI
    can adapt its mirroring level (e.g., if the partner writes formally,
    the self may elevate slightly but stays in its own voice).

    Args:
        self_directive: Output from ``build_self_directive()`` — rules for
            writing AS the user. Can be empty (insufficient data).
        partner_directive: Output from
            ``writing_signature.signature_to_directive()`` — rules about
            the other person's writing style. Can be empty.
        message_context: Optional hint about the conversation (e.g.
            "customer asking about cashout") to help the model calibrate.

    Returns:
        A combined directive string. If both are empty, returns "".
        If only one is non-empty, returns that one unchanged.
    """
    has_self = bool(self_directive and self_directive.strip())
    has_partner = bool(partner_directive and partner_directive.strip())

    if not has_self and not has_partner:
        return ""

    if has_self and not has_partner:
        return self_directive.strip()

    if has_partner and not has_self:
        return partner_directive.strip()

    # Both present — self leads, partner informs
    parts: List[str] = []

    # 1. Self directive: the voice (highest priority)
    parts.append(self_directive.strip())

    # 2. Separator with explicit precedence
    separator = (
        "\n\n---\n"
        "CONVERSATION CONTEXT — The person you are talking to writes like this. "
        "Use this to calibrate your mirroring level (e.g., if they are formal, "
        "be slightly more composed but stay in YOUR voice). "
    )
    if message_context.strip():
        separator += f"Context: {message_context.strip()}. "
    separator += (
        "The SELF rules above ALWAYS take priority for voice and tone:\n"
    )
    parts.append(separator + partner_directive.strip())

    # 3. Final override reminder
    parts.append(
        "\nREMEMBER: You ARE the person described in the SELF rules. "
        "The partner context is only for calibration — your voice, tone, "
        "and word choices come from the SELF rules."
    )

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _or_list(items: List[str]) -> str:
    """Format a list as 'X', 'Y', or 'Z' for natural language."""
    if not items:
        return ""
    if len(items) == 1:
        return f"'{items[0]}'"
    if len(items) == 2:
        return f"'{items[0]}' or '{items[1]}'"
    return ", ".join(f"'{x}'" for x in items[:-1]) + f", or '{items[-1]}'"


def _forbidden_greetings(used: List[str]) -> str:
    """Return a list of greetings to avoid, based on what the user uses.

    If the user uses very casual greetings, forbid formal ones. If they use
    formal ones, forbid the very casual ones.
    """
    casual_set = {"eae", "iae", "eai", "salve", "coe", "fala", "opa", "yo", "sup"}
    formal_set = {"olá", "ola", "hello", "bom dia", "boa tarde", "boa noite",
                  "good morning", "good afternoon", "good evening"}

    used_set = set(used)

    if used_set & casual_set:
        # User is casual — forbid formal greetings
        forbidden = [g for g in ["Olá", "Hello", "Bom dia", "Boa tarde",
                                  "Boa noite", "Good morning"]
                     if g.lower() not in used_set]
        if forbidden:
            return _or_list(forbidden)
        return "formal greetings"

    if used_set & formal_set:
        # User is formal/polite — forbid very casual
        forbidden_casual = [g for g in ["eae", "salve", "coe", "yo", "sup"]
                            if g not in used_set]
        if forbidden_casual:
            return _or_list(forbidden_casual)
        return "overly casual slang greetings"

    return "generic AI-sounding greetings"


__all__ = [
    "analyze_self_writing",
    "build_self_directive",
    "merge_self_with_partner",
]
