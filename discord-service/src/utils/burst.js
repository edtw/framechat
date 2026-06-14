/**
 * Message burst detection and multi-message handling for Discord.
 *
 * Mirrors the Python burst logic from the AI handler (whatsapp-service / ai-handler).
 * Handles:
 *   1. Detecting when a user sent multiple rapid-fire messages (a "burst").
 *   2. Formatting burst messages for the AI prompt with timing annotations.
 *   3. Splitting a long AI reply into natural short messages for rapid-fire sending.
 *   4. Calculating inter-message delays during burst reply delivery.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Max interval (ms) between two messages for them to be in the same burst. */
const BURST_MAX_INTERVAL_MS = 5000;

/** Minimum number of messages to consider something a burst. */
const BURST_MIN_COUNT = 2;

/** Messages shorter than this may be fragmentation signals. */
const FRAGMENT_SHORT_THRESHOLD = 60;

/** Ending punctuation — messages lacking these on non-final positions are
 *  a fragmentation signal. */
const ENDING_PUNCTUATION = /[.!?;:"'»)]$/;

/** Maximum characters per split message when bursting replies. */
const MAX_SPLIT_CHARS = 500;

/** Preferred split characters (natural break points in order of quality). */
const SPLIT_CHARS = ['. ', '! ', '? ', '\n\n', '\n', ', ', '; ', ': ', ' - ', ' '];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Clamp a value between min and max (inclusive).
 */
function clamp(value, min, max) {
  if (Number.isNaN(value)) {
    return Math.round((min + max) / 2);
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Return a random multiplier in [1 - ratio, 1 + ratio].
 */
function jitter(ratio = 0.3) {
  return 1 - ratio + Math.random() * ratio * 2;
}

/**
 * Check if a message looks like a fragment of a larger thought.
 * Signals: short length, no ending punctuation, starts lowercase,
 * looks like a continuation.
 */
function isFragmentSignal(msg, index, total) {
  const content = (msg.content || '').trim();
  if (!content) return false;

  // Final message in the burst is less likely to look fragmented.
  const isLast = index === total - 1;

  let signals = 0;

  // Signal 1: Very short message.
  if (content.length < FRAGMENT_SHORT_THRESHOLD) {
    signals++;
  }

  // Signal 2: No ending punctuation (stronger signal for non-final messages).
  if (!ENDING_PUNCTUATION.test(content)) {
    signals += isLast ? 0.5 : 1;
  }

  // Signal 3: Starts with lowercase (continuation of previous thought).
  if (/^[a-záéíóúâêîôûãõàèìòùç]/.test(content)) {
    signals++;
  }

  // Signal 4: Starts with a conjunction (and, but, because, etc.) — clear
  // continuation of previous message.
  if (/^(e|ou|mas|porque|pq|que|tipo|assim|ent[aã]o|tamb[eé]m|al[ií]as|s[oó] que|da[ií]|a[ií]|tlg|tlgd|[&+])[\s,]/i.test(content)) {
    signals += 2;
  }

  // Signal 5: Ends with ellipsis (trailing thought).
  if (/\.{2,}$/.test(content)) {
    signals++;
  }

  return signals >= 2;
}

// ─── Function 1: detectBurst ─────────────────────────────────────────────────

/**
 * Detect whether a sequence of messages constitutes a "burst" — multiple
 * messages sent in rapid succession, often representing a fragmented thought.
 *
 * @param {Array<{content: string, timestamp: number}>} messages
 *        Array of message objects. Timestamps in milliseconds (Date.now() or
 *        similar epoch ms).
 * @returns {{burst: boolean, burstSize: number, avgIntervalMs: number, isFragmented: boolean}}
 *          burst          — true if the sequence qualifies as a burst.
 *          burstSize      — number of messages in the detected burst.
 *          avgIntervalMs  — average interval between consecutive messages in ms.
 *          isFragmented   — true if the messages show fragmentation signals
 *                           (short, no punctuation, continuations).
 */
export function detectBurst(messages) {
  if (!Array.isArray(messages)) return { burst: false, burstSize: 0, avgIntervalMs: 0, isFragmented: false };

  if (messages.length < BURST_MIN_COUNT) {
    return {
      burst: false,
      burstSize: messages?.length || 0,
      avgIntervalMs: 0,
      isFragmented: false,
    };
  }

  // Sort by timestamp ascending.
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);

  // Calculate inter-message intervals.
  const intervals = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(sorted[i].timestamp - sorted[i - 1].timestamp);
  }

  // All intervals must be within the burst window.
  const allWithinWindow = intervals.every((iv) => iv <= BURST_MAX_INTERVAL_MS);

  if (!allWithinWindow) {
    return {
      burst: false,
      burstSize: sorted.length,
      avgIntervalMs: intervals.length > 0
        ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
        : 0,
      isFragmented: false,
    };
  }

  // Max interval in the sequence is still short → strong burst.
  const maxInterval = intervals.length > 0 ? Math.max(...intervals) : 0;
  const avgIntervalMs = intervals.length > 0
    ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
    : 0;

  // A burst is confirmed when the max interval is within the window OR the
  // average interval is very short (under 1500ms indicates rapid-fire).
  const isBurst =
    maxInterval <= BURST_MAX_INTERVAL_MS || avgIntervalMs < 1500;

  // Check fragmentation signals across the messages.
  const fragmentCount = sorted.filter((msg, i) =>
    isFragmentSignal(msg, i, sorted.length),
  ).length;
  const isFragmented = fragmentCount >= Math.ceil(sorted.length / 2);

  return {
    burst: isBurst,
    burstSize: sorted.length,
    avgIntervalMs,
    isFragmented,
  };
}

// ─── Function 2: formatIncomingForAI ─────────────────────────────────────────

/**
 * Format buffered messages for the AI prompt with burst awareness.
 * Preserves the social-media conversation feel so the AI understands context
 * and urgency.
 *
 * When burst is active, messages are formatted with relative timestamps:
 *
 *   [RÁPIDO - 3 mensagens em 4.1s]:
 *   0.0s: oi
 *   1.3s: queria saber uma coisa
 *   2.8s: sobre o revolut
 *
 * When not a burst, returns a single-message format or a simple concatenation
 * with timestamps for multiple messages.
 *
 * @param {Array<{content: string, timestamp: number}>} messages
 *        Array of message objects.
 * @param {{burst: boolean, burstSize: number, avgIntervalMs: number, isFragmented: boolean}} burstInfo
 *        Output from detectBurst().
 * @returns {string} Formatted string ready for the AI prompt.
 */
export function formatIncomingForAI(messages, burstInfo) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return '';
  }

  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);

  // Single message — no burst formatting needed.
  if (sorted.length === 1) {
    return sorted[0].content || '';
  }

  // Multiple messages but not a burst — join with simple separators.
  if (!burstInfo || !burstInfo.burst) {
    return sorted
      .map((m) => m.content || '')
      .filter(Boolean)
      .join('\n');
  }

  // Burst formatting: annotated with relative timestamps.
  const firstTs = sorted[0].timestamp;
  const totalSpanS = (
    (sorted[sorted.length - 1].timestamp - firstTs) /
    1000
  ).toFixed(1);

  const extraTags = [];
  if (burstInfo.isFragmented) {
    extraTags.push('FRAGMENTADO');
  }

  const tagStr = extraTags.length > 0 ? ` ${extraTags.join(' ')}` : '';

  const lines = [
    `[RÁPIDO - ${sorted.length} mensagens em ${totalSpanS}s${tagStr}]:`,
  ];

  for (const msg of sorted) {
    const relSec = ((msg.timestamp - firstTs) / 1000).toFixed(1);
    lines.push(`  ${relSec}s: ${msg.content || ''}`);
  }

  return lines.join('\n');
}

