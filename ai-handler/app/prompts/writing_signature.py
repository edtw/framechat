"""
Writing Signature Analyzer — heuristic style profiling from raw message text.

No AI/LLM calls. Pure statistics and pattern matching on message text so the
signature can be computed cheaply (once per chat or conversation window) and
then injected into the system prompt to make AI replies mirror the user's
actual writing style.

Philosophy: analyze once with cheap math, apply many times in the prompt.
"""

from __future__ import annotations

import re
from collections import Counter
from statistics import median
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Emoji detection regex
# ---------------------------------------------------------------------------
# Covers the main Unicode emoji blocks: emoticons, pictographs, symbols,
# transport, dingbats, supplemental symbols, flags, modifiers, etc.
_EMOJI_RE = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map
    "\U0001F1E0-\U0001F1FF"  # flags (iOS)
    "\U00002702-\U000027B0"  # dingbats
    "\U000024C2-\U0001F251"  # enclosed characters
    "\U0001F900-\U0001F9FF"  # supplemental symbols
    "\U0001FA00-\U0001FA6F"  # chess symbols
    "\U0001FA70-\U0001FAFF"  # symbols extended-A
    "\U0001F7E0-\U0001F7EB"  # colored circles/squares
    "\U00002600-\U000026FF"  # misc symbols
    "\U0000FE00-\U0000FE0F"  # variation selectors
    "\U0000200D"             # zero-width joiner
    "\U0000200C-\U0000200F"  # zero-width non-joiner and marks
    "\U00002300-\U000023FF"  # misc technical
    "\U00002B50"             # star
    "\U0001F004"             # mahjong
    "\U0001F0CF"             # playing card
    "\U0001F18E"             # negative squared AB
    "\U0001F191-\U0001F19A"  # squared symbols
    "\U0001F200-\U0001F202"  # square hiragana
    "\U0001F210-\U0001F23B"  # squared CJK
    "\U0001F240-\U0001F248"  # squared katakana
    "\U0001F250-\U0001F251"  # circled ideographs
    "\U00002934-\U00002935"  # arrows
    "\U000025AA-\U000025AB"  # geometric shapes
    "\U000025FB-\U000025FE"  # medium/small squares
    "\U00002B05-\U00002B07"  # arrows
    "\U00002B1B-\U00002B1C"  # squares
    "\U00003030"             # wavy dash
    "\U0000303D"             # part alternation mark
    "\U00003297"             # circled congratulation
    "\U00003299"             # circled secret
    "\U000023CF"             # eject
    "\U0001F201"             # squared katakana koko
    "\U0001F232-\U0001F23A"  # squared CJK words
    "\U000023E9-\U000023F3"  # double triangles, hourglass
    "\U000023F8-\U000023FA"  # control symbols
    "\U0001F170-\U0001F171"  # negative squared latin letters
    "\U0001F17E-\U0001F17F"  # negative squared
    "\U0001F3FB-\U0001F3FF"  # skin-tone modifiers
    "]",
    re.UNICODE,
)

# ---------------------------------------------------------------------------
# Punctuation characters for style classification
# ---------------------------------------------------------------------------
_PUNCT_CHARS_RE = re.compile(r"[.,!?;:\-—…]")

# ---------------------------------------------------------------------------
# Word tokenizer — catches letters, accented characters, and apostrophes
# ---------------------------------------------------------------------------
_WORD_RE = re.compile(r"[a-zA-ZÀ-ÿ']+")

