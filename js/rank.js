// Ranking for the two shopping intents:
//   Browse: "which nearby store fits my style?"  → distance + style fit (+ offers, hours, feedback)
//   Find:   "who might have black ankle boots?"  → catalog match first, then distance
// A catalog match only means the brand sells that category online; the UI never
// presents it as stock at a particular store.

const WALK_UNIT_M = 400; // ~5 minutes on foot counts as one point

export const CATEGORY_KEYWORDS = {
  boots: ['boot', 'boots', 'booties', 'bootie', 'chelsea boots', 'cowboy boots', 'uggs'],
  sneakers: ['sneaker', 'sneakers', 'trainers', 'running shoes', 'kicks', 'runners'],
  shoes: ['shoe', 'shoes', 'loafer', 'loafers', 'heels', 'flats', 'ballet flats', 'mules', 'pumps', 'oxfords', 'clogs'],
  sandals: ['sandal', 'sandals', 'slides', 'flip flops'],
  denim: ['jeans', 'denim', 'jean jacket', 'trucker jacket'],
  outerwear: ['jacket', 'jackets', 'coat', 'coats', 'puffer', 'parka', 'trench', 'bomber', 'raincoat', 'fleece', 'vest', 'shacket', 'anorak', 'windbreaker', 'leather jacket', 'down jacket'],
  tailoring: ['blazer', 'blazers', 'suit', 'suits', 'trousers', 'tailored', 'slacks', 'suiting'],
  knitwear: ['sweater', 'sweaters', 'cardigan', 'cardigans', 'knit', 'knits', 'knitwear', 'cashmere', 'turtleneck', 'jumper', 'pullover'],
  sweats: ['hoodie', 'hoodies', 'sweatshirt', 'sweatshirts', 'sweatpants', 'joggers', 'crewneck', 'tracksuit'],
  tees: ['t-shirt', 't-shirts', 'tshirt', 'tshirts', 'tee', 'tees', 'tank', 'tank top'],
  tops: ['top', 'tops', 'blouse', 'blouses', 'camisole', 'cami', 'bodysuit', 'corset'],
  shirts: ['shirt', 'shirts', 'button-down', 'button down', 'oxford shirt', 'polo', 'polos', 'flannel'],
  dresses: ['dress', 'dresses', 'gown', 'maxi', 'midi dress', 'slip dress', 'sundress'],
  skirts: ['skirt', 'skirts', 'mini skirt'],
  pants: ['pants', 'trousers', 'chinos', 'cargo', 'cargos', 'wide-leg', 'wide leg'],
  shorts: ['shorts'],
  activewear: ['leggings', 'yoga', 'workout', 'gym', 'running', 'sports bra', 'athletic', 'activewear', 'athleisure', 'tennis'],
  underwear: ['underwear', 'bra', 'bras', 'lingerie', 'boxers', 'briefs', 'socks', 'shapewear'],
  loungewear: ['pajamas', 'pyjamas', 'loungewear', 'robe', 'sleepwear', 'slippers'],
  swim: ['swim', 'swimsuit', 'bikini', 'swimwear', 'trunks'],
  bags: ['bag', 'bags', 'purse', 'handbag', 'tote', 'backpack', 'crossbody', 'wallet'],
  accessories: ['hat', 'hats', 'cap', 'beanie', 'scarf', 'scarves', 'belt', 'belts', 'sunglasses', 'gloves'],
  jewelry: ['jewelry', 'jewellery', 'necklace', 'earrings', 'ring', 'rings', 'bracelet'],
  kids: ['kids', 'baby', 'toddler', 'children', 'boys', 'girls'],
  secondhand: ['vintage', 'thrift', 'thrifted', 'secondhand', 'second-hand', 'resale', 'consignment', 'used'],
};

/** Free text → catalog categories it mentions. */
export function parseQuery(text) {
  const q = ` ${String(text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ')} `;
  return Object.entries(CATEGORY_KEYWORDS)
    .filter(([, words]) => words.some((w) => q.includes(` ${w} `)))
    .map(([category]) => category);
}

/** → { state: 'yes' | 'no' | 'unknown', matched: [...], ratio } */
export function catalogMatch(item, categories) {
  if (!categories.length || !item.carries.length) return { state: 'unknown', matched: [], ratio: 0 };
  const matched = categories.filter((c) => item.carries.includes(c));
  if (!matched.length) return { state: 'no', matched, ratio: 0 };
  return { state: 'yes', matched, ratio: matched.length / categories.length };
}

export const styleMatchCount = (item, selected) => item.styles.filter((s) => selected.has(s)).length;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function sharedAdjustments(item, ctx) {
  let s = -item.dist / WALK_UNIT_M;
  if (item.hasOffer) s += 1;
  else if (item.onlineOffer) s += 0.3;
  if (item.status?.state === 'closed') s -= 5;
  else if (item.status?.state === 'open' && item.status.closesIn < 20) s -= 2; // not worth the walk
  const cap = ctx.prefs?.priceCap;
  if (cap && item.price && item.price > cap) s -= 1.5;
  const learned = item.styles.reduce((sum, st) => sum + (ctx.prefs?.styleWeights?.[st] || 0), 0);
  s += 0.6 * clamp(learned, -3, 3);
  return s;
}

export function browseScore(item, ctx) {
  let s = sharedAdjustments(item, ctx);
  if (ctx.styles.size) s += 1.5 * styleMatchCount(item, ctx.styles);
  if (item.researched) s += 0.3;
  if (item.visit) s -= 3;
  return s;
}

export function findScore(item, ctx) {
  let s = sharedAdjustments(item, ctx);
  const m = item.catalog;
  if (m.state === 'yes') s += 4 + 3 * m.ratio;
  else if (m.state === 'no') s -= 6;
  if (item.visit?.forHunt && ['bought', 'unavailable', 'wrongfit'].includes(item.visit.outcome)) s -= 6;
  return s;
}

export function passesFilters(item, f) {
  if (f.budget && item.price && item.price > f.budget) return false;
  if (f.offersOnly && !item.hasOffer && !item.onlineOffer) return false;
  return true;
}

/**
 * Split items into the ranked list, the "not researched / unknown" section, and a hidden count.
 * ctx: { mode: 'browse'|'find', styles: Set, budget, offersOnly, sort: 'best'|'nearest', categories, prefs }
 */
export function buildSections(items, ctx) {
  const main = [];
  const other = [];
  let hidden = 0;
  for (const item of items) {
    if (!passesFilters(item, ctx)) {
      hidden++;
      continue;
    }
    if (ctx.mode === 'find') {
      item.catalog = catalogMatch(item, ctx.categories);
      if (!ctx.categories.length) (item.styles.length || item.researched ? main : other).push(item);
      else if (item.catalog.state === 'yes') main.push(item);
      else if (item.catalog.state === 'unknown') other.push(item);
      else hidden++;
    } else if (!item.styles.length && !item.researched) {
      other.push(item);
    } else if (ctx.styles.size && !styleMatchCount(item, ctx.styles)) {
      hidden++;
    } else {
      main.push(item);
    }
  }
  const score = ctx.mode === 'find' ? findScore : browseScore;
  for (const item of main) item.score = score(item, ctx);
  if (ctx.sort === 'nearest') main.sort((a, b) => a.dist - b.dist);
  else main.sort((a, b) => b.score - a.score || a.dist - b.dist);
  other.sort((a, b) => a.dist - b.dist);
  return { main, other, hidden };
}
