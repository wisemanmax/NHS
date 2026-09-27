#!/usr/bin/env node
// The deal agent. Claude (with web search and web fetch) researches current US promotions for
// each brand, plus New York sample sales for the coming week, and the verified results are
// merged into data/deals.json and data/events.json. Offers survive only if their source page
// was actually retrieved during the run (see scripts/research-lib.mjs).
//
// Needs ANTHROPIC_API_KEY and costs real money: roughly $0.20–0.40 per brand at the default
// settings. Run by .github/workflows/research-deals.yml (manual trigger only).
//
//   node scripts/research-deals.mjs [--brands=madewell,jcrew] [--limit=40] [--events] [--no-brands] [--dry-run]
import Anthropic from '@anthropic-ai/sdk';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { buildBrandIndex, matchBrand } from '../js/brands.js';
import { todayISO } from '../js/deals.js';
import {
  EVENTS_TOOL,
  FINDINGS_TOOL,
  addDays,
  collectUrls,
  mergeEvents,
  pickBrands,
  validateEvents,
  validateFindings,
} from './research-lib.mjs';

const MODEL = 'claude-opus-5';
const CONCURRENCY = 3;
const root = new URL('../', import.meta.url);
const readJson = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const writeJson = (p, doc) => writeFile(new URL(p, root), `${JSON.stringify(doc, null, 2)}\n`);

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

let client;

const WEB_TOOLS = [
  {
    type: 'web_search_20260209',
    name: 'web_search',
    max_uses: 8,
    user_location: { type: 'approximate', city: 'New York', region: 'New York', country: 'US', timezone: 'America/New_York' },
  },
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 6 },
];

const now = new Date();
const today = todayISO(now);
const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long' }).format(now);

const BRAND_RULES = `You research current US promotions for a fashion brand, for a shopper who is in New York stores today (${weekday}, ${today}). The app shows every offer with its source link, and a made-up or dead code at the register would ruin it, so report only what sources actually say.

How to work: search, then open the brand's own sale / promotions / offers pages with web_fetch when you can. Prefer the brand's own site; reputable publications are acceptable. Never use codes that appear only on coupon aggregators (RetailMeNot, CouponFollow, HotDeals, Honey, Dealspotr, Knoji, DealNews, Groupon coupons, magazine coupon subdomains).

Rules:
- Only offers active today per the source. Skip non-US offers and anything whose year or dates are unclear or already over.
- channel is "in-store", "online" or "both" only when the source says so explicitly; otherwise "unknown". Never infer that an online promotion works in store.
- confidence: "high" = the brand's own page, dated to cover today; "medium" = a reputable publication from this month, or the brand's page without dates; "low" = weaker (it will be discarded).
- signup: an email/SMS/app/loyalty sign-up offer stated by the brand, or null.
- offersPage: the brand's own sale or promotions page, if you retrieved it.
- Every sourceUrl must be a page you retrieved in this conversation (a search result or a fetched page). Never guess a URL, code or date. An empty offers list is a good answer.

When you're done, call record_findings exactly once.`;

const EVENTS_RULES = `You find in-person sample sales, warehouse/archive sales and shopping events in Manhattan and Brooklyn open on any day from ${today} to ${addDays(today, 7)}. Good sources: 260samplesale.com, chicmi.com, The Strategist (nymag.com), Time Out New York, brands' own pages, Eventbrite.

Rules:
- The listing must clearly be for ${today.slice(0, 4)} with dates in that window; old listings from past years are common, so check the year and skip anything ambiguous.
- Capture the full street address with ZIP when given (null if none), per-day hours, discount statements and entry rules (RSVP, payment) exactly as stated.
- Every sourceUrl must be a page you retrieved in this conversation. Never guess.

When you're done, call record_events exactly once.`;

const isAuthError = (err) =>
  err instanceof Anthropic.AuthenticationError || /authentication method|api key/i.test(err?.message || '');

function addUsage(total, u) {
  if (!u) return;
  total.input += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  total.output += u.output_tokens || 0;
  total.searches += u.server_tool_use?.web_search_requests || 0;
  total.fetches += u.server_tool_use?.web_fetch_requests || 0;
}

