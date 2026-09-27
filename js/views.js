// HTML builders. Every value that came from data goes through h() or safeUrl().
import { detourMeters, formatMiles, METERS_PER_MILE } from './geo.js';
import { statusLabel } from './hours.js';
import { channelInfo, eventTiming } from './deals.js';
import { escapeHtml as h, formatCheckedAt, formatDay, hostOf, priceLabel, safeUrl, telHref } from './format.js';

const PRICE_RANGES = { 1: 'mostly under $50', 2: 'mostly $50–150', 3: 'mostly $150–400', 4: 'mostly $400+' };

export const OUTCOMES = [
  ['bought', 'Bought it'],
  ['wrongfit', 'Wrong fit'],
  ['unavailable', 'Unavailable'],
  ['great', 'Great selection'],
  ['vibe', 'Not my vibe'],
  ['pricey', 'Too pricey'],
];
export const OUTCOME_LABEL = Object.fromEntries(OUTCOMES);

const SHORT_CHANNEL = { 'in-store': 'in store', both: 'online & in store', online: 'online only', unknown: 'in store not confirmed' };
const EVENT_KIND = { 'sample-sale': 'Sample sale', 'store-event': 'Store event', market: 'Market' };
const OSM_TYPE = { n: 'node', w: 'way', r: 'relation' };

const aboutMiles = (meters) => {
  const miles = formatMiles(meters);
  return miles.startsWith('under') ? miles : `about ${miles}`;
};
const walkMinutes = (meters) => Math.max(1, Math.round((meters / METERS_PER_MILE) * 20));
const list = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);
const clock = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** <a> for an external URL, or '' when the URL isn't http(s). `html` must already be escaped. */
function ext(url, html, cls = '') {
  const safe = safeUrl(url);
  return safe ? `<a class="${cls}" href="${h(safe)}" target="_blank" rel="noopener">${html}</a>` : '';
}

const section = (title, body, cls = '') => `<section class="card-section ${cls}"><h3>${h(title)}</h3>${body}</section>`;

export const directionsUrl = (lat, lon) => `https://maps.apple.com/?daddr=${lat},${lon}&dirflg=w`;
const siteFor = (brand) =>
  brand.site ||
  (brand.domain ? `https://${brand.domain}/` : `https://www.google.com/search?q=${encodeURIComponent(`${brand.name} official site`)}`);
const siteLabel = (brand) => brand.domain || `${brand.name} online`;
const catalogSearch = (brand, query) =>
  `https://www.google.com/search?q=${encodeURIComponent(brand.domain ? `site:${brand.domain} ${query}` : `"${brand.name}" ${query}`)}`;

// ---------------------------------------------------------------- list rows

export function storeRowHtml(it, v) {
  const status = statusLabel(it.status);
  const styles = it.styles.slice(0, 2).map((s) => v.styleLabels[s]).filter(Boolean).join(' · ');
  const meta = [priceLabel(it.price), styles || (it.researched ? null : 'Not researched')].filter(Boolean).join(' · ');
  const offer = it.storeOffers?.[0] || null;
  const online = !offer && it.offers[0];
  const detour =
    v.nextStop && v.nextStop.id !== it.id ? detourMeters(v.origin, [it.lat, it.lon], [v.nextStop.lat, v.nextStop.lon]) : null;
  const why = v.mode === 'find' && it.catalog?.state === 'yes' ? `Catalog lists ${it.catalog.matched.join(', ')}` : null;
  const sub = [status ? `<span class="tone-${status.tone}">${h(status.text)}</span>` : '', it.raw.addr ? h(it.raw.addr) : '']
    .filter(Boolean)
    .join(' · ');
  const dotClass = it.hasOffer ? 'dot-offer' : it.onlineOffer ? 'dot-online' : it.researched ? 'dot-known' : 'dot-plain';
  return `<li><button type="button" class="row" data-open="${h(it.id)}">
    <span class="dot ${dotClass}" aria-hidden="true"></span>
    <span class="row-main">
      <span class="row-title">${h(it.name)}${v.saved(it.id) ? ' <span class="star" title="In your pocket">★</span>' : ''}</span>
      ${meta ? `<span class="row-meta">${h(meta)}</span>` : ''}
      ${sub ? `<span class="row-sub">${sub}</span>` : ''}
      ${offer ? `<span class="row-offer">${h(offer.title)}<span class="row-offer-where"> · ${h(SHORT_CHANNEL[offer.channel] || SHORT_CHANNEL.unknown)}${it.offers.length > 1 ? ` · +${it.offers.length - 1} more` : ''}</span></span>` : ''}
      ${online ? `<span class="row-offer row-offer-online">Online only: ${h(online.title)}</span>` : ''}
      ${why ? `<span class="row-why">${h(why)}</span>` : ''}
      ${it.visit ? `<span class="row-visit">Visited · ${h(OUTCOME_LABEL[it.visit.outcome])}</span>` : ''}
    </span>
    <span class="row-dist">${h(formatMiles(it.dist))}${detour != null ? `<small>+${h(formatMiles(detour).replace('under ', '<'))} detour</small>` : ''}</span>
  </button></li>`;
}

