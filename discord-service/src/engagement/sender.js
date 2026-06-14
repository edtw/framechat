/**
 * Sender — posts ONLY already-APPROVED queue items to their channels.
 *
 * This is the only place engagement messages are actually sent. It never makes
 * a posting decision: a human approved the item (status APPROVED) before it
 * reaches here. We add human-like jitter and a global rate cap, post via the
 * self-bot client, then report SENT/FAILED back to the backend.
 */

import { logger } from '../utils/logger.js';
import { backendClient } from '../api/backend-client.js';
import { engagementConfig } from './config.js';
import { randomDelay, allowInWindow } from './rate-limiter.js';

const GLOBAL_RATE_KEY = 'engagement:send:global';

/**
 * Run one sender pass for a single connected, engagement-enabled account.
 * Posts up to engagementConfig.senderBatch approved items, respecting the
 * global hourly rate cap.
 */
export async function runSenderForAccount(accountId, entry) {
  let items = [];
  try {
    const resp = await backendClient.getApprovedQueue(accountId, engagementConfig.senderBatch);
    items = resp?.items || [];
  } catch (err) {
    logger.debug({ accountId, error: err.message }, 'Sender: could not load approved queue — skipping');
    return { sent: 0 };
  }
  if (items.length === 0) return { sent: 0 };

  const client = entry.client;
  let sent = 0;

  for (const item of items) {
    // Global rate cap across all accounts.
    if (!allowInWindow(GLOBAL_RATE_KEY, engagementConfig.sendMaxPerHour, 60 * 60 * 1000)) {
      logger.info({ accountId }, 'Sender: global hourly rate cap reached — pausing');
      break;
    }

    let ok = false;
    try {
      const channel =
        client.channels?.cache?.get?.(item.channelId) ||
        (await client.channels?.fetch?.(item.channelId).catch(() => null));

      if (!channel || typeof channel.send !== 'function') {
        throw new Error('channel not resolvable / not sendable');
      }

      // Human-like delay before posting.
      await randomDelay(engagementConfig.sendDelayMinMs, engagementConfig.sendDelayMaxMs);
      if (channel.sendTyping) await channel.sendTyping().catch(() => {});
      await channel.send(item.proposedMessage);
      ok = true;
      sent += 1;
      logger.info({ accountId, itemId: item.id, channelId: item.channelId }, 'Sender: approved message posted');
    } catch (err) {
      logger.warn({ accountId, itemId: item.id, error: err.message }, 'Sender: post failed');
    }

    try {
      await backendClient.markQueueResult(item.id, ok ? 'SENT' : 'FAILED', ok ? new Date() : null);
    } catch (err) {
      logger.debug({ accountId, itemId: item.id, error: err.message }, 'Sender: markQueueResult failed');
    }
  }

  return { sent };
}
