// Match OpenStreetMap shops to our researched brand notes, and infer what we can
// about shops we haven't researched from their OSM tags (with the basis spelled out).

const STOPWORDS = new Set(['the', 'and']);

// Words that may follow a short or generic brand name without changing the brand,
// e.g. "COS SoHo", "Gap Kids", "Coach Outlet".
const LOCATION_WORDS = new Set(
  (
    'store shop boutique flagship outlet factory kids men mens women womens nyc ny new york manhattan ' +
    'brooklyn soho noho nolita les lower east west side village meatpacking flatiron nomad union square ' +
    'herald fifth 5th avenue ave broadway street st midtown downtown uptown williamsburg hudson yards ' +
    'wtc world trade center oculus studio'
  ).split(' '),
);

export function tokens(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

export function buildBrandIndex(brands) {
  const byWikidata = new Map();
  const aliases = [];
  for (const brand of brands) {
    for (const q of brand.wikidata || []) byWikidata.set(q, brand);
    for (const name of new Set([brand.name, ...(brand.aliases || [])])) {
      const tk = tokens(name);
      if (!tk.length) continue;
      const strict = Boolean(brand.strict) || (tk.length === 1 && tk[0].length <= 3);
      aliases.push({ brand, key: tk.join(' '), compact: tk.join(''), size: tk.length, strict });
    }
  }
  // Longest alias first, so "Nordstrom Rack" wins over "Nordstrom".
  aliases.sort((a, b) => b.key.length - a.key.length);
  return { byWikidata, aliases, byId: new Map(brands.map((b) => [b.id, b])) };
}

export function matchBrand(store, index) {
  if (store.wd) {
    for (const q of store.wd.split(';')) {
      const hit = index.byWikidata.get(q.trim());
      if (hit) return hit;
    }
  }
  for (const candidate of [store.brand, store.name]) {
    if (!candidate) continue;
    const tk = tokens(candidate);
    if (!tk.length) continue;
    const key = tk.join(' ');
    const compact = tk.join('');
    for (const a of index.aliases) {
      if (key === a.key || compact === a.compact) return a.brand;
      if (key.startsWith(`${a.key} `)) {
        if (!a.strict || tk.slice(a.size).every((t) => LOCATION_WORDS.has(t))) return a.brand;
      }
    }
  }
  return null;
}

const SHOE_CARRIES = ['shoes', 'sneakers', 'boots', 'sandals'];

// Shop names that say what they sell. The card shows this as the basis ("name includes …").
const NAME_HINTS = [
  { re: /\b(vintage|thrift|consignment|resale|second ?hand|buy.?sell.?trade)\b/i, styles: ['vintage'], carries: ['secondhand'] },
  { re: /\b(shoes?|sneakers?|boots?|footwear)\b/i, styles: ['shoes'], carries: SHOE_CARRIES },
  { re: /\b(lingerie|corsets?|intimates)\b/i, styles: [], carries: ['underwear'] },
  { re: /\b(denim|jeans)\b/i, styles: ['denim'], carries: ['denim'] },
  { re: /\b(hats?|millinery)\b/i, styles: [], carries: ['accessories'] },
  { re: /\b(bridal)\b/i, styles: ['romantic'], carries: ['dresses'] },
  { re: /\b(menswear|tailors?|suits?)\b/i, styles: ['tailored'], carries: ['tailoring'] },
];
const DEPARTMENT_CARRIES = [
  'tops', 'knitwear', 'dresses', 'pants', 'denim', 'outerwear', 'shoes', 'sneakers', 'boots', 'bags', 'accessories',
];

/**
 * What OSM tags alone tell us about an unresearched shop.
 * → { styles, carries, who, basis: ['shop=shoes', ...] }
 */
export function inferFromTags(store) {
  const styles = new Set();
  const carries = new Set();
  const basis = [];
  const who = [];

  if (store.shop === 'second_hand' || store.sh === 'yes' || store.sh === 'only') {
    styles.add('vintage');
    carries.add('secondhand');
    basis.push(store.shop === 'second_hand' ? 'shop=second_hand' : `second_hand=${store.sh}`);
  }
  if (store.shop === 'shoes') {
    styles.add('shoes');
    SHOE_CARRIES.forEach((c) => carries.add(c));
    basis.push('shop=shoes');
  }
  if (['bag', 'leather', 'fashion_accessories'].includes(store.shop)) {
    carries.add('bags');
    carries.add('accessories');
    basis.push(`shop=${store.shop}`);
  }
  if (store.shop === 'department_store') {
    styles.add('offprice');
    DEPARTMENT_CARRIES.forEach((c) => carries.add(c));
    basis.push('shop=department_store');
  }
  if (store.shop === 'sports') {
    styles.add('athletic');
    carries.add('activewear');
    basis.push('shop=sports');
  }
  for (const hint of NAME_HINTS) {
    const m = String(store.name || '').match(hint.re);
    if (!m) continue;
    hint.styles.forEach((st) => styles.add(st));
    hint.carries.forEach((c) => carries.add(c));
    basis.push(`name includes “${m[0]}”`);
  }
  for (const value of (store.clothes || '').split(';').map((v) => v.trim()).filter(Boolean)) {
    const mapped = {
      women: () => who.push('Women'),
      men: () => who.push('Men'),
      children: () => who.push('Kids'),
      babies: () => who.push('Babies'),
      sports: () => (styles.add('athletic'), carries.add('activewear')),
      underwear: () => carries.add('underwear'),
      lingerie: () => carries.add('underwear'),
      wedding: () => carries.add('dresses'),
      suits: () => (styles.add('tailored'), carries.add('tailoring')),
      vintage: () => (styles.add('vintage'), carries.add('secondhand')),
      denim: () => (styles.add('denim'), carries.add('denim')),
      swimwear: () => carries.add('swim'),
    }[value];
    if (mapped) {
      mapped();
      basis.push(`clothes=${value}`);
    }
  }
  return { styles: [...styles], carries: [...carries], who: [...new Set(who)], basis: [...new Set(basis)] };
}
