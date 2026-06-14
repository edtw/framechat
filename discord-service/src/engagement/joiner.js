/**
 * Joiner — HEAVILY throttled auto-join of DISCOVERED engagement targets.
 *
 * Auto-join is the #1 self-bot ban signal, so this is deliberately conservative:
 *   - Master kill switch + per-account engagementEnabled gating.
 *   - Warm-up: account must be connected for engagementConfig.warmupMs first.
 *   - Hard daily cap (ENGAGEMENT_MAX_JOINS_PER_DAY, default 3) per account.
 *   - Randomized 2–10 min delay between joins within a run.
 *   - Only one join attempt per loop tick per account (then we stop).
 *   - Relevance gate: skip low-relevance discovered servers.
 *   - Blocklist re-check on resolved guild name; auto-leave (LEFT) if irrelevant.
 *
 * SELF-BOT INVITE API (discord.js-selfbot-v13):
 *   The verified path is `client.acceptInvite(codeOrUrl)`, which resolves the
 *   invite and joins the guild. We call it defensively and tolerate either a
 *   returned Guild or an Invite-with-guild. See TODO note below — if a future
 *   library version renames this, update resolveAndJoin().
 */

import { logger } from '../utils/logger.js';
import { backendClient } from '../api/backend-client.js';
import { engagementConfig, isBlocklisted } from './config.js';
import { planKeywords, scoreText } from './relevance.js';
import {
  dailyLimitReached,
  incrementDaily,
  randomDelay,
} from './rate-limiter.js';

/**
 * Attempt to accept an invite via the self-bot client.
 * Returns the joined Guild object (or a best-effort {id,name}) or throws.
 *
 * TODO(verify): `client.acceptInvite(code)` is the documented method in
 * discord.js-selfbot-v13 v3.x. If the installed version differs, adapt here.
 * We cannot live-test (no real token available in this environment).
 */
async function resolveAndJoin(client, inviteCode) {
  if (typeof client.acceptInvite !== 'function') {
    throw new Error('client.acceptInvite is not available in this selfbot version');
  }
  const result = await client.acceptInvite(inviteCode);
  // acceptInvite may return a Guild, or an Invite carrying `.guild`.
  const guild = result?.guild || result;
  if (!guild || (!guild.id && !guild.name)) {
    throw new Error('acceptInvite returned no resolvable guild');
  }
  return guild;
}

/** Leave a guild we just joined (or already in) — best effort. */
async function leaveGuild(client, guildId) {
  try {
    const guild = client.guilds?.cache?.get?.(guildId);
    if (guild && typeof guild.leave === 'function') {
      await guild.leave();
      return true;
    }
  } catch (err) {
    logger.debug({ guildId, error: err.message }, 'leaveGuild failed');
  }
  return false;
}

/**
 * Run one throttled join pass for a single connected, engagement-enabled account.
 * Performs AT MOST ONE successful join per call (very conservative).
 */
export async function runJoinerForAccount(accountId, entry) {
  // Warm-up: require the account to have been connected for a while.
  const connectedFor = entry.configFetchedAt ? Date.now() - entry.configFetchedAt : 0;
  if (connectedFor < engagementConfig.warmupMs) {
    logger.debug({ accountId, connectedFor }, 'Joiner: account still warming up — skipping');
    return { joined: 0 };
  }

  const dailyKey = `join:${accountId}`;
  if (dailyLimitReached(dailyKey, engagementConfig.maxJoinsPerDay)) {
    logger.debug({ accountId }, 'Joiner: daily join cap reached — skipping');
    return { joined: 0 };
  }

  let plan;
  try {
    plan = await backendClient.getEngagementPlan(accountId);
  } catch (err) {
    logger.debug({ accountId, error: err.message }, 'Joiner: could not load plan — skipping');
    return { joined: 0 };
  }
  if (!plan || plan.enabled !== true) return { joined: 0 };

  const operatorId = plan.operatorId;
  const keywords = planKeywords(plan.plan);
  const discovered = (plan.targets || [])
    .filter((t) => t.status === 'DISCOVERED' && t.inviteCode)
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

  if (discovered.length === 0) return { joined: 0 };

  for (const target of discovered) {
    if (dailyLimitReached(dailyKey, engagementConfig.maxJoinsPerDay)) break;

    // Relevance gate.
    if ((target.relevanceScore || 0) < engagementConfig.joinMinRelevance) {
      logger.debug({ accountId, guildId: target.guildId, score: target.relevanceScore },
        'Joiner: below relevance threshold — skipping');
      continue;
    }
    if (isBlocklisted(target.guildName) || isBlocklisted(target.inviteCode)) {
      await safeUpsertStatus(operatorId, accountId, target, 'BLOCKED');
      continue;
    }

    // Random human-like delay BEFORE the join attempt.
    await randomDelay(engagementConfig.joinDelayMinMs, engagementConfig.joinDelayMaxMs);

    let guild;
    try {
      guild = await resolveAndJoin(entry.client, target.inviteCode);
    } catch (err) {
      logger.warn({ accountId, inviteCode: target.inviteCode, error: err.message },
        'Joiner: acceptInvite failed — marking BLOCKED');
      await safeUpsertStatus(operatorId, accountId, target, 'BLOCKED');
      continue;
    }

    const realGuildId = guild.id || target.guildId;
    const realName = guild.name || target.guildName || null;

    // Post-join relevance / blocklist re-check on the resolved name.
    if (isBlocklisted(realName)) {
      logger.info({ accountId, guildId: realGuildId }, 'Joiner: joined server is blocklisted — leaving');
      await leaveGuild(entry.client, realGuildId);
      await safeUpsertStatus(operatorId, accountId, { ...target, guildId: realGuildId, guildName: realName }, 'LEFT');
      continue;
    }

    const { score } = scoreText(realName || '', keywords);
    const effectiveScore = Math.max(score, target.relevanceScore || 0);

    incrementDaily(dailyKey);

    if (effectiveScore < engagementConfig.joinMinRelevance) {
      // Joined but turned out irrelevant -> auto-leave.
      logger.info({ accountId, guildId: realGuildId, effectiveScore },
        'Joiner: joined server irrelevant — auto-leaving');
      await leaveGuild(entry.client, realGuildId);
      await safeUpsertTarget(operatorId, accountId, {
        guildId: realGuildId, guildName: realName, inviteCode: target.inviteCode,
        status: 'LEFT', relevanceScore: effectiveScore,
      });
    } else {
      await safeUpsertTarget(operatorId, accountId, {
        guildId: realGuildId, guildName: realName, inviteCode: target.inviteCode,
        status: 'ACTIVE', relevanceScore: effectiveScore, joinedAt: new Date(),
      });
      logger.info({ accountId, guildId: realGuildId, name: realName }, 'Joiner: joined engagement target');
    }

    // ONE successful (or attempted) join per tick — stop to stay quiet.
    break;
  }

  return { joined: 1 };
}

/** upsertTarget with status only (no schema for /targets/:id/status in client). */
async function safeUpsertStatus(operatorId, accountId, target, status) {
  await safeUpsertTarget(operatorId, accountId, {
    guildId: target.guildId,
    guildName: target.guildName || null,
    inviteCode: target.inviteCode || null,
    relevanceScore: target.relevanceScore ?? null,
    status,
  });
}

async function safeUpsertTarget(operatorId, accountId, data) {
  try {
    await backendClient.upsertTarget({ operatorId, accountId, ...data });
  } catch (err) {
    logger.debug({ accountId, error: err.message }, 'Joiner: upsertTarget failed');
  }
}
