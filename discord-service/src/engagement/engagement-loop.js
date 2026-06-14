/**
 * Engagement loop — proposes (NEVER posts) value-first replies into the
 * approval queue for ACTIVE engagement targets.
 *
 * Posture: value-first / soft. We look for a single genuinely-relevant opening
 * in a channel, draft a helpful, participatory message via the AI handler, and
 * push it to the human approval queue. A human approves before anything is
 * sent (sender.js handles posting APPROVED items only).
 *
 * Throttling:
 *   - Master kill switch + per-account engagementEnabled gating.
 *   - Per-server daily cap (ENGAGEMENT_PER_SERVER_DAILY_CAP).
 *   - Per-user cooldown (ENGAGEMENT_PER_USER_COOLDOWN_MS).
 *   - Only the SINGLE best opening per account per tick is proposed.
 *   - Relevance gate on the trigger message.
 */

import { logger } from '../utils/logger.js';
import { backendClient } from '../api/backend-client.js';
import { aiHandlerClient } from '../api/ai-handler-client.js';
import { engagementConfig, isBlocklisted } from './config.js';
import { planKeywords, scoreText } from './relevance.js';
import {
  dailyLimitReached,
  incrementDaily,
  isOnCooldown,
  markAction,
} from './rate-limiter.js';

/**
 * Pull recent messages from a text channel via the self-bot client.
 * Returns [] defensively on any failure.
 */
async function fetchRecentMessages(client, guild, limit) {
  try {
    const channels = guild.channels?.cache;
    if (!channels) return [];
    // Pick the first viewable text channel where we can read history.
    const textChannels = [...channels.values()].filter((c) => {
      const isText = c?.isText?.() || c?.type === 'GUILD_TEXT' || c?.type === 0;
      return isText && typeof c.messages?.fetch === 'function';
    });
    const collected = [];
    for (const ch of textChannels.slice(0, 5)) {
      try {
        const msgs = await ch.messages.fetch({ limit: Math.min(limit, 50) });
        for (const msg of msgs.values()) {
          if (msg.author?.bot) continue;
          if (msg.author?.id === client.user?.id) continue;
          if (!msg.content) continue;
          collected.push({
            id: msg.id,
            content: msg.content,
            authorId: msg.author?.id,
            authorName: msg.author?.globalName || msg.author?.username,
            channelId: ch.id,
            channelName: ch.name,
          });
        }
      } catch {
        // skip channels we can't read
      }
    }
    return collected;
  } catch (err) {
    logger.debug({ error: err.message }, 'fetchRecentMessages failed');
    return [];
  }
}

/**
 * Run one engagement pass for a single connected, engagement-enabled account.
 * Proposes at most ONE queue item per call.
 */
export async function runEngagementForAccount(accountId, entry) {
  let plan;
  try {
    plan = await backendClient.getEngagementPlan(accountId);
  } catch (err) {
    logger.debug({ accountId, error: err.message }, 'Engagement: could not load plan — skipping');
    return { proposed: 0 };
  }
  if (!plan || plan.enabled !== true) return { proposed: 0 };

  const operatorId = plan.operatorId;
  const keywords = planKeywords(plan.plan);
  const client = entry.client;

  const activeTargets = (plan.targets || []).filter((t) => t.status === 'ACTIVE' && t.guildId);
  if (activeTargets.length === 0) return { proposed: 0 };

  // Gather candidate openings across all active servers, then pick the best one.
  let best = null; // { score, msg, guildId, guildName, dailyKey }

  for (const target of activeTargets) {
    const dailyKey = `propose:${accountId}:${target.guildId}`;
    if (dailyLimitReached(dailyKey, engagementConfig.perServerDailyCap)) continue;

    const guild = client.guilds?.cache?.get?.(target.guildId);
    if (!guild) continue; // resolved guild not in cache (surrogate id, or not joined)

    const messages = await fetchRecentMessages(client, guild, engagementConfig.recentMessageLookback);
    for (const msg of messages) {
      if (isBlocklisted(msg.content)) continue;
      // Per-user cooldown.
      const userKey = `engage-user:${accountId}:${msg.authorId}`;
      if (isOnCooldown(userKey, engagementConfig.perUserCooldownMs)) continue;

      const { score } = scoreText(msg.content, keywords);
      if (score < engagementConfig.proposeMinRelevance) continue;

      if (!best || score > best.score) {
        best = { score, msg, guildId: target.guildId, guildName: target.guildName || guild.name, dailyKey };
      }
    }
  }

  if (!best) return { proposed: 0 };

  // Draft a value-first proposed reply via the AI handler.
  let proposedMessage;
  try {
    const ai = await aiHandlerClient.processMessage(best.msg.content, {
      session_id: `discord_${accountId}`,
      chat_jid: best.msg.channelId,
      contact_name: best.msg.authorName,
      system_prompt:
        'You are a genuine, helpful community member. Reply to the message in a value-first, ' +
        'soft way: be useful and participatory, in the language of the message. Do NOT post links ' +
        'or sales pitches. Only mention an offer if directly asked. Keep it short and human.',
      behavior: plan.plan?.behavior || null,
      temperature: 0.7,
      max_tokens: 300,
    });
    proposedMessage = ai?.response;
  } catch (err) {
    logger.debug({ accountId, error: err.message }, 'Engagement: AI draft failed — skipping');
    return { proposed: 0 };
  }
  if (!proposedMessage) return { proposed: 0 };

  // Push to approval queue — NEVER post directly.
  try {
    await backendClient.createQueueItem({
      operatorId,
      accountId,
      guildId: best.guildId,
      guildName: best.guildName,
      channelId: best.msg.channelId,
      channelName: best.msg.channelName,
      triggerMessageId: best.msg.id,
      triggerContext: best.msg.content?.slice(0, 1000),
      proposedMessage,
      relevanceScore: best.score,
    });
    incrementDaily(best.dailyKey);
    markAction(`engage-user:${accountId}:${best.msg.authorId}`);
    // Touch lastEngagedAt on the target (best effort).
    await backendClient.upsertTarget({
      operatorId, accountId, guildId: best.guildId, guildName: best.guildName,
      status: 'ACTIVE', lastEngagedAt: new Date(),
    }).catch(() => {});
    logger.info({ accountId, guildId: best.guildId, score: best.score },
      'Engagement: proposed message queued for approval');
    return { proposed: 1 };
  } catch (err) {
    logger.debug({ accountId, error: err.message }, 'Engagement: createQueueItem failed');
    return { proposed: 0 };
  }
}