// ─── Function 3: splitReplyIntoMessages ───────────────────────────────────────

/**
 * Given an AI reply string, optionally split into multiple short messages
 * for natural rapid-fire (burst) sending. Mimics how a human sends several
 * short messages instead of one wall of text.
 *
 * Splitting strategy:
 *   1. If the reply is short enough, return it as-is.
 *   2. Try to split at sentence boundaries (`. `, `! `, `? `).
 *   3. If no sentence breaks found, try line breaks, then commas, then words.
 *   4. Each chunk targets MAX_SPLIT_CHARS or shorter.
 *   5. Never break a message mid-word unless absolutely necessary.
 *
 * @param {string} reply - The full AI reply text to potentially split.
 * @param {object} [partnerSignature] - Optional writing signature info
 *        (reserved for future adaptive splitting based on partner style).
 * @returns {string[]} Array of message strings. If no split is needed, returns
 *                     a single-element array [reply].
 */
export function splitReplyIntoMessages(reply, partnerSignature) {
  if (!reply || typeof reply !== 'string') {
    return [''];
  }

  const trimmed = reply.trim();
  if (trimmed.length === 0) {
    return [''];
  }

  // Short enough — no split needed.
  if (trimmed.length <= MAX_SPLIT_CHARS) {
    return [trimmed];
  }

  const chunks = [];

  /**
   * Recursively split a string into chunks at the best available break point.
   */
  function splitChunk(text) {
    if (text.length <= MAX_SPLIT_CHARS) {
      if (text.trim()) {
        chunks.push(text.trim());
      }
      return;
    }

    // Find the best split point within the target range.
    // Search backwards from MAX_SPLIT_CHARS to find a natural break.
    const searchStart = Math.min(MAX_SPLIT_CHARS, text.length);

    for (const sep of SPLIT_CHARS) {
      // Find the LAST occurrence of this separator within our window.
      const searchRegion = text.substring(0, searchStart + sep.length);
      const pos = searchRegion.lastIndexOf(sep);

      if (pos > 0 && pos <= searchStart) {
        const breakPoint = pos + sep.length;
        const first = text.substring(0, breakPoint).trim();
        const rest = text.substring(breakPoint).trim();

        if (first) {
          chunks.push(first);
        }
        if (rest) {
          splitChunk(rest);
        }
        return;
      }
    }

    // No natural break found — force-split at MAX_SPLIT_CHARS, at a word
    // boundary if possible.
    const hardBreak = text.lastIndexOf(' ', MAX_SPLIT_CHARS);
    if (hardBreak > 0) {
      const first = text.substring(0, hardBreak).trim();
      const rest = text.substring(hardBreak).trim();
      if (first) {
        chunks.push(first);
      }
      if (rest) {
        splitChunk(rest);
      }
      return;
    }

    // Absolute last resort: split at MAX_SPLIT_CHARS exactly.
    chunks.push(text.substring(0, MAX_SPLIT_CHARS).trim());
    const remaining = text.substring(MAX_SPLIT_CHARS).trim();
    if (remaining) {
      splitChunk(remaining);
    }
  }

  splitChunk(trimmed);

  // If nothing was produced (shouldn't happen), return original.
  if (chunks.length === 0) {
    return [trimmed];
  }

  return chunks;
}

