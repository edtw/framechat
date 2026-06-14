/**
 * Discovery — finds candidate Discord servers from public listing sources and
 * upserts them as EngagementTargets (status DISCOVERED).
 *
 * Source: Disboard public search (https://disboard.org/search?keyword=...).
 * We parse server cards for invite codes + names from the static HTML. This is
 * intentionally best-effort and DEFENSIVE: every network/parse op is wrapped in
 * try/catch and we skip silently on any failure — discovery must never crash
 * the service.
 *
 * Nothing here joins anything. It only records candidates for later, throttled
 * joining by joiner.js (which is itself approval/throttle gated).
 */

import { logger } from '../utils/logger.js';
import { backendClient } from '../api/backend-client.js';
import { engagementConfig, isBlocklisted } from './config.js';
import { planKeywords, scoreText } from './relevance.js';
import { randomDelay } from './rate-limiter.js';

const DISBOARD_BASE = 'https://disboard.org/search';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/**
 * Fetch + parse Disboard search results for a single keyword.
 * Returns an array of { inviteCode, guildName, guildId? }.
 */
async function fetchDisboard(keyword) {
  const url = `${DISBOARD_BASE}?keyword=${encodeURIComponent(keyword)}`;
  let html;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: controller.signal,
    }).finally(() => clearTimeout(t));
    if (!resp.ok) {
      logger.debug({ keyword, status: resp.status }, 'Disboard search non-200 — skipping');
      return [];
    }
    html = await resp.text();
  } catch (err) {
    logger.debug({ keyword, error: err.message }, 'Disboard fetch failed — skipping');
    return [];
  }

  const results = [];
  try {
    // Disboard "join" links look like /server/join/<id>?... and the public
    // invite often surfaces as discord.gg/<code>. Capture both shapes
    // defensively; we treat whatever code-like token we find as inviteCode.
    const seen = new Set();

    // discord.gg / discord.com invite codes
    const inviteRe = /discord(?:\.gg|app\.com\/invite|\.com\/invite)\/([a-zA-Z0-9-]{2,32})/g;
    let m;
    while ((m = inviteRe.exec(html)) !== null) {
      const code = m[1];
      if (code && !seen.has(code)) {
        seen.add(code);
        results.push({ inviteCode: code, guildName: null, guildId: null });
      }
    }

    // Server name cards (best-effort): <div class="server-name"> ... </div>
    const nameRe = /server-name[^>]*>\s*<a[^>]*>([^<]{2,80})<\/a>/g;
    const names = [];
    while ((m = nameRe.exec(html)) !== null) {
      names.push(m[1].trim());
    }
    // Pair names with codes positionally where possible (best-effort only).
    for (let i = 0; i < results.length && i < names.length; i += 1) {
      results[i].guildName = names[i];
    }
  } catch (err) {
    logger.debug({ keyword, error: err.message }, 'Disboard parse failed — skipping');
    return [];
  }

  return results;
}

/**
 * Run discovery for a single engagement-enabled account.
 * Pulls the account's plan keywords, queries the listing source per keyword,
 * scores + filters candidates, and upserts the best ones as DISCOVERED targets.
 */
export async function runDiscoveryForAccount(accountId) {
  let plan;
  try {
    plan = await backendClient.getEngagementPlan(accountId);
  } catch (err) {
    logger.debug({ accountId, error: err.message }, 'Discovery: could not load plan — skipping');
    return { discovered: 0 };
  }

  if (!plan || plan.enabled !== true) return { discovered: 0 };

  const operatorId = plan.operatorId;
  const keywords = planKeywords(plan.plan);
  // Use a small subset of keywords as search seeds to stay quiet/conservative.
  const seeds = keywords.slice(0, 4);

  // Avoid re-discovering servers we already track.
  const knownGuildIds = new Set((plan.targets || []).map((t) => t.guildId).filter(Boolean));
  const knownCodes = new Set((plan.targets || []).map((t) => t.inviteCode).filter(Boolean));

  let discovered = 0;
  for (const seed of seeds) {
    if (discovered >= engagementConfig.discoveryMaxPerRun) break;
    let candidates = [];
    try {
      candidates = await fetchDisboard(seed);
    } catch (err) {
      logger.debug({ accountId, seed, error: err.message }, 'Discovery seed failed — skipping');
      continue;
    }

    for (const c of candidates) {
      if (discovered >= engagementConfig.discoveryMaxPerRun) break;
      try {
        if (!c.inviteCode) continue;
        if (knownCodes.has(c.inviteCode)) continue;
        if (c.guildId && knownGuildIds.has(c.guildId)) continue;

        const nameText = `${c.guildName || ''} ${seed}`;
        if (isBlocklisted(nameText) || isBlocklisted(c.inviteCode)) {
          logger.debug({ inviteCode: c.inviteCode }, 'Discovery: blocklisted candidate skipped');
          continue;
        }

        const { score, matched } = scoreText(nameText, keywords);

        // We don't know the real guildId until we resolve the invite (done at
        // join time). Use the invite code as a stable surrogate key so the
        // unique (accountId, guildId) upsert works and is later reconciled.
        const surrogateGuildId = c.guildId || `invite:${c.inviteCode}`;

        await backendClient.upsertTarget({
          operatorId,
          accountId,
          guildId: surrogateGuildId,
          guildName: c.guildName || null,
          inviteCode: c.inviteCode,
          status: 'DISCOVERED',
          relevanceScore: score,
          keywords: matched.length ? matched : seeds,
        });
        knownCodes.add(c.inviteCode);
        discovered += 1;
      } catch (err) {
        logger.debug({ accountId, error: err.message }, 'Discovery upsert failed — skipping candidate');
      }
    }

    // Gentle pause between source queries.
    await randomDelay(1500, 4000);
  }

  if (discovered > 0) {
    logger.info({ accountId, discovered }, 'Engagement discovery completed');
  }
  return { discovered };
}
