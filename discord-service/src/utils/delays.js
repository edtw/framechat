/**
 * Human-like response delay calculator for Discord.
 *
 * Models real human messaging behavior:
 *   1. Read the incoming message
 *   2. Think about what to say
 *   3. Type the reply
 *   4. Briefly re-read before sending
 *
 * Every delay includes natural random variance. Typing speed and cognitive
 * delays vary per-message (not per-character) to avoid uniform output.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Average human typing speed in characters per minute. */
const DEFAULT_TYPING_SPEED_CPM = 280;

/** Fast typer CPM — used when "already on phone" variance strikes. */
const FAST_TYPING_CPM = 350;

/** Distracted / slow typer CPM — used for "extra long" variance strikes. */
const SLOW_TYPING_CPM = 180;

/** Slow hours range: [startHour, endHour) in local time (24h). */
const SLOW_HOURS_START = 2;
const SLOW_HOURS_END = 6;

/** Active hours range: [startHour, endHour) in local time (24h). */
const ACTIVE_HOURS_START = 9;
const ACTIVE_HOURS_END = 22;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Clamp a value between min and max (inclusive).
 * If value is NaN (e.g. from bad inputs), returns the midpoint of the clamp
 * range.
 */
function clamp(value, min, max) {
  if (Number.isNaN(value)) {
    return Math.round((min + max) / 2);
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Return a random multiplier in [1 - ratio, 1 + ratio].
 * E.g. ratio=0.3 gives values between 0.7 and 1.3.
 */
function jitter(ratio = 0.3) {
  return 1 - ratio + Math.random() * ratio * 2;
}

/**
 * Count how many "decision points" appear in a message.
 * Decision points: explicit questions (`?`), choice words, interrogatives.
 */
function countComplexity(text) {
  if (!text || typeof text !== "string") return 0;

  // Each `?` counts as one decision point.
  const questionMarks = (text.match(/\?/g) || []).length;

  // Interrogative / choice words — count each occurrence.
  const interrogatives = text.match(
    /\b(or|choose|decide|which|what|how|why|when|where|who|should|could|would|can you|will you|help|explain|tell me|pick|select|option|either|maybe|perhaps|think|suggest|recommend|advise|opinion|prefer|better|best)\b/gi,
  ) || [];
  const interrogativeCount = interrogatives.length;

  // Commas separating clauses add minor complexity.
  const clauseSeparators = (text.match(/[,;:]/g) || []).length;

  // Total complexity: questions are primary, interrogative words secondary,
  // clause complexity tertiary.
  const raw =
    questionMarks * 3 +
    interrogativeCount * 1.5 +
    Math.floor(clauseSeparators / 3);

  // Cap at a reasonable maximum — beyond ~15 it is already "very complex."
  return Math.min(raw, 15);
}

/**
 * Determine the effective typing speed (CPM) for this message.
 * Incorporates per-message variance and time-of-day adjustments.
 */
function effectiveTypingSpeed(baseCPM) {
  const rand = Math.random();

  // 1 in 8 messages: extra-long delay (slow typer / distracted).
  if (rand < 1 / 8) {
    return SLOW_TYPING_CPM * jitter(0.25);
  }

  // 1 in 15 messages: very fast reply (already on phone).
  if (rand < 1 / 8 + 1 / 15) {
    return FAST_TYPING_CPM * jitter(0.2);
  }

  // Normal case: base CPM with per-message speed variance.
  return baseCPM * jitter(0.25);
}

/**
 * Return a time-of-day multiplier for delays.
 *   - 2am – 6am:   slower (1.3x – 1.8x) — human is tired / half-asleep
 *   - 9am – 10pm:  slightly faster (0.85x – 1.0x) — active waking hours
 *   - otherwise:    normal (1.0x)
 */
function timeOfDayMultiplier() {
  const hour = new Date().getHours();

  // Slow hours: 2am – 6am local.
  if (hour >= SLOW_HOURS_START && hour < SLOW_HOURS_END) {
    return 1.3 + Math.random() * 0.5; // 1.3 – 1.8
  }

  // Active hours: 9am – 10pm local.
  if (hour >= ACTIVE_HOURS_START && hour < ACTIVE_HOURS_END) {
    return 0.85 + Math.random() * 0.15; // 0.85 – 1.0
  }

  // Transitional hours (6am–9am, 10pm–2am): normal.
  return 1.0;
}

/**
 * Extra-delay spike: 1 in 8 messages get a long pause (the "distracted"
 * spike). Returns a multiplier applied to the think + read phases.
 */
function distractionSpikeMultiplier() {
  // The 1-in-8 check lives in effectiveTypingSpeed for typing.
  // For read/think we apply the same spike independently so the full
  // experience (read slow + think slow + type slow) can compound.
  if (Math.random() < 1 / 8) {
    return 1.5 + Math.random() * 1.5; // 1.5x – 3.0x
  }
  return 1.0;
}

// ─── Individual Delay Calculators ────────────────────────────────────────────

/**
 * READ_DELAY — Time to "read" the incoming message.
 *
 *   base = 500ms + (message_length / 20) * 100ms
 *   jitter: ±30%
 *   clamped: 800ms – 4000ms
 *
 * @param {string} incomingMessage - The message that was received.
 * @returns {number} Read delay in milliseconds.
 */
export function readDelay(incomingMessage) {
  const length = typeof incomingMessage === "string" ? incomingMessage.length : 0;
  const base = 500 + (length / 20) * 100;
  const withJitter = base * jitter(0.3);
  const withDistraction = withJitter * distractionSpikeMultiplier();
  const withTod = withDistraction * timeOfDayMultiplier();
  return clamp(withTod, 800, 4000);
}

/**
 * THINK_DELAY — Cognitive processing time.
 *
 *   base = 1000ms + (complexity * 200ms)
 *   complexity = count of questions, requests, choices in the message
 *   jitter: ±50% (thinking is highly variable)
 *   clamped: 500ms – 8000ms
 *
 * @param {string} incomingMessage - The message to analyze for complexity.
 * @returns {number} Think delay in milliseconds.
 */
export function thinkDelay(incomingMessage) {
  const complexity = countComplexity(incomingMessage);
  const base = 1000 + complexity * 200;
  const withJitter = base * jitter(0.5);
  const withDistraction = withJitter * distractionSpikeMultiplier();
  const withTod = withDistraction * timeOfDayMultiplier();
  return clamp(withTod, 500, 8000);
}

/**
 * TYPING_DELAY — Time to physically type the reply.
 *
 *   base = reply.length * (60000 / TYPING_SPEED_CPM)
 *   Speed varies per message (fast / normal / distracted).
 *   clamped: 800ms – 15000ms
 *
 * @param {string} replyText - The text the bot will send.
 * @param {object} [options] - Optional overrides.
 * @param {number} [options.typingSpeedCPM] - Base characters-per-minute (default 280).
 * @returns {number} Typing delay in milliseconds.
 */
export function typingDelay(replyText, options = {}) {
  const length = typeof replyText === "string" ? replyText.length : 0;
  if (length === 0) {
    return 800; // Minimum — nobody "types" zero characters instantly.
  }

  const baseCPM = options.typingSpeedCPM ?? DEFAULT_TYPING_SPEED_CPM;
  const cpm = effectiveTypingSpeed(baseCPM);
  const base = length * (60000 / cpm);
  const withTod = base * timeOfDayMultiplier();
  return clamp(withTod, 800, 15000);
}

/**
 * SEND_DELAY — Small gap after typing before hitting send.
 *
 * Simulates re-reading what you wrote. Fixed random range.
 *
 * @returns {number} Send delay in milliseconds (200–800).
 */
export function sendDelay() {
  return 200 + Math.random() * 600;
}

// ─── Composite Calculators ───────────────────────────────────────────────────

/**
 * Calculate the full human-like delay for a message exchange.
 *
 * Models: Read → Think → Type → Send
 *
 * @param {string} incomingMessage - The message received from the user.
 * @param {string} replyText - The text the bot will send back.
 * @param {object} [options] - Optional configuration.
 * @param {number} [options.typingSpeedCPM=280] - Base typing speed in CPM.
 * @returns {{
 *   totalDelayMs: number,
 *   breakdown: { read: number, think: number, typing: number, send: number },
 *   shouldShowTyping: boolean,
 *   typingDurationMs: number,
 * }}
 */
export function calculateHumanDelay(incomingMessage, replyText, options = {}) {
  const read = readDelay(incomingMessage);
  const think = thinkDelay(incomingMessage);
  const typing = typingDelay(replyText, options);
  const send = sendDelay();

  const totalDelayMs = read + think + typing + send;

  // Typing indicator should only show during read + think + typing.
  // The send delay is the "re-read before hitting enter" gap — the user
  // already sees the reply text at that point, so the typing indicator
  // would look wrong.
  const typingDurationMs = read + think + typing;

  // Always show typing indicator unless the total response is trivially fast
  // (< 1.5s) — at that point the indicator flash is more distracting than
  // helpful.
  const shouldShowTyping = typingDurationMs >= 1500;

  return {
    totalDelayMs: Math.round(totalDelayMs),
    breakdown: {
      read: Math.round(read),
      think: Math.round(think),
      typing: Math.round(typing),
      send: Math.round(send),
    },
    shouldShowTyping,
    typingDurationMs: Math.round(typingDurationMs),
  };
}

/**
 * Calculate how long the Discord typing indicator should be displayed.
 *
 * This covers Read + Think + Typing, but NOT the send delay (the human
 * has already "sent" at that point from Discord's perspective).
 *
 * @param {string} incomingMessage - The message received from the user.
 * @param {string} replyText - The text the bot will send back.
 * @param {object} [options] - Optional configuration.
 * @param {number} [options.typingSpeedCPM=280] - Base typing speed in CPM.
 * @returns {number} Typing indicator duration in milliseconds.
 */
export function calculateTypingIndicatorDuration(
  incomingMessage,
  replyText,
  options = {},
) {
  const result = calculateHumanDelay(incomingMessage, replyText, options);
  return result.typingDurationMs;
}

/**
 * Convenience — total delay only (no breakdown).
 *
 * @param {string} incomingMessage
 * @param {string} replyText
 * @param {object} [options]
 * @returns {number} Total delay in milliseconds.
 */
export function totalDelay(incomingMessage, replyText, options = {}) {
  return calculateHumanDelay(incomingMessage, replyText, options).totalDelayMs;
}