/** One research conversation. Resumes paused server-tool turns; nudges once if no record was made. */
async function research(system, prompt, tool, usage) {
  const messages = [{ role: 'user', content: prompt }];
  const seen = new Set();
  let nudged = false;
  for (let turn = 0; turn < 8; turn++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // re-run a declined request on Anthropic's recommended fallback model
      system,
      tools: [...WEB_TOOLS, tool],
      messages,
    });
    addUsage(usage, res.usage);
    collectUrls(res.content, seen);
    if (res.stop_reason === 'refusal') throw new Error(`declined (${res.stop_details?.category ?? 'no category'})`);
    const call = res.content.find((b) => b.type === 'tool_use' && b.name === tool.name);
    if (call) return { input: call.input, seen };
    messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason === 'pause_turn') continue; // server-side loop paused; re-send to resume
    if (res.stop_reason === 'max_tokens') throw new Error('ran out of output tokens');
    if (nudged) throw new Error(`no ${tool.name} call`);
    messages.push({ role: 'user', content: `Please call ${tool.name} now with what you verified (an empty list is fine).` });
    nudged = true;
  }
  throw new Error('too many turns');
}

async function pool(items, size, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

async function main() {
  client = new Anthropic({ maxRetries: 4 });
  const brandsDoc = await readJson('data/brands.json');
  const deals = await readJson('data/deals.json');
  const eventsDoc = await readJson('data/events.json');
  const stores = (await readJson('data/stores.json').catch(() => ({ stores: [] }))).stores;
  const index = buildBrandIndex(brandsDoc.brands);
  const usage = { input: 0, output: 0, searches: 0, fetches: 0 };
  const report = [];

  if (!args['no-brands']) {
    const targets = pickBrands({
      brands: brandsDoc.brands,
      deals: deals.brands,
      stores,
      matchBrand: (s) => matchBrand(s, index),
      only: typeof args.brands === 'string' ? args.brands.split(',').map((s) => s.trim()) : null,
      limit: Number(args.limit) || 40,
      now,
    });
    console.log(`Researching ${targets.length} brand(s) with ${MODEL}…`);
    await pool(targets, CONCURRENCY, async (brand) => {
      const prompt = `Brand: ${brand.name}${brand.aliases?.length ? ` (also written ${brand.aliases.join(', ')})` : ''}. Official site: ${brand.site || brand.domain || 'unknown'}.`;
      try {
        const { input, seen } = await research(BRAND_RULES, prompt, FINDINGS_TOOL, usage);
        const { entry, dropped } = validateFindings(input, seen, today, new Date().toISOString());
        deals.brands[brand.id] = entry;
        report.push(`✓ ${brand.name}: ${entry.offers.length} offer(s)${dropped.length ? `, dropped ${dropped.length} (${dropped.join('; ')})` : ''}`);
      } catch (err) {
        if (isAuthError(err)) throw err;
        report.push(`✗ ${brand.name}: ${err.message}`);
      }
      console.log(report.at(-1));
    });
    deals.checkedAt = new Date().toISOString();
    deals.method =
      'Researched by scripts/research-deals.mjs: Claude with web search and web fetch. An offer is kept only if its source page was retrieved during the run; coupon-aggregator codes are excluded.';
    deals.coverage = 'Brands missing from this file were not researched, which is different from having no offers.';
  }

  if (args.events) {
    try {
      const { input, seen } = await research(EVENTS_RULES, 'Find this week\'s New York sample sales and shopping events.', EVENTS_TOOL, usage);
      const { events, dropped } = validateEvents(input.events, seen, today);
      const before = eventsDoc.events.length;
      eventsDoc.events = mergeEvents(eventsDoc.events, events, today);
      eventsDoc.checkedAt = new Date().toISOString();
      report.push(`✓ events: ${events.length} verified, ${eventsDoc.events.length - before >= 0 ? '+' : ''}${eventsDoc.events.length - before} net${dropped.length ? `, dropped ${dropped.length} (${dropped.join('; ')})` : ''}`);
    } catch (err) {
      if (isAuthError(err)) throw err;
      report.push(`✗ events: ${err.message}`);
    }
    console.log(report.at(-1));
  }

  // Claude Opus 5 list prices: $5 / $25 per million input / output tokens, $10 per 1,000 searches.
  const cost = (usage.input * 5 + usage.output * 25) / 1e6 + usage.searches * 0.01;
  const summary = `${usage.searches} searches, ${usage.fetches} fetches, ${usage.input.toLocaleString()} input / ${usage.output.toLocaleString()} output tokens, about $${cost.toFixed(2)}`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Deal research\n\n${report.map((r) => `- ${r}`).join('\n')}\n\n${summary}\n`);
  }

  if (args['dry-run']) {
    console.log(JSON.stringify({ deals: deals.brands, events: eventsDoc.events }, null, 2));
    return;
  }
  await writeJson('data/deals.json', deals);
  await writeJson('data/events.json', eventsDoc);
}

main().catch((err) => {
  if (isAuthError(err)) {
    console.error('Anthropic API key missing or invalid. Add ANTHROPIC_API_KEY as a repository secret.');
  } else {
    console.error(err);
  }
  process.exit(1);
});
