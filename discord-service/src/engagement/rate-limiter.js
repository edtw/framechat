/**
 * In-memory rate limiter / throttling helpers for the engagement subsystem.
 *
 * Stateless across restarts on purpose: a fresh boot resets daily counters,
 * which is conservative-safe (it can only reduce activity, never increase it,
 * because backend caps are also enforced and the loops are heavily jittered).
 *
 * No external deps — all counters live in process memory.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** key -> { count, windowStart } daily counters. */
const dailyCounters = new Map();
/** key -> timestamp(ms) of last action (cooldowns). */
const lastAction = new Map();
/** key -> array of timestamps (sliding-window rate caps). */
const slidingWindows = new Map();

/** Random integer in [min, max] inclusive. */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Sleep helper (ms). */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Random sleep in [minMs, maxMs]. */
export function randomDelay(minMs, maxMs) {
  return sleep(randomInt(minMs, maxMs));
}

/**
 * Daily counter helpers. Window auto-resets after 24h from first increment.
 */
export function getDailyCount(key) {
  const entry = dailyCounters.get(key);
  if (!entry) return 0;
  if (Date.now() - entry.windowStart >= DAY_MS) {
    dailyCounters.delete(key);
    return 0;
  }
  return entry.count;
}

export function dailyLimitReached(key, max) {
  return getDailyCount(key) >= max;
}

export function incrementDaily(key) {
  const now = Date.now();
  const entry = dailyCounters.get(key);
  if (!entry || now - entry.windowStart >= DAY_MS) {
    dailyCounters.set(key, { count: 1, windowStart: now });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/**
 * Cooldown helpers — has `key` acted within the last `cooldownMs`?
 */
export function isOnCooldown(key, cooldownMs) {
  const last = lastAction.get(key);
  if (last == null) return false;
  return Date.now() - last < cooldownMs;
}

export function markAction(key) {
  lastAction.set(key, Date.now());
}

/**
 * Sliding-window global rate cap. Returns true if a new action is allowed
 * (and records it); false if the cap is hit.
 */
export function allowInWindow(key, maxActions, windowMs) {
  const now = Date.now();
  const arr = (slidingWindows.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= maxActions) {
    slidingWindows.set(key, arr);
    return false;
  }
  arr.push(now);
  slidingWindows.set(key, arr);
  return true;
}

/** Test/debug helper — wipe all in-memory state. */
export function _resetAll() {
  dailyCounters.clear();
  lastAction.clear();
  slidingWindows.clear();
}
