/**
 * Engagement scheduler — registers the four periodic loops (discovery, joiner,
 * engagement, sender) and drives them over connected, engagement-enabled
 * accounts.
 *
 * Gating (applied uniformly to every loop):
 *   1. Master kill switch: engagementConfig.enabled === false -> nothing runs.
 *   2. Account must be CONNECTED (manager.isConnected).
 *   3. Account config.engagementEnabled must be true (per-account kill switch),
 *      OR the backend engagement-plan reports enabled:true (the loop bodies
 *      re-check plan.enabled themselves as the source of truth).
 *
 * Every loop body is wrapped so a single account error can never crash the
 * tick, and ticks are jittered to look human and avoid synchronized bursts.
 */

import { logger } from '../utils/logger.js';
import { engagementConfig } from './config.js';
import { randomInt, sleep } from './rate-limiter.js';
import { runDiscoveryForAccount } from './discovery.js';
import { runJoinerForAccount } from './joiner.js';
import { runEngagementForAccount } from './engagement-loop.js';
import { runSenderForAccount } from './sender.js';

/** Is this account eligible for any engagement work right now? */
function isEligible(manager, accountId) {
  if (!manager.isConnected(accountId)) return false;
  const entry = manager.getAccount(accountId);
  if (!entry) return false;
  // Per-account kill switch. config may be null until first refresh — in that
  // case we defer (the loop bodies also re-check plan.enabled from backend).
  const cfg = entry.config || {};
  if (cfg.engagementEnabled === false) return false;
  return true;
}

/**
 * Iterate eligible accounts and run `fn(accountId, entry)` for each, swallowing
 * per-account errors. Returns the count of accounts processed.
 */
async function forEachEligibleAccount(manager, label, fn) {
  if (!engagementConfig.enabled) return 0;
  let processed = 0;
  for (const [accountId, entry] of manager.accounts) {
    if (!isEligible(manager, accountId)) continue;
    try {
      await fn(accountId, entry);
      processed += 1;
    } catch (err) {
      logger.warn({ accountId, label, error: err.message }, 'Engagement loop iteration failed (continuing)');
    }
  }
  return processed;
}

/**
 * Register a jittered repeating loop. `baseMs` is the nominal interval and
 * `jitterMs` is the +/- random spread. Returns a stop() function.
 */
function registerLoop(label, baseMs, jitterMs, tickFn) {
  let stopped = false;
  let timer = null;

  const scheduleNext = () => {
    if (stopped) return;
    const jitter = jitterMs ? randomInt(-jitterMs, jitterMs) : 0;
    const delay = Math.max(5000, baseMs + jitter);
    timer = setTimeout(run, delay);
    if (timer.unref) timer.unref();
  };

  const run = async () => {
    if (stopped) return;
    try {
      await tickFn();
    } catch (err) {
      logger.warn({ label, error: err.message }, 'Engagement loop tick failed (continuing)');
    } finally {
      scheduleNext();
    }
  };

  scheduleNext();
  logger.info({ label, baseMs, jitterMs }, 'Engagement loop registered');
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

/**
 * Start all engagement loops. Returns a stopAll() function (used on shutdown).
 */
export function startEngagement(manager) {
  if (!engagementConfig.enabled) {
    logger.info('Engagement subsystem DISABLED (ENGAGEMENT_ENABLED=false) — loops not started');
    return () => {};
  }

  logger.info('Starting engagement subsystem (discovery + joiner + loop + sender)');

  const stops = [];

  stops.push(registerLoop('discovery', engagementConfig.discoveryIntervalMs, 0, () =>
    forEachEligibleAccount(manager, 'discovery', (accountId) => runDiscoveryForAccount(accountId))));

  stops.push(registerLoop('joiner', engagementConfig.joinIntervalMs, 0, () =>
    forEachEligibleAccount(manager, 'joiner', (accountId, entry) => runJoinerForAccount(accountId, entry))));

  stops.push(registerLoop('engagement', engagementConfig.loopIntervalMs, engagementConfig.loopJitterMs, () =>
    forEachEligibleAccount(manager, 'engagement', (accountId, entry) => runEngagementForAccount(accountId, entry))));

  stops.push(registerLoop('sender', engagementConfig.senderIntervalMs, 0, () =>
    forEachEligibleAccount(manager, 'sender', (accountId, entry) => runSenderForAccount(accountId, entry))));

  return () => stops.forEach((s) => { try { s(); } catch { /* noop */ } });
}

export { sleep };