export function eventRowHtml(ev, v) {
  const timing = eventTiming(ev, v.today);
  const when =
    timing === 'today' ? (ev.ends === v.today ? 'Last day today' : 'On now') : `Starts ${formatDay(ev.starts)}`;
  const where = ev.venue || ev.address || 'Venue not listed';
  return `<li><button type="button" class="row row-event" data-open="${h(ev.id)}">
    <span class="dot dot-event" aria-hidden="true">★</span>
    <span class="row-main">
      <span class="row-title">${h(ev.name)}</span>
      <span class="row-meta">${h([EVENT_KIND[ev.kind], ev.category].filter(Boolean).join(' · '))}</span>
      <span class="row-sub"><span class="tone-${timing === 'today' ? 'ok' : 'muted'}">${h(when)}</span> · ${h(where)}</span>
    </span>
    <span class="row-dist">${ev.dist != null ? h(formatMiles(ev.dist)) : '–'}</span>
  </button></li>`;
}

// ---------------------------------------------------------------- store card

function eyebrow(it, v) {
  if (it.brand) return ['Researched brand', priceLabel(it.price), it.styles.map((s) => v.styleLabels[s]).slice(0, 2).join(' · ')].filter(Boolean).join(' · ');
  const kind = { shoes: 'Shoe store', second_hand: 'Secondhand shop', department_store: 'Department store', bag: 'Bags', leather: 'Leather goods', fashion_accessories: 'Accessories', sports: 'Sportswear' }[it.raw.shop] || 'Independent shop';
  return `${kind} · not researched`;
}

function styleSection(it, v) {
  const labels = it.styles.map((s) => v.styleLabels[s]).filter(Boolean);
  let verdict;
  let basis;
  if (it.brand) {
    const matched = it.styles.filter((s) => v.selectedStyles.has(s)).map((s) => v.styleLabels[s]);
    if (v.selectedStyles.size && matched.length) verdict = `Worth checking for ${list(matched)}.`;
    else if (v.selectedStyles.size) verdict = `Not an obvious match for your picks. Known for ${list(labels)}.`;
    else verdict = `Known for ${list(labels)}.`;
    basis = `Basis: our brand notes (“${it.brand.blurb}”). They describe ${it.brand.name} in general, not this store's racks.`;
  } else if (labels.length) {
    verdict = `Probably ${list(labels)}.`;
    basis = `Basis: OpenStreetMap tags ${it.inferred.basis.join(', ')}.`;
  } else {
    verdict = 'Unknown.';
    basis = "We haven't researched this shop, and its OpenStreetMap listing has no style details.";
  }
  const price = it.price ? `Typical price ${priceLabel(it.price)} (${PRICE_RANGES[it.price]}), from brand notes.` : 'Price level unknown.';
  const who = it.inferred.who.length ? ` For ${it.inferred.who.join(' · ')} (per OpenStreetMap).` : '';
  return section('Style fit', `<p class="verdict">${h(verdict)}</p><p class="basis">${h(basis)}</p><p class="basis">${h(price + who)}</p>`);
}