# ---------------------------------------------------------------------------
# Stopwords (pt-BR + common English) filtered from common_words
# ---------------------------------------------------------------------------
_STOPWORDS: set = {
    # Portuguese
    "que", "não", "nao", "uma", "para", "com", "como", "está", "esta",
    "você", "voce", "obrigado", "obrigada", "queria", "saber", "sobre",
    "fazer", "tudo", "bem", "isso", "muito", "sim", "também", "tambem",
    "dinheiro", "conta", "por", "favor", "quero", "preciso", "ajuda",
    "dá", "tá", "vou", "ter", "tem", "mas", "dos", "das", "ele", "ela",
    "são", "pra", "pro", "pra", "aí", "lá", "cá", "aqui", "agora",
    "depois", "antes", "ainda", "quando", "onde", "quem", "qual",
    "porque", "pq", "vc", "vcs", "tb", "tbm", "td", "tudo", "nada",
    "mais", "menos", "só", "so", "já", "ja", "até", "ate", "sem",
    "prazo", "uns", "umas", "outro", "outra", "outros", "outras",
    "algum", "alguma", "alguns", "algumas", "meu", "minha", "seus",
    "suas", "nosso", "nossa", "desse", "dessa", "desse", "nesse",
    "nessa", "dele", "dela", "deles", "delas", "estou", "estão",
    "vai", "vão", "ser", "era", "foi", "fui", "tinha", "tava",
    "estava", "estavam", "tiver", "têm", "tem", "faz", "fazendo",
    "feito", "disse", "falou", "perguntou", "respondeu",
    # English
    "the", "and", "you", "how", "what", "with", "this", "that", "have",
    "your", "about", "thanks", "thank", "hey", "hello", "hi", "want",
    "need", "help", "please", "can", "do", "money", "account", "cash",
    "out", "would", "could", "should", "im", "its", "for", "are",
    "but", "not", "was", "all", "will", "just", "from", "get",
    "got", "like", "know", "really", "very", "when", "where", "who",
    "why", "how", "much", "many", "some", "any", "more", "been",
    "has", "had", "did", "does", "done", "going", "gonna", "wanna",
}

