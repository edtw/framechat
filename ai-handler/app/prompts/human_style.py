"""
Human-style AI layer (multilingual).

Makes outgoing replies sound like a real person instead of an AI, in any
language. It forces short, punchy sentences, drops corporate / AI-tell jargon,
limits punctuation, and tells the model to reply in the SAME language the user
wrote in.

This module is intentionally dependency-free: language detection uses a small
heuristic (stopwords + accented characters), so it works for WhatsApp and
Discord (both call the same /api/chat endpoint) without adding new packages.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Dict, List

# ---------------------------------------------------------------------------
# Language-agnostic style traits
# ---------------------------------------------------------------------------
# These apply to EVERY reply, regardless of language. Keep them concrete so the
# model has clear, checkable rules.
STYLE_TRAITS: List[str] = [
    "Write like a real person texting, not like an AI assistant.",
    "Use short, punchy sentences. One idea per sentence.",
    "Keep replies brief. Avoid long paragraphs and walls of text.",
    "Use a casual, warm, conversational tone.",
    "Drop corporate and marketing jargon. No buzzwords.",
    "Limit punctuation. Avoid em-dashes (—), semicolons, and chains of commas.",
    "Avoid exclamation marks unless something is genuinely exciting; at most one.",
    "Do not over-explain or hedge. Get to the point.",
    "Never say you are an AI, a language model, or a bot.",
    "Do not use bullet-point lists unless the user clearly asks for a list.",
    "Reply in the SAME language the user wrote in. Mirror their tone and slang.",
]


# ---------------------------------------------------------------------------
# Per-language tell-word blocklists
# ---------------------------------------------------------------------------
# Words / phrases that make text read as AI-generated or stiffly formal. The
# model is told to avoid these for the detected language.
BLOCKLISTS: Dict[str, List[str]] = {
    "pt": [
        "outrossim",
        "ademais",
        "sob medida",
        "vale ressaltar",
        "vale lembrar",
        "no entanto",
        "portanto",
        "dessa forma",
        "em suma",
        "por conseguinte",
        "mergulhar fundo",
        "revolucionário",
        "divisor de águas",
        "de forma eficaz",
        "solução robusta",
        "experiência incomparável",
    ],
    "en": [
        "delve",
        "game-changing",
        "moreover",
        "in conclusion",
        "furthermore",
        "navigate the landscape",
        "navigating the landscape",
        "in today's fast-paced world",
        "it's worth noting",
        "rest assured",
        "seamless",
        "robust solution",
        "leverage",
        "unlock the potential",
        "dive deep",
        "elevate",
        "tapestry",
        "additionally",
    ],
}


# ---------------------------------------------------------------------------
# Lightweight language detection (heuristic, no heavy deps)
# ---------------------------------------------------------------------------
# Common stopwords per language. Whole-word matches are scored.
_STOPWORDS: Dict[str, List[str]] = {
    "pt": [
        "que", "não", "nao", "uma", "para", "com", "como", "está", "esta",
        "você", "voce", "obrigado", "obrigada", "queria", "saber", "sobre",
        "fazer", "tudo", "bem", "isso", "muito", "sim", "também", "tambem",
        "dinheiro", "conta", "oi", "olá", "ola", "por", "favor", "quero",
        "preciso", "ajuda", "dá", "tá", "vou", "ter", "tem",
    ],
    "en": [
        "the", "and", "you", "how", "what", "with", "this", "that", "have",
        "your", "about", "thanks", "thank", "hey", "hello", "hi", "want",
        "need", "help", "please", "can", "do", "money", "account", "cash",
        "out", "would", "could", "should", "i'm", "im", "its", "it's",
    ],
}

# Accented characters that strongly suggest Portuguese (vs plain ASCII English).
_PT_ACCENTS = set("áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ")

_WORD_RE = re.compile(r"[a-zA-ZÀ-ÿ']+")


def detect_language(text: str) -> str:
    """Detect the language of *text* with a simple heuristic.

    Returns an ISO-ish code: "pt", "en", or "other".

    Strategy: count whole-word stopword hits per language, give Portuguese a
    small bonus when accented characters are present. If no language scores,
    return "other" so callers can fall back to mirroring the user.
    """
    if not text or not text.strip():
        return "other"

    lowered = text.lower()
    words = _WORD_RE.findall(lowered)
    if not words:
        return "other"

    word_set = set(words)
    scores: Dict[str, float] = {}
    for lang, stopwords in _STOPWORDS.items():
        scores[lang] = float(sum(1 for w in stopwords if w in word_set))

    # Portuguese accent bonus — strong signal that this is not English.
    if any(ch in _PT_ACCENTS for ch in text):
        scores["pt"] = scores.get("pt", 0.0) + 2.0

    best_lang = max(scores, key=scores.get)
    best_score = scores[best_lang]

    if best_score <= 0:
        return "other"

    return best_lang


# ---------------------------------------------------------------------------
# Directive builder
# ---------------------------------------------------------------------------
_LANG_NAMES = {
    "pt": "Portuguese (pt-BR)",
    "en": "English",
}


def build_style_directive(message_text: str) -> str:
    """Build the human-style directive to append to the system prompt.

    Detects the user's language from *message_text* and returns a directive
    that tells the model to reply in that language, follow the style traits,
    and avoid the language-specific blocklist words. For unknown languages it
    still applies the traits and instructs the model to mirror the user.
    """
    lang = detect_language(message_text)

    lines: List[str] = ["HUMAN STYLE — write like a real person, not an AI:"]
    lines.extend(f"- {trait}" for trait in STYLE_TRAITS)

    if lang in _LANG_NAMES:
        lines.append(
            f"- The user is writing in {_LANG_NAMES[lang]}. Reply in {_LANG_NAMES[lang]}."
        )
    else:
        lines.append(
            "- Detect the user's language from their message and reply in that "
            "same language."
        )

    blocklist = BLOCKLISTS.get(lang)
    if blocklist:
        joined = ", ".join(f'"{w}"' for w in blocklist)
        lines.append(
            f"- Never use these stiff / AI-tell words or phrases: {joined}."
        )

    # Always nudge against the most common cross-language AI tells.
    lines.append(
        "- Avoid AI-tell openers and clichés in any language (e.g. \"delve\", "
        "\"game-changing\", \"vale ressaltar\", \"em suma\")."
    )

    return "\n".join(lines)