function selectionSection(it, v) {
  const parts = [];
  const query = v.mode === 'find' && v.huntText ? v.huntText : '';
  if (it.brand) {
    if (v.mode === 'find' && v.categories.length && it.catalog) {
      const m = it.catalog;
      if (m.state === 'yes') parts.push(`<p class="verdict tone-ok">The catalog lists ${h(m.matched.join(', '))}.</p>`);
      else if (m.state === 'no') parts.push(`<p class="verdict">The catalog doesn't list ${h(v.categories.join(', '))}.</p>`);
    }
    parts.push(`<p><span class="label">Catalog (online):</span> ${h(it.carries.join(' · '))}</p>`);
    parts.push('<p class="basis">This is what the brand sells online. It isn\'t confirmed stock at this store.</p>');
    const search = query || 'new arrivals';
    parts.push(`<div class="actions">
      ${ext(siteFor(it.brand), `Browse ${h(siteLabel(it.brand))} ↗`, 'btn btn-small')}
      ${ext(catalogSearch(it.brand, search), `Search “${h(search)}” ↗`, 'btn btn-small')}
    </div>`);
  } else {
    parts.push('<p>No catalog research for this shop.</p>');
    parts.push(`<div class="actions">
      ${it.raw.web ? ext(it.raw.web, 'Website ↗', 'btn btn-small') : ''}
      ${ext(`https://www.google.com/search?q=${encodeURIComponent(`${it.name} ${it.raw.addr || ''} New York`)}`, 'Search the web ↗', 'btn btn-small')}
    </div>`);
  }
  if (it.raw.phone) {
    const ask = query ? ` and ask for “${h(query)}”${v.huntSize ? ` in ${h(v.huntSize)}` : ''}` : '';
    parts.push(`<p class="basis">Want certainty? <a href="${h(telHref(it.raw.phone))}">Call the store</a>${ask}.</p>`);
  } else if (it.brand) {
    parts.push('<p class="basis">Tip: many chains\' product pages can check stock at a specific store.</p>');
  }
  return section('Selection', parts.join(''));
}

function offerHtml(o, it, index, checked) {
  const ch = channelInfo(o.channel);
  const when = o.ends ? `Ends ${formatDay(o.ends)}` : 'No end date given';
  const trust =
    o.confidence === 'high'
      ? 'dated on the source'
      : o.sourceType === 'press'
        ? 'press report, double-check it'
        : 'undated page, double-check it';
  return `<article class="offer">
    <h4>${h(o.title)}</h4>
    ${o.code ? `<p class="code">Code <strong>${h(o.code)}</strong></p>` : ''}
    ${o.terms ? `<p>${h(o.terms)}</p>` : ''}
    ${o.exclusions ? `<p class="basis">Exclusions: ${h(o.exclusions)}</p>` : ''}
    <p class="tags"><span class="tag tone-${ch.tone}">${h(ch.label)}</span><span class="tag">${h(when)}</span></p>
    <p class="source">Source: ${ext(o.sourceUrl, `${h(o.sourceName)} ↗`)} · ${h(trust)} · found ${h(checked)} via web search</p>
    <button type="button" class="btn btn-small" data-action="checkout" data-id="${h(it.id)}" data-offer="${index}">Show at checkout</button>
  </article>`;
}

function signupHtml(s) {
  const ch = channelInfo(s.channel);
  return `<article class="offer offer-signup">
    <h4>Sign-up offer</h4>
    <p>${h(s.offer)}</p>
    <p class="tags"><span class="tag">Requires signing up</span><span class="tag tone-${ch.tone}">${h(ch.label)}</span></p>
    <p class="source">Source: ${ext(s.sourceUrl, `${h(hostOf(s.sourceUrl))} ↗`)}</p>
  </article>`;
}

function dealsSection(it, v) {
  if (!it.brand) return section('Deals', '<p>Not researched. Ask in store.</p>');
  const d = it.deals;
  if (!d) {
    return section(
      'Deals',
      `<p>Not researched in this morning's run, which hit its web-search limit. That isn't the same as “no deals.”</p>
       <div class="actions">${ext(siteFor(it.brand), `Check ${h(siteLabel(it.brand))} ↗`, 'btn btn-small')}</div>`,
    );
  }
  const checked = formatCheckedAt(d.checkedAt, v.now);
  const parts = [];
  if (it.offers.length) parts.push(it.offers.map((o, i) => offerHtml(o, it, i, checked)).join(''));
  else parts.push(`<p>No current offer found in the check at ${h(checked)}. That doesn't mean there isn't one.</p>`);
  if (d.offersPage) parts.push(`<p class="basis">Official offers page: ${ext(d.offersPage.url, `${h(d.offersPage.label)} ↗`)}</p>`);
  if (d.signup) parts.push(signupHtml(d.signup));
  if (d.notes) parts.push(`<p class="basis">Research notes: ${h(d.notes)}</p>`);
  return section('Deals', parts.join(''));
}

function detourSection(it, v) {
  if (!v.nextStop || v.nextStop.id === it.id) return '';
  const extra = detourMeters(v.origin, [it.lat, it.lon], [v.nextStop.lat, v.nextStop.lon]);
  const offer = it.storeOffers?.[0] || it.offers[0];
  const cost = extra < 60 ? 'Practically on the way' : `+${formatMiles(extra)} (about ${walkMinutes(extra)} min)`;
  return section(
    'Worth the detour?',
    `<p>${h(cost)} vs. going straight to ${h(v.nextStop.name)}. <span class="hint">Straight-line estimate.</span></p>
     <p class="basis">${offer ? `Offer here: ${h(offer.title)}${offer.terms ? `. ${h(offer.terms)}` : ''} (${h(channelInfo(offer.channel).label)})` : 'No offer found here.'}</p>`,
  );
}

function feedbackSection(it) {
  const last = it.visit;
  const chips = OUTCOMES.map(
    ([k, label]) =>
      `<button type="button" class="chip${last?.outcome === k ? ' is-on' : ''}" data-action="visit" data-id="${h(it.id)}" data-outcome="${k}">${h(label)}</button>`,
  ).join('');
  const note = last
    ? `<p class="basis">Marked “${h(OUTCOME_LABEL[last.outcome])}” at ${h(clock(last.at))}. <button type="button" class="linkish" data-action="unvisit" data-id="${h(it.id)}">Undo</button></p>`
    : '<p class="basis">One tap after your visit reorders what we suggest next.</p>';
  return section('How did it go?', `${note}<div class="chip-row">${chips}</div>`);
}

export function storeSheetHtml(it, v) {
  const status = statusLabel(it.status);
  const hours = status
    ? `<p class="sheet-hours tone-${status.tone}">${h(status.text)} <span class="hint">· hours from OpenStreetMap, may be out of date</span></p>`
    : it.raw.hours
      ? `<p class="sheet-hours">Listed hours: ${h(it.raw.hours)} <span class="hint">(OpenStreetMap)</span></p>`
      : '<p class="sheet-hours hint">Hours unknown</p>';
  const osmType = OSM_TYPE[it.id[0]];
  const osmId = it.id.slice(1);
  return `
    <p class="eyebrow">${h(eyebrow(it, v))}</p>
    <h2 id="sheet-title">${h(it.name)}</h2>
    <p class="sheet-sub">${it.raw.addr ? `${h(it.raw.addr)} · ` : ''}${h(aboutMiles(it.dist))} from ${h(v.originLabel)} <span class="hint">(straight line)</span></p>
    ${hours}
    ${it.brand?.warning ? `<p class="warning">${h(it.brand.warning)}</p>` : ''}
    <div class="actions actions-main">
      <a class="btn btn-primary" href="${h(directionsUrl(it.lat, it.lon))}" target="_blank" rel="noopener">Directions</a>
      <button type="button" class="btn" data-action="save" data-id="${h(it.id)}">${v.saved(it.id) ? '★ In pocket' : '☆ Save'}</button>
      <button type="button" class="btn" data-action="share" data-id="${h(it.id)}">Share</button>
      <button type="button" class="btn" data-action="nextstop" data-id="${h(it.id)}">${v.nextStop?.id === it.id ? 'Next stop ✓' : 'Next stop'}</button>
    </div>
    ${detourSection(it, v)}
    ${styleSection(it, v)}
    ${selectionSection(it, v)}
    ${dealsSection(it, v)}
    ${feedbackSection(it)}
    <p class="basis data-foot">Listing from OpenStreetMap (${ext(`https://www.openstreetmap.org/${osmType}/${osmId}`, `${osmType} ${h(osmId)} ↗`)}). Wrong or missing info? ${ext(`https://www.openstreetmap.org/note/new#map=19/${it.lat}/${it.lon}`, 'Add a note ↗')}</p>`;
}

// ---------------------------------------------------------------- events

export function eventSheetHtml(ev, v) {
  const timing = eventTiming(ev, v.today);
  const dates = ev.starts === ev.ends ? formatDay(ev.starts) : `${formatDay(ev.starts)} – ${formatDay(ev.ends)}`;
  const status = timing === 'today' ? (ev.ends === v.today ? 'Last day today' : 'On today') : timing === 'upcoming' ? `Starts ${formatDay(ev.starts)}` : 'Ended';
  // Apple Maps geocodes a full street address better than our coordinates do.
  const dir = ev.address
    ? `https://maps.apple.com/?daddr=${encodeURIComponent(ev.address)}&dirflg=w`
    : ev.lat != null
      ? directionsUrl(ev.lat, ev.lon)
      : null;
  const rows = [
    ['When', `${dates} · ${status}`],
    ['Hours', ev.hours],
    ['Discount', ev.discount],
    ['Good to know', ev.rules],
    ['Brands', ev.brands?.length ? ev.brands.join(', ') : null],
  ].filter(([, val]) => val);
  return `
    <p class="eyebrow">${h([EVENT_KIND[ev.kind], ev.category].filter(Boolean).join(' · '))}</p>
    <h2 id="sheet-title">${h(ev.name)}</h2>
    <p class="sheet-sub">${h([ev.venue, ev.address].filter(Boolean).join(' · ') || 'Venue not listed. Check the source.')}${ev.dist != null ? ` · ${h(aboutMiles(ev.dist))} from ${h(v.originLabel)}` : ''}</p>
    <div class="actions actions-main">
      ${dir ? `<a class="btn btn-primary" href="${h(dir)}" target="_blank" rel="noopener">Directions</a>` : ''}
      <button type="button" class="btn" data-action="save" data-id="${h(ev.id)}">${v.saved(ev.id) ? '★ In pocket' : '☆ Save'}</button>
      <button type="button" class="btn" data-action="share" data-id="${h(ev.id)}">Share</button>
    </div>
    <section class="card-section"><dl class="facts">${rows.map(([k, val]) => `<dt>${h(k)}</dt><dd>${h(val)}</dd>`).join('')}</dl></section>
    <p class="source">Source: ${ext(ev.sourceUrl, `${h(ev.sourceName)} ↗`)} · ${ev.confidence === 'high' ? 'dated listing' : 'details incomplete, double-check it'} · found ${h(formatCheckedAt(v.eventsCheckedAt, v.now))} via web search</p>
    <p class="basis">What the source said: “${h(ev.evidence)}”</p>`;
}

// ---------------------------------------------------------------- checkout

export function checkoutHtml(offer, brandName, checked) {
  const ch = channelInfo(offer.channel);
  return `<div class="checkout-panel">
    <button type="button" class="icon-btn checkout-close" data-close-checkout aria-label="Close">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
    </button>
    <p class="eyebrow">${h(brandName)} · show this at checkout</p>
    <h2 id="checkout-title">${h(offer.title)}</h2>
    ${offer.code ? `<p class="checkout-code">${h(offer.code)}</p><button type="button" class="btn" data-action="copy" data-text="${h(offer.code)}">Copy code</button>` : '<p class="checkout-nocode">The source doesn\'t list a code.</p>'}
    ${offer.channel === 'online' ? '<p class="warning">The source says this offer is online only.</p>' : ''}
    <dl class="facts">
      <dt>What qualifies</dt><dd>${h(offer.terms || 'Not stated')}</dd>
      <dt>Exclusions</dt><dd>${h(offer.exclusions || 'None stated')}</dd>
      <dt>Ends</dt><dd>${h(offer.ends ? formatDay(offer.ends) : 'No end date given')}</dd>
      <dt>In store?</dt><dd class="tone-${ch.tone}">${h(ch.label)}</dd>
      <dt>Source</dt><dd>${ext(offer.sourceUrl, `${h(offer.sourceName)} ↗`)}, found ${h(checked)}</dd>
    </dl>
  </div>`;
}

// ---------------------------------------------------------------- pocket

function pocketItemHtml(snap, v) {
  const dist = v.origin && snap.lat != null ? ` · ${formatMiles(v.distanceTo([snap.lat, snap.lon]))}` : '';
  const dir = snap.lat != null ? directionsUrl(snap.lat, snap.lon) : null;
  const o = snap.offer;
  const shot = v.shot(snap.id);
  return `<li class="pocket-item">
    <div class="pocket-head">
      <button type="button" class="linkish pocket-name" data-open="${h(snap.id)}">${h(snap.name)}</button>
      <button type="button" class="icon-btn icon-btn-small" data-action="unsave" data-id="${h(snap.id)}" aria-label="Remove ${h(snap.name)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
    </div>
    <p class="basis">${h([snap.address, snap.when].filter(Boolean).join(' · ') || 'No address listed')}${h(dist)}</p>
    ${o ? `<div class="pocket-offer"><strong>${h(o.title)}</strong>${o.code ? ` · code <span class="mono">${h(o.code)}</span>` : ''}<br><span class="basis">${h(channelInfo(o.channel).label)}${o.ends ? ` · ends ${h(formatDay(o.ends))}` : ''} · ${h(o.sourceName)}</span></div>` : snap.note ? `<p class="basis">${h(snap.note)}</p>` : ''}
    ${shot ? `<button type="button" class="shot" data-action="view-shot" data-id="${h(snap.id)}"><img src="${h(shot)}" alt="Saved screenshot for ${h(snap.name)}"></button>` : ''}
    <div class="actions">
      ${dir ? `<a class="btn btn-small" href="${h(dir)}" target="_blank" rel="noopener">Directions</a>` : ''}
      <button type="button" class="btn btn-small" data-action="add-shot" data-id="${h(snap.id)}">${shot ? 'Replace screenshot' : 'Add offer screenshot'}</button>
      ${shot ? `<button type="button" class="btn btn-small" data-action="remove-shot" data-id="${h(snap.id)}">Remove screenshot</button>` : ''}
    </div>
  </li>`;
}

export function pocketHtml(v) {
  const saved = Object.values(v.shortlist).sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  const visits = v.visits.slice(-12).reverse();
  const hunt = v.huntItems;
  return `
    <p class="eyebrow">Works without signal</p>
    <h2 id="sheet-title">Your pocket</h2>
    <p class="basis">Saved stores keep their address, hours and offer terms on this phone, so they still work in a basement with no signal. Aim for about five.</p>
    ${saved.length ? `<ul class="pocket">${saved.map((s) => pocketItemHtml(s, v)).join('')}</ul>` : '<p class="empty">Nothing saved yet. Tap ☆ Save on any store.</p>'}
    ${hunt.length ? section('Hunting for', `<ul class="plain">${hunt.map((i) => `<li>${i.done ? '✓ ' : ''}${h(i.text)}${i.size ? ` · size ${h(i.size)}` : ''}</li>`).join('')}</ul>`) : ''}
    ${visits.length ? section('Today\'s visits', `<ul class="plain">${visits.map((x) => `<li>${h(clock(x.at))} · ${h(x.name)} · ${h(OUTCOME_LABEL[x.outcome])}</li>`).join('')}</ul>`) : ''}
    ${section('No signal?', '<p class="basis">Maps need signal, but Apple Maps can work offline. Before you go, download Manhattan: in Apple Maps tap your profile picture, then <strong>Offline Maps → Download New Map</strong>. Every “Directions” button here opens Apple Maps.</p>')}
    <p><button type="button" class="linkish danger" data-action="clear-all">Clear everything saved on this phone</button></p>`;
}

// ---------------------------------------------------------------- about

export function aboutHtml(v) {
  return `
    <p class="eyebrow">How it works</p>
    <h2 id="sheet-title">Which store deserves your next 20 minutes?</h2>
    <p>Next Stop lists fashion shops around you or in a neighborhood you pick, and ranks them. <strong>Browse</strong> weighs distance and style fit. <strong>Find something</strong> puts shops whose catalogs carry your item first.</p>
    ${section('What each card tells you', `<ul class="plain">
      <li><strong>Style fit</strong>: what the brand is known for, with the basis shown (our brand notes or OpenStreetMap tags).</li>
      <li><strong>Selection</strong>: what the brand sells online. That isn't confirmed stock at that store, so call if it matters.</li>
      <li><strong>Deals</strong>: each offer links to its source and shows when it was checked and whether the source says it works in store.</li></ul>`)}
    ${section('Where the data comes from', `<ul class="plain">
      <li>Shops: OpenStreetMap, rebuilt every morning for ${h(v.areaCount)} neighborhoods (${h(v.storesUpdated || 'not built yet')}). Anywhere else, “Search this area” asks OpenStreetMap live.</li>
      <li>Deals: a research run on ${h(v.dealsChecked || 'unknown')}. Brands it didn't reach say “not researched,” which is different from “no deals.”</li>
      <li>Distances are straight-line. Directions open Apple Maps for walking routes.</li></ul>`)}
    ${section('Tips', `<ul class="plain">
      <li>Add to Home Screen: tap Share → Add to Home Screen, so it opens like an app.</li>
      <li>Location only updates while the page is open. That's a limit of web apps on iPhone.</li>
      <li>Everything you save stays on this phone. Nothing is uploaded.</li></ul>`)}
    <p class="basis">Map © OpenStreetMap contributors · tiles © CARTO · Leaflet.</p>`;
}