# ---------------------------------------------------------------------------
# Common abbreviations / slang (pt-BR focused) for formality scoring
# ---------------------------------------------------------------------------
_ABBREVIATIONS: Dict[str, float] = {
    # Portuguese internet slang / abbreviations (highly casual = weight 1.0)
    "vc": 1.0, "vcs": 1.0, "tb": 1.0, "tbm": 1.0, "td": 1.0,
    "pq": 1.0, "q": 0.8, "qdo": 0.8, "qd": 0.8, "blz": 1.0,
    "flw": 1.0, "vlw": 1.0, "tmj": 1.0, "tlg": 1.0, "pdp": 1.0,
    "slc": 1.0, "slk": 1.0, "pprt": 1.0, "ctz": 1.0, "mds": 0.8,
    "mano": 1.0, "mn": 0.8, "cr": 0.8, "crl": 0.5, "fds": 1.0,
    "plmd": 0.8, "plmds": 0.8, "mto": 1.0, "mt": 1.0, "obg": 0.8,
    "obgd": 0.8, "bf": 0.8, "cmg": 0.8, "cntg": 0.8, "dnv": 0.8,
    "hj": 0.8, "msg": 0.7, "add": 0.7, "oq": 0.8, "qt": 0.8,
    "qnt": 0.8, "vdd": 0.8, "sdd": 0.8, "sdds": 0.8, "gnt": 0.8,
    "ngm": 0.8, "algm": 0.8, "mrl": 0.8, "bgl": 0.8, "bglh": 0.8,
    "tlgd": 0.8, "tranquilo": 0.5, "suave": 0.5, "deboa": 0.8,
    "deboas": 0.8, "suave": 0.6, "tranqs": 0.8, "rlx": 0.8,
    "ss": 0.8, "s": 0.5, "n": 0.5, "nn": 0.8, "aki": 0.7,
    "aq": 0.7, "eh": 0.6, "neh": 0.6, "ne": 0.6, "num": 0.6,
    "numa": 0.6, "pra": 0.5, "pro": 0.5, "prum": 0.5, "pruma": 0.5,
    "to": 0.7, "tô": 0.7, "tava": 0.7, "tavam": 0.7, "tive": 0.5,
    "ia": 0.5, "vamo": 0.7, "bora": 0.7, "partiu": 0.6, "bora": 0.7,
    # English internet slang
    "u": 0.8, "ur": 0.8, "r": 0.5, "pls": 0.8, "plz": 0.8,
    "thx": 0.8, "ty": 0.8, "np": 0.7, "idk": 0.8, "tbh": 0.7,
    "imo": 0.6, "imho": 0.6, "lol": 1.0, "lmao": 1.0, "rofl": 1.0,
    "brb": 0.7, "btw": 0.7, "omg": 0.8, "wtf": 0.8, "afk": 0.7,
    "gg": 0.7, "wp": 0.6, "fr": 0.8, "ngl": 0.8, "rn": 0.7,
    "asap": 0.5, "fyi": 0.5, "afaik": 0.5, "iirc": 0.5, "imo": 0.5,
    "yep": 0.6, "yeah": 0.5, "nah": 0.7, "nope": 0.6, "yup": 0.6,
    "gonna": 0.6, "wanna": 0.6, "gotta": 0.6, "kinda": 0.6, "sorta": 0.6,
    "dunno": 0.7, "lemme": 0.6, "gimme": 0.6, "outta": 0.6, "ain": 0.6,
    "cuz": 0.8, "cause": 0.5, "til": 0.6, "tfw": 0.7, "mf": 0.5,
    "bro": 0.7, "dude": 0.7, "fam": 0.7, "bruh": 0.9, "yo": 0.7,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_words(text: str) -> List[str]:
    """Extract lowercase words (3+ chars) from text."""
    return [w.lower() for w in _WORD_RE.findall(text) if len(w) >= 3]


def _extract_emojis(text: str) -> List[str]:
    """Extract all emoji characters from text."""
    return _EMOJI_RE.findall(text)


def _count_punctuation(text: str) -> int:
    """Count punctuation characters in text."""
    return len(_PUNCT_CHARS_RE.findall(text))


def _count_questions(text: str) -> int:
    """Count question marks in text."""
    return text.count("?")


def _count_exclamations(text: str) -> int:
    """Count exclamation marks in text."""
    return text.count("!")


def _classify_capitalization(messages: List[str]) -> str:
    """Classify capitalization style from message first characters.

    Only considers messages that start with a letter.
    """
    first_chars: List[str] = []
    for msg in messages:
        stripped = msg.strip()
        if stripped and stripped[0].isalpha():
            first_chars.append(stripped[0])

    if not first_chars:
        return "lowercase"

    lower_count = sum(1 for c in first_chars if c.islower())
    upper_count = sum(1 for c in first_chars if c.isupper())

    total = lower_count + upper_count
    if total == 0:
        return "lowercase"

    lower_ratio = lower_count / total

    if lower_ratio >= 0.80:
        return "lowercase"
    elif upper_count / total >= 0.80:
        return "proper"
    else:
        return "mixed"


def _classify_punctuation_style(punct_per_msg: float) -> str:
    """Classify punctuation density."""
    if punct_per_msg <= 0.5:
        return "minimal"
    elif punct_per_msg <= 2.5:
        return "standard"
    else:
        return "heavy"


def _safe_median(values: List[float]) -> float:
    """Return median of values, 0.0 for empty list."""
    if not values:
        return 0.0
    return median(values)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_writing_signature(messages: List[str]) -> Dict:
    """Analyze a list of message strings and extract writing-style traits.

    Pure heuristic analysis — no AI/LLM calls. Computes statistical and
    pattern-based traits from the raw text of the messages.

    Args:
        messages: List of message strings from a conversation.

    Returns:
        A dict with the following keys:
        - avg_message_length (float): average character count per message
        - median_message_length (float): median character count per message
        - avg_words_per_message (float): average word count per message
        - emoji_frequency (float): average emojis per message
        - top_emojis (list[str]): up to 5 most frequent emojis
        - punctuation_style (str): "minimal", "standard", or "heavy"
        - capitalization (str): "lowercase", "proper", or "mixed"
        - question_frequency (float): average "?" count per message
        - exclamation_frequency (float): average "!" count per message
        - common_words (list[str]): top 10 non-stopword words (3+ chars)
        - formality_score (float): 0.0 (very casual) to 1.0 (very formal)
        - abbreviation_rate (float): fraction of messages with abbreviations
        - message_count (int): number of valid messages analyzed

    Edge cases:
        - Empty list: returns a sparse result with message_count=0 and all
          metrics at their zero/neutral defaults.
        - Single message: median equals the single value; formality and
          abbreviation rates are computed normally.
        - Non-string items in the list: silently skipped (only strings are
          analyzed).
    """
    # Filter to string messages only, skip empty/whitespace-only
    valid: List[str] = [
        m for m in messages if isinstance(m, str) and m.strip()
    ]

    if not valid:
        return {
            "avg_message_length": 0.0,
            "median_message_length": 0.0,
            "avg_words_per_message": 0.0,
            "emoji_frequency": 0.0,
            "top_emojis": [],
            "punctuation_style": "minimal",
            "capitalization": "lowercase",
            "question_frequency": 0.0,
            "exclamation_frequency": 0.0,
            "common_words": [],
            "formality_score": 1.0,
            "abbreviation_rate": 0.0,
            "message_count": 0,
        }

    n = len(valid)

    # Per-message metrics
    msg_lengths: List[int] = [len(m) for m in valid]
    word_counts: List[int] = [len(_extract_words(m)) for m in valid]
    all_emojis: List[str] = []
    total_punct: int = 0
    total_questions: int = 0
    total_exclamations: int = 0
    all_words: List[str] = []
    messages_with_abbrev: int = 0
    total_abbrev_hits: int = 0
    total_words_for_formality: int = 0

    for msg in valid:
        all_emojis.extend(_extract_emojis(msg))
        total_punct += _count_punctuation(msg)
        total_questions += _count_questions(msg)
        total_exclamations += _count_exclamations(msg)

        words = _extract_words(msg)
        all_words.extend(words)

        # Abbreviation / slang detection
        msg_lower = msg.lower()
        msg_has_abbrev = False
        for abbrev, weight in _ABBREVIATIONS.items():
            # Match whole-word abbreviations only
            if re.search(rf"\b{re.escape(abbrev)}\b", msg_lower):
                total_abbrev_hits += weight
                msg_has_abbrev = True

        if msg_has_abbrev:
            messages_with_abbrev += 1

        total_words_for_formality += len(words)

    # Emoji frequency
    emoji_counter = Counter(all_emojis)
    top_emojis = [e for e, _ in emoji_counter.most_common(5)]

    # Common words (filter stopwords, short words)
    meaningful_words = [
        w for w in all_words
        if w not in _STOPWORDS and len(w) >= 3
    ]
    word_counter = Counter(meaningful_words)
    common_words = [w for w, _ in word_counter.most_common(10)]

    # Formality score: higher abbreviation density = lower formality
    # Normalize: max plausible abbrev hits ~0.5 per word (extremely casual)
    if total_words_for_formality > 0:
        abbrev_density = total_abbrev_hits / total_words_for_formality
        # Clamp density to [0, 0.5] then invert to [1.0, 0.0]
        raw = 1.0 - min(abbrev_density / 0.5, 1.0)
        formality_score = round(max(0.0, min(1.0, raw)), 2)
    else:
        formality_score = 1.0

    return {
        "avg_message_length": round(sum(msg_lengths) / n, 1),
        "median_message_length": round(_safe_median([float(x) for x in msg_lengths]), 1),
        "avg_words_per_message": round(sum(word_counts) / n, 1),
        "emoji_frequency": round(len(all_emojis) / n, 2),
        "top_emojis": top_emojis,
        "punctuation_style": _classify_punctuation_style(total_punct / n),
        "capitalization": _classify_capitalization(valid),
        "question_frequency": round(total_questions / n, 2),
        "exclamation_frequency": round(total_exclamations / n, 2),
        "common_words": common_words,
        "formality_score": formality_score,
        "abbreviation_rate": round(messages_with_abbrev / n, 2),
        "message_count": n,
    }


def signature_to_directive(signature: Dict) -> str:
    """Convert a writing-signature dict into a compact style directive string.

    The output is designed to be appended to the system prompt so the AI model
    mirrors the user's actual writing patterns.

    Args:
        signature: A dict returned by ``analyze_writing_signature()``.

    Returns:
        A style directive string, e.g.:
        "CHAT WRITING STYLE: Very short messages (avg 6 words). Lowercase, no
        punctuation. Frequent emojis: 😂 👍. Common words: mano, tlg, pdp.
        Casual slang-heavy tone. Mirror this exact style in your reply. Keep
        it brief."

        Returns an empty string if the signature has insufficient data
        (message_count < 3).
    """
    msg_count = signature.get("message_count", 0)
    if msg_count < 3:
        return ""

    parts: List[str] = ["CHAT WRITING STYLE:"]

    avg_words = signature.get("avg_words_per_message", 0)

    # Message length characterization
    if avg_words <= 5:
        parts.append(f"Very short messages (avg {avg_words:.0f} words).")
    elif avg_words <= 15:
        parts.append(f"Short messages (avg {avg_words:.0f} words).")
    elif avg_words <= 30:
        parts.append(f"Medium-length messages (avg {avg_words:.0f} words).")
    else:
        parts.append(f"Longer messages (avg {avg_words:.0f} words).")

    # Capitalization
    cap = signature.get("capitalization", "lowercase")
    if cap == "lowercase":
        parts.append("Mostly lowercase, casual typing.")
    elif cap == "proper":
        pass  # No special note needed
    else:
        parts.append("Mixed capitalization — mirror the user's pattern.")

    # Punctuation
    punct = signature.get("punctuation_style", "standard")
    if punct == "minimal":
        parts.append("Minimal or no punctuation.")
    elif punct == "heavy":
        parts.append("Uses punctuation heavily.")

    # Question frequency
    q_freq = signature.get("question_frequency", 0)
    if q_freq >= 0.5:
        parts.append(f"Asks questions frequently ({q_freq:.1f}/msg).")

    # Exclamation frequency
    excl_freq = signature.get("exclamation_frequency", 0)
    if excl_freq >= 0.3:
        parts.append(f"Uses exclamation marks ({excl_freq:.1f}/msg).")

    # Emojis
    top_emojis = signature.get("top_emojis", [])
    emoji_freq = signature.get("emoji_frequency", 0)
    if top_emojis and emoji_freq >= 0.2:
        emoji_str = " ".join(top_emojis)
        parts.append(f"Frequent emojis: {emoji_str}.")

    # Common words
    common_words = signature.get("common_words", [])
    if common_words:
        word_str = ", ".join(common_words[:8])
        parts.append(f"Common words: {word_str}.")

    # Formality / tone
    formality = signature.get("formality_score", 0.5)
    abbrev_rate = signature.get("abbreviation_rate", 0)
    if formality <= 0.3 or abbrev_rate >= 0.5:
        parts.append("Very casual, slang-heavy tone.")
    elif formality <= 0.5 or abbrev_rate >= 0.3:
        parts.append("Casual tone with some slang/abbreviations.")
    elif formality >= 0.8:
        parts.append("Formal, polished tone.")

    # Closing instruction
    parts.append(
        "Mirror this exact style in your reply. "
        "Match the length, tone, punctuation, and emoji use."
    )

    return " ".join(parts)


def merge_signature_directive(
    base_directive: str,
    signature_directive: str,
) -> str:
    """Merge a global human-style directive with a chat-specific signature directive.

    The signature directive takes precedence for chat-specific style traits
    (message length, emoji use, specific words), while the base directive
    provides the foundational rules (avoid AI-tells, language matching, blocklist).

    Args:
        base_directive: The global style directive (e.g. from
            ``human_style.build_style_directive()``).
        signature_directive: The chat-specific directive (e.g. from
            ``signature_to_directive()``).

    Returns:
        A combined directive string with signature rules placed after base
        rules, with a separator and an explicit override note so the model
        understands that signature traits take priority.

        If ``signature_directive`` is empty, returns ``base_directive`` unchanged.
        If ``base_directive`` is empty, returns ``signature_directive`` unchanged.
    """
    if not signature_directive.strip():
        return base_directive

    if not base_directive.strip():
        return signature_directive

    separator = (
        "\n\n---\n"
        "CHAT-SPECIFIC STYLE OVERRIDE — The traits below describe this "
        "specific user's writing style and take priority over the general "
        "rules above:\n"
    )

    return base_directive + separator + signature_directive


def needs_reanalysis(
    signature: Dict,
    new_message_count: int,
    hours_elapsed: float,
) -> bool:
    """Determine whether a writing signature should be recomputed.

    Args:
        signature: The existing signature dict (must have a "message_count" key).
        new_message_count: Number of messages currently available for this chat.
        hours_elapsed: Hours since the last analysis was performed.

    Returns:
        True if the signature should be reanalyzed — either because more than
        50 new messages have accumulated since the last analysis, or because
        more than 6 hours have passed. Also returns True if the signature
        dict is empty or has a message_count of 0 (never analyzed).
    """
    if not signature or signature.get("message_count", 0) == 0:
        return True

    old_count = signature.get("message_count", 0)
    messages_since = new_message_count - old_count

    if messages_since >= 50:
        return True

    if hours_elapsed >= 6.0:
        return True

    return False


__all__ = [
    "analyze_writing_signature",
    "signature_to_directive",
    "merge_signature_directive",
    "needs_reanalysis",
]