// ─── Function 4: calculateInterMessageDelay ──────────────────────────────────

/**
 * Calculate the delay between consecutive messages when sending a burst reply.
 *
 * Models natural human burst-sending behavior:
 *   - First message: comes after the main thinking/typing delay (already
 *     accounted for by the caller). The delay before sending the first message
 *     is typically longer because the human is composing the initial response.
 *     This function handles delays BETWEEN burst messages (message 2, 3, ...).
 *   - Middle messages: ~800–2000ms (still typing/thinking about follow-ups).
 *   - Last message: slightly longer pause ("finishing the thought").
 *   - Add random jitter ±30% on every delay.
 *
 * The burstIndex parameter is 0-based (0 = first message in the burst,
 * 1 = second, etc.). The delay returned is the wait BEFORE sending the
 * message at `burstIndex`. For burstIndex 0, the main response delay
 * should be used instead — this function returns a small "lead-in" for
 * index 0 and the natural inter-message delay for index > 0.
 *
 * @param {number} burstIndex - 0-based index of the message in the burst
 *        sequence (0 = first message, 1 = second, etc.).
 * @param {number} burstSize - Total number of messages in this burst.
 * @param {number} [baseDelayMs=1200] - Base inter-message delay in ms.
 * @returns {number} Delay in milliseconds to wait before sending this message.
 */
export function calculateInterMessageDelay(
  burstIndex,
  burstSize,
  baseDelayMs = 1200,
) {
  if (burstSize <= 1) {
    return 0;
  }

  // First message (index 0): the main response delay is handled externally.
  // We return a minimal delay here — the caller should use its own pre-burst
  // delay for the first message.
  if (burstIndex === 0) {
    return 0;
  }

  const isLast = burstIndex === burstSize - 1;

  let delay;

  if (isLast) {
    // Last message: slightly longer pause — "finishing the thought."
    // Base is 1.2x – 1.8x the standard delay.
    delay = baseDelayMs * (1.2 + Math.random() * 0.6);
  } else {
    // Middle messages: standard typing + thinking time for a short follow-up.
    // Varies between 0.7x and 1.4x base.
    delay = baseDelayMs * (0.7 + Math.random() * 0.7);
  }

  // Apply jitter (±30%).
  delay = delay * jitter(0.3);

  // Clamp to reasonable human range.
  // Min 400ms (never send faster than this) — prevents looking like a bot.
  // Max 4000ms (if you wait longer than 4s between burst messages, it is
  // no longer a burst — the partner may start typing).
  return clamp(delay, 400, 4000);
}
