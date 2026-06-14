/**
 * Simple keyword-based relevance heuristic shared by discovery + engagement loop.
 *
 * No AI calls here — cheap, deterministic, and safe to run on every candidate.
 * Returns a score in [0, 1] = (matched distinct keywords) / (total keywords),
 * with a small boost for multiple occurrences.
 */

/** Extract a usable keyword list from an engagement plan + defaults. */
export function planKeywords(plan) {
  const out = new Set();
  const add = (arr) => {
    if (Array.isArray(arr)) arr.forEach((k) => k && out.add(String(k).toLowerCase()));
  };
  if (plan && typeof plan === 'object') {
    add(plan.keywords);
    add(plan.topics);
    add(plan.targetKeywords);
  }
  // Domain defaults for the Revolut affiliate niche.
  ['revolut', 'cashout', 'affiliate', 'fintech', 'banking', 'money transfer',
    'iban', 'virtual card', 'crypto offramp', 'payments'].forEach((k) => out.add(k));
  return [...out];
}

/**
 * Score `text` against a keyword list. Returns { score, matched }.
 */
export function scoreText(text, keywords) {
  if (!text || !keywords || keywords.length === 0) return { score: 0, matched: [] };
  const lc = String(text).toLowerCase();
  const matched = [];
  let hits = 0;
  for (const kw of keywords) {
    const k = String(kw).toLowerCase();
    if (!k) continue;
    if (lc.includes(k)) {
      matched.push(kw);
      // count occurrences (capped) for a mild boost
      let idx = lc.indexOf(k);
      let occ = 0;
      while (idx !== -1 && occ < 3) {
        occ += 1;
        idx = lc.indexOf(k, idx + k.length);
      }
      hits += occ;
    }
  }
  if (matched.length === 0) return { score: 0, matched: [] };
  const base = matched.length / keywords.length;
  const boost = Math.min(0.2, (hits - matched.length) * 0.02);
  return { score: Math.min(1, base + boost), matched };
}
