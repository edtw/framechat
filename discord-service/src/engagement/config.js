/**
 * Engagement subsystem configuration — all ENGAGEMENT_* env vars with safe,
 * conservative defaults. Auto-join is the #1 ban signal, so defaults are low.
 *
 * A single master kill switch (ENGAGEMENT_ENABLED) disables the whole
 * subsystem regardless of per-account config. Per-account gating still applies
 * on top of this via DiscordAgentConfig.engagementEnabled.
 */

function num(name, def) {
  const v = parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) ? v : def;
}

function bool(name, def) {
  const v = process.env[name];
  if (v == null || v === '') return def;
  return v === '1' || v.toLowerCase() === 'true';
}

export const engagementConfig = {
  // Master kill switch for the whole engagement subsystem (loops won't even register work).
  enabled: bool('ENGAGEMENT_ENABLED', true),

  // ---- discovery ----
  discoveryIntervalMs: num('ENGAGEMENT_DISCOVERY_INTERVAL_MS', 6 * 60 * 60 * 1000), // 6h
  discoveryMaxPerRun: num('ENGAGEMENT_DISCOVERY_MAX_PER_RUN', 10),

  // ---- joiner ----
  maxJoinsPerDay: num('ENGAGEMENT_MAX_JOINS_PER_DAY', 3),
  joinIntervalMs: num('ENGAGEMENT_JOIN_INTERVAL_MS', 30 * 60 * 1000), // loop tick: 30m
  joinDelayMinMs: num('ENGAGEMENT_JOIN_DELAY_MIN_MS', 2 * 60 * 1000), // 2m
  joinDelayMaxMs: num('ENGAGEMENT_JOIN_DELAY_MAX_MS', 10 * 60 * 1000), // 10m
  // Warm-up: minimum account-connected age before we allow ANY auto-join.
  warmupMs: num('ENGAGEMENT_WARMUP_MS', 60 * 60 * 1000), // 1h
  // Minimum relevance score (0-1) to auto-join a discovered server.
  joinMinRelevance: Number(process.env.ENGAGEMENT_JOIN_MIN_RELEVANCE || '0.3'),

  // ---- engagement loop (proposing messages) ----
  loopIntervalMs: num('ENGAGEMENT_LOOP_INTERVAL_MS', 20 * 60 * 1000), // 20m base
  loopJitterMs: num('ENGAGEMENT_LOOP_JITTER_MS', 10 * 60 * 1000), // +/- up to 10m
  perServerDailyCap: num('ENGAGEMENT_PER_SERVER_DAILY_CAP', 2),
  perUserCooldownMs: num('ENGAGEMENT_PER_USER_COOLDOWN_MS', 12 * 60 * 60 * 1000), // 12h
  recentMessageLookback: num('ENGAGEMENT_RECENT_MESSAGE_LOOKBACK', 30),
  proposeMinRelevance: Number(process.env.ENGAGEMENT_PROPOSE_MIN_RELEVANCE || '0.35'),

  // ---- sender (posts APPROVED items only) ----
  senderIntervalMs: num('ENGAGEMENT_SENDER_INTERVAL_MS', 5 * 60 * 1000), // 5m
  senderBatch: num('ENGAGEMENT_SENDER_BATCH', 5),
  sendDelayMinMs: num('ENGAGEMENT_SEND_DELAY_MIN_MS', 8 * 1000), // 8s
  sendDelayMaxMs: num('ENGAGEMENT_SEND_DELAY_MAX_MS', 45 * 1000), // 45s
  // Global posting rate cap (across all accounts) within a sliding window.
  sendMaxPerHour: num('ENGAGEMENT_SEND_MAX_PER_HOUR', 20),
};

/** Hardcoded blocklist — keywords/guild names we never want to touch. */
export const BLOCKLIST_KEYWORDS = [
  'nsfw', 'porn', 'sex', 'dating', 'gambling', 'casino', 'crypto pump',
  'pump and dump', 'scam', 'free nitro', 'giveaway bot', 'hack', 'cheat',
  'carding', 'cc shop', 'drugs', 'weapon',
];

/** True if any blocklist keyword appears in the provided text. */
export function isBlocklisted(text) {
  if (!text) return false;
  const lc = String(text).toLowerCase();
  return BLOCKLIST_KEYWORDS.some((kw) => lc.includes(kw));
}
