// Pure helpers for scripts/research-deals.mjs: tool schemas, source checking and merging.
// No network access here, so everything is unit-tested (tests/research.test.js).

const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const DATE = { type: 'string', format: 'date' };
const CHANNEL = { type: 'string', enum: ['in-store', 'online', 'both', 'unknown'] };
const CONFIDENCE = { type: 'string', enum: ['high', 'medium', 'low'] };

const object = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const FINDINGS_TOOL = {
  name: 'record_findings',
  description:
    'Record the promotions you verified for this brand. Call it exactly once, after researching. Every sourceUrl must be a page you retrieved in this conversation.',
  strict: true,
  input_schema: object({
    offersPage: nullable(object({ url: { type: 'string' }, label: { type: 'string' } })),
    offers: {
      type: 'array',
      items: object({
        title: { type: 'string' },
        code: nullable({ type: 'string' }),
        terms: { type: 'string' },
        exclusions: nullable({ type: 'string' }),
        starts: nullable(DATE),
        ends: nullable(DATE),
        channel: CHANNEL,
        sourceUrl: { type: 'string' },
        sourceName: { type: 'string' },
        sourceType: { type: 'string', enum: ['retailer', 'press'] },
        evidence: { type: 'string' },
        confidence: CONFIDENCE,
      }),
    },
    signup: nullable(
      object({ offer: { type: 'string' }, channel: CHANNEL, sourceUrl: { type: 'string' }, evidence: { type: 'string' } }),
    ),
    notes: nullable({ type: 'string' }),
  }),
};

export const EVENTS_TOOL = {
  name: 'record_events',
  description:
    'Record the New York sample sales and in-person shopping events you verified. Call it exactly once. Every sourceUrl must be a page you retrieved in this conversation.',
  strict: true,
  input_schema: object({
    events: {
      type: 'array',
      items: object({
        name: { type: 'string' },
        kind: { type: 'string', enum: ['sample-sale', 'store-event', 'market'] },
        brands: { type: 'array', items: { type: 'string' } },
        category: { type: 'string' },
        venue: nullable({ type: 'string' }),
        address: nullable({ type: 'string' }),
        starts: DATE,
        ends: DATE,
        hours: nullable({ type: 'string' }),
        discount: nullable({ type: 'string' }),
        rules: nullable({ type: 'string' }),
        sourceUrl: { type: 'string' },
        sourceName: { type: 'string' },
        evidence: { type: 'string' },
        confidence: CONFIDENCE,
      }),
    },
  }),
};

/** Every URL that appears anywhere in the response blocks: search results, fetched pages, citations. */
export function collectUrls(value, into = new Set()) {
  if (typeof value === 'string') {
    for (const m of value.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)) into.add(urlKey(m[0]));
  } else if (Array.isArray(value)) {
    for (const v of value) collectUrls(v, into);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'encrypted_content' || k === 'encrypted_index') continue;
      collectUrls(v, into);
    }
  }
  return into;
}

/** host + path, ignoring scheme, "www.", query, fragment and a trailing slash. */
export function urlKey(url) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\d?\./, '').toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return String(url).toLowerCase();
  }
}

const isHttps = (u) => typeof u === 'string' && /^https:\/\/\S+$/.test(u);
const isDay = (d) => d === null || /^\d{4}-\d{2}-\d{2}$/.test(d);

/**
 * Keep only what we can stand behind: https sources that were actually retrieved, sane dates,
 * nothing that ended before today, no low-confidence claims.
 * → { entry, dropped: [reason, ...] }
 */
export function validateFindings(findings, seen, today, checkedAt) {
  const dropped = [];
  const wasSeen = (u) => isHttps(u) && seen.has(urlKey(u));

  const offers = [];
  for (const o of findings.offers || []) {
    const why =
      !wasSeen(o.sourceUrl) ? 'source not among retrieved pages'
      : o.confidence === 'low' ? 'low confidence'
      : !isDay(o.starts) || !isDay(o.ends) ? 'bad dates'
      : o.starts && o.ends && o.starts > o.ends ? 'starts after it ends'
      : o.ends && o.ends < today ? 'already ended'
      : null;
    if (why) dropped.push(`${o.title}: ${why}`);
    else offers.push(o);
  }

  let offersPage = findings.offersPage || null;
  if (offersPage && !wasSeen(offersPage.url)) {
    dropped.push(`offers page ${offersPage.url}: not among retrieved pages`);
    offersPage = null;
  }
  let signup = findings.signup || null;
  if (signup && !wasSeen(signup.sourceUrl)) {
    dropped.push(`signup offer: source not among retrieved pages`);
    signup = null;
  }
  return { entry: { checkedAt, offersPage, offers, signup, notes: findings.notes || null }, dropped };
}

const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function validateEvents(events, seen, today, horizonDays = 7) {
  const last = addDays(today, horizonDays);
  const kept = [];
  const dropped = [];
  for (const e of events || []) {
    const why =
      !isHttps(e.sourceUrl) || !seen.has(urlKey(e.sourceUrl)) ? 'source not among retrieved pages'
      : e.confidence === 'low' ? 'low confidence'
      : !isDay(e.starts) || !isDay(e.ends) || e.starts > e.ends ? 'bad dates'
      : e.ends < today || e.starts > last ? 'outside the next week'
      : null;
    if (why) dropped.push(`${e.name}: ${why}`);
    else kept.push({ id: `${slug(e.name)}-${e.starts}`, ...e, lat: null, lon: null });
  }
  return { events: kept, dropped };
}

/** Drop ended events, add new ones (by id or source page), keep coordinates we already have. */
export function mergeEvents(existing, found, today) {
  const out = existing.filter((e) => e.ends >= today);
  const known = new Set(out.flatMap((e) => [e.id, urlKey(e.sourceUrl)]));
  for (const e of found) {
    if (known.has(e.id) || known.has(urlKey(e.sourceUrl))) continue;
    out.push(e);
    known.add(e.id);
  }
  return out;
}

/**
 * Which brands to research: explicit ids, or brands with shops on the map, most shops first,
 * skipping ones checked in the last `staleHours`, luxury houses last.
 */
export function pickBrands({ brands, deals, stores, matchBrand, only, limit = 40, staleHours = 20, now = new Date() }) {
  if (only?.length) return brands.filter((b) => only.includes(b.id));
  const counts = new Map();
  for (const s of stores) {
    const b = matchBrand(s);
    if (b) counts.set(b.id, (counts.get(b.id) || 0) + 1);
  }
  const fresh = (id) => {
    const at = deals[id]?.checkedAt;
    return at && now - new Date(at) < staleHours * 36e5;
  };
  return brands
    .filter((b) => counts.has(b.id) && !fresh(b.id))
    .sort((a, b) => (a.price === 4) - (b.price === 4) || counts.get(b.id) - counts.get(a.id) || a.name.localeCompare(b.name))
    .slice(0, limit);
}
