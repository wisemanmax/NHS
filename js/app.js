// Next Stop: which store deserves your next 20 minutes?
import { buildBrandIndex, inferFromTags, matchBrand } from './brands.js';
import { activeOffers, eventTiming, todayISO } from './deals.js';
import { formatCheckedAt, priceLabel } from './format.js';
import { distanceMeters, pointInPolygon } from './geo.js';
import { openStatus, parseOpeningHours } from './hours.js';
import { createMap } from './map.js';
import { boxAround, fetchShopsInBox } from './overpass.js';
import { buildSections, parseQuery } from './rank.js';
import { clearAll, deleteShot, loadShot, loadState, saveShot, saveState } from './state.js';
import {
  OUTCOME_LABEL,
  aboutHtml,
  checkoutHtml,
  eventRowHtml,
  eventSheetHtml,
  pocketHtml,
  storeRowHtml,
  storeSheetHtml,
} from './views.js';
import { escapeHtml as h } from './format.js';

const $ = (sel) => document.querySelector(sel);
const PAGE = 30;
const MOVE_RERENDER_M = 40;

const state = loadState();
const save = () => saveState(state);

const app = {
  areas: [],
  areaById: new Map(),
  styleLabels: {},
  brandIndex: null,
  deals: { brands: {} },
  events: [],
  eventsCheckedAt: null,
  storesDoc: null,
  stores: new Map(),
  origin: [40.7233, -73.9993],
  originSource: 'area',
  gps: null,
  watchId: null,
  lastRenderOrigin: null,
  today: todayISO(),
  now: new Date(),
  categories: [],
  live: { loading: false, error: null, added: 0 },
  mainLimit: PAGE,
  otherLimit: PAGE,
  otherOpen: false,
  eventsOpen: null,
  sheetId: null,
  selectedId: null,
  pin: null,
  map: null,
  markersKey: '',
  lastFocus: null,
  shotTarget: null,
};

boot();

// ------------------------------------------------------------------ boot

async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function boot() {
  const [areasDoc, brandsDoc, dealsDoc, eventsDoc, storesDoc] = await Promise.all(
    ['data/areas.json', 'data/brands.json', 'data/deals.json', 'data/events.json', 'data/stores.json'].map(fetchJson),
  );
  if (!areasDoc || !brandsDoc) {
    $('#list').innerHTML = '<p class="loading">Couldn\'t load the store data. Check your connection and reload.</p>';
    return;
  }
  app.areas = areasDoc.areas;
  app.areaById = new Map(app.areas.map((a) => [a.id, a]));
  app.styleLabels = brandsDoc.styles;
  app.brandIndex = buildBrandIndex(brandsDoc.brands);
  app.deals = dealsDoc || { brands: {} };
  app.events = (eventsDoc?.events || []).map((e) => ({ ...e, kind: e.kind || 'sample-sale', isEvent: true }));
  app.eventsCheckedAt = eventsDoc?.checkedAt || null;
  app.storesDoc = storesDoc;
  for (const raw of storesDoc?.stores || []) addStore(raw, 'guide');

  setupControls();
  app.map = createMap($('#map'), { onSelect: (id) => openById(id, { fromMap: true }), onViewChange: updateMapButtons });
  app.map.setAreas(app.areas, areaLabel);
  if (state.ui.mapHidden) setMapHidden(true);

  const area = app.areaById.get(state.ui.areaId) || app.areas[0];
  setOriginToArea(area, { render: false });
  app.categories = parseQuery(activeHunt()?.text || '');
  render();

  if (state.ui.useGps) startGps();
  applyHash();
  window.addEventListener('hashchange', applyHash);
  if (!storesDoc) liveSearch(boxAround(app.origin));

  setInterval(() => {
    app.today = todayISO();
    render();
    refreshSheet();
  }, 60_000);
  window.addEventListener('online', () => toast('Back online.'));
  window.addEventListener('offline', () => toast('Offline. Your pocket and the store list still work, but the map may not.', 6000));
  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ------------------------------------------------------------------ data

function areaAt(point) {
  return app.areas.find((a) => pointInPolygon(point, a.polygon)) || null;
}

function addStore(raw, source) {
  if (app.stores.has(raw.id)) return false;
  const brand = matchBrand(raw, app.brandIndex);
  const inferred = inferFromTags(raw);
  app.stores.set(raw.id, {
    id: raw.id,
    raw,
    source,
    name: raw.name,
    lat: raw.lat,
    lon: raw.lon,
    area: raw.area || areaAt([raw.lat, raw.lon])?.id || null,
    brand,
    deals: brand ? app.deals.brands[brand.id] || null : null,
    inferred,
    styles: brand ? brand.styles : inferred.styles,
    carries: brand ? brand.carries : inferred.carries,
    price: brand?.price ?? null,
    researched: Boolean(brand),
    hours: parseOpeningHours(raw.hours),
    offers: [],
    hasOffer: false,
    dist: 0,
    status: null,
    visit: null,
  });
  return true;
}

const activeHunt = () => state.hunt.items.find((i) => i.id === state.hunt.activeId && !i.done) || null;

function latestVisits() {
  const map = new Map();
  for (const v of state.visits) map.set(v.id, v);
  return map;
}

function areaLabel(area) {
  const count = app.storesDoc?.counts?.[area.id];
  return `${h(area.name)}${count != null ? ` · ${count}` : ''}`;
}

const currentArea = () =>
  app.originSource === 'gps' ? areaAt(app.origin) : app.areaById.get(state.ui.areaId) || null;

// ------------------------------------------------------------------ view context

function viewCtx() {
  return {
    origin: app.origin,
    originLabel: app.originSource === 'gps' ? 'you' : `${currentArea()?.name || 'here'} center`,
    nextStop: state.nextStop,
    styleLabels: app.styleLabels,
    selectedStyles: new Set(state.ui.styles),
    mode: state.ui.mode,
    categories: app.categories,
    huntText: activeHunt()?.text || '',
    huntSize: activeHunt()?.size || '',
    saved: (id) => Boolean(state.shortlist[id]),
    shortlist: state.shortlist,
    visits: state.visits,
    huntItems: state.hunt.items,
    shot: (id) => loadShot(id),
    distanceTo: (p) => distanceMeters(app.origin, p),
    today: app.today,
    now: app.now,
    eventsCheckedAt: app.eventsCheckedAt,
    areaCount: app.areas.length,
    storesUpdated: formatCheckedAt(app.storesDoc?.generatedAt, app.now),
    dealsChecked: formatCheckedAt(app.deals.checkedAt, app.now),
  };
}

// ------------------------------------------------------------------ render

function render() {
  app.now = new Date();
  app.lastRenderOrigin = app.origin;
  const visits = latestVisits();
  const hunt = activeHunt();
  const items = [];
  for (const it of app.stores.values()) {
    it.dist = distanceMeters(app.origin, [it.lat, it.lon]);
    it.status = openStatus(it.hours, app.now);
    it.offers = it.deals ? activeOffers(it.deals.offers, app.today) : [];
    it.storeOffers = it.offers.filter((o) => o.channel !== 'online');
    it.hasOffer = it.storeOffers.length > 0;
    it.onlineOffer = !it.hasOffer && it.offers.length > 0;
    const visit = visits.get(it.id);
    it.visit = visit ? { ...visit, forHunt: Boolean(hunt && visit.hunt === hunt.text) } : null;
    items.push(it);
  }
  const ctx = {
    mode: state.ui.mode,
    styles: new Set(state.ui.styles),
    budget: Number(state.ui.budget) || 0,
    offersOnly: state.ui.offersOnly,
    sort: state.ui.sort,
    categories: app.categories,
    prefs: state.prefs,
  };
  const { main, other, hidden } = buildSections(items, ctx);
  const events = app.events
    .filter((e) => eventTiming(e, app.today) !== 'ended')
    .map((e) => Object.assign(e, { dist: e.lat != null ? distanceMeters(app.origin, [e.lat, e.lon]) : null }))
    .sort((a, b) => {
      const ta = eventTiming(a, app.today) === 'today' ? 0 : 1;
      const tb = eventTiming(b, app.today) === 'today' ? 0 : 1;
      return ta - tb || (a.dist ?? 1e9) - (b.dist ?? 1e9);
    });

  $('#list').innerHTML = listHtml(main, other, hidden, events);
  renderMarkers(main, other, events);
  updateControls();
  updateCredits();
}

function listHtml(main, other, hidden, events) {
  const v = viewCtx();
  const parts = [coverageHtml()];
  if (state.nextStop) {
    parts.push(`<div class="banner">Heading to <button type="button" class="linkish" data-open="${h(state.nextStop.id)}">${h(state.nextStop.name)}</button>. Rows show the extra distance each stop adds.
      <button type="button" class="linkish" data-action="clear-nextstop">Clear</button></div>`);
  }
  if (events.length && state.ui.mode === 'browse') {
    const onToday = events.filter((e) => eventTiming(e, app.today) === 'today');
    const nearby = onToday.some((e) => e.dist != null && e.dist < 1200);
    const open = app.eventsOpen ?? nearby;
    parts.push(`<details class="list-section other events" id="events"${open ? ' open' : ''}>
      <summary>Sample sales &amp; events <span class="count">${onToday.length} on today</span></summary>
      <ul class="rows">${events.map((e) => eventRowHtml(e, v)).join('')}</ul>
    </details>`);
  }

  const hunt = activeHunt();
  let title = 'Best matches nearby';
  if (state.ui.mode === 'find') {
    title = hunt ? `Catalogs with “${h(hunt.text)}”` : 'Nearby shops';
  } else if (state.ui.sort === 'nearest') {
    title = 'Nearest first';
  }
  parts.push(`<section class="list-section">
    <div class="list-head">
      <h2 class="list-title">${title}</h2>
      ${state.ui.mode === 'browse' ? `<label class="sort"><span class="sr-only">Sort</span><select id="sort-select">
        <option value="best"${state.ui.sort === 'best' ? ' selected' : ''}>Best match</option>
        <option value="nearest"${state.ui.sort === 'nearest' ? ' selected' : ''}>Nearest</option></select></label>` : ''}
    </div>`);
  if (state.ui.mode === 'find' && hunt && !app.categories.length) {
    parts.push(`<p class="note">We couldn't tell what kind of item “${h(hunt.text)}” is, so this is just nearby shops. Try words like boots, jeans, jacket, dress or sweater.</p>`);
  }
  if (main.length) {
    parts.push(`<ul class="rows" id="results">${main.slice(0, app.mainLimit).map((it) => storeRowHtml(it, v)).join('')}</ul>`);
    if (main.length > app.mainLimit) {
      parts.push(`<button type="button" class="more" data-action="more">Show more (${main.length - app.mainLimit} left)</button>`);
    }
  } else {
    parts.push(`<p class="empty">${emptyText()}</p>`);
  }
  parts.push('</section>');

  if (other.length) {
    const label =
      state.ui.mode === 'find' && app.categories.length
        ? 'Shops with an unknown catalog'
        : 'Other shops nearby, not researched';
    parts.push(`<details class="list-section other" id="other"${app.otherOpen ? ' open' : ''}>
      <summary>${label} <span class="count">${other.length}</span></summary>
      <p class="note">Listed on OpenStreetMap, but we don't know their style or deals yet. Great for wandering.</p>
      <ul class="rows">${other.slice(0, app.otherLimit).map((it) => storeRowHtml(it, v)).join('')}</ul>
      ${other.length > app.otherLimit ? `<button type="button" class="more" data-action="more-other">Show more (${other.length - app.otherLimit} left)</button>` : ''}
    </details>`);
  }
  if (hidden) {
    parts.push(`<p class="note hidden-note">${hidden} shop${hidden === 1 ? '' : 's'} hidden by your ${state.ui.mode === 'find' ? 'search and filters' : 'filters'}.
      <button type="button" class="linkish" data-action="clear-filters">Clear filters</button></p>`);
  }
  return parts.join('');
}

function emptyText() {
  if (state.ui.mode === 'find' && !activeHunt()) return 'Type what you\'re hunting for above, e.g. “black ankle boots” or “denim jacket”.';
  if (app.live.loading) return 'Searching OpenStreetMap…';
  return 'No researched shops match. Try fewer filters, or open the other shops below.';
}

function coverageHtml() {
  const area = currentArea();
  const lines = [];
  if (app.live.loading) lines.push('<span class="spinner" aria-hidden="true"></span> Searching OpenStreetMap around here…');
  if (area) {
    let listed = 0;
    let withOffers = 0;
    let onlineOnly = 0;
    for (const it of app.stores.values()) {
      if (it.area !== area.id) continue;
      listed++;
      if (it.hasOffer) withOffers++;
      else if (it.onlineOffer) onlineOnly++;
    }
    lines.push(`<strong>${h(area.name)}</strong> · ${listed} shops listed · ${withOffers} with offers found${onlineOnly ? ` (+${onlineOnly} online-only)` : ''}`);
  } else {
    const near = [...app.stores.values()].filter((it) => it.dist < 1200).length;
    lines.push(`<strong>Outside the researched neighborhoods.</strong> ${near} shops from OpenStreetMap within ¾ mile. Brand deals still show where we know the brand.
      <button type="button" class="linkish" data-action="search-here">Search here again</button>`);
  }
  if (!app.storesDoc) lines.push('The morning store list isn\'t available, so shops come from a live OpenStreetMap search.');
  if (app.live.error) lines.push(`Live search failed (${h(app.live.error)}). <button type="button" class="linkish" data-action="search-here">Try again</button>`);
  const checked = formatCheckedAt(app.deals.checkedAt, app.now);
  lines.push(`<span class="hint">Deals checked ${h(checked || 'never')} · distances are straight-line · <a href="https://www.openstreetmap.org/note/new#map=18/${app.origin[0].toFixed(5)}/${app.origin[1].toFixed(5)}" target="_blank" rel="noopener">Missing a shop?</a></span>`);
  return `<div class="coverage">${lines.map((l) => `<p>${l}</p>`).join('')}</div>`;
}

function renderMarkers(main, other, events) {
  const visible = [...main, ...other];
  const key = `${visible.map((i) => i.id + (i.hasOffer ? '+' : i.onlineOffer ? '~' : '')).join(',')}|${Object.keys(state.shortlist).join(',')}|${app.selectedId}`;
  if (key !== app.markersKey) {
    app.markersKey = key;
    app.map.setStores(
      visible.map((it) => ({
        id: it.id,
        lat: it.lat,
        lon: it.lon,
        name: it.name,
        hasOffer: it.hasOffer,
        onlineOffer: it.onlineOffer,
        researched: it.researched,
        saved: Boolean(state.shortlist[it.id]),
      })),
      app.selectedId,
    );
  }
  app.map.setEvents(events);
}

function updateCredits() {
  const doc = app.storesDoc;
  $('#credits').innerHTML = `
    <p>Shops: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors (ODbL)${doc ? `, list rebuilt ${h(formatCheckedAt(doc.generatedAt, app.now))}` : ''}.
    Deals researched ${h(formatCheckedAt(app.deals.checkedAt, app.now) || 'never')}. Confirm at the register.</p>
    <p><button type="button" class="linkish" data-action="about">How Next Stop works</button></p>`;
}

// ------------------------------------------------------------------ controls

function setupControls() {
  // Neighborhood picker
  const select = $('#area-select');
  select.innerHTML = app.areas.map((a) => `<option value="${h(a.id)}">${h(a.name)}</option>`).join('');
  select.addEventListener('change', () => {
    const area = app.areaById.get(select.value);
    if (area) setOriginToArea(area);
  });

  $('#loc-btn').addEventListener('click', () => {
    if (app.watchId == null) startGps();
    else if (app.gps) {
      app.originSource = 'gps';
      app.origin = [app.gps.lat, app.gps.lon];
      app.map.focus(app.gps.lat, app.gps.lon, 16);
      render();
    }
  });

  // Modes
  for (const btn of document.querySelectorAll('[data-mode]')) {
    btn.addEventListener('click', () => {
      state.ui.mode = btn.dataset.mode;
      app.mainLimit = PAGE;
      save();
      render();
      if (state.ui.mode === 'find' && !activeHunt()) $('#find-text').focus();
    });
  }

  $('#find-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('#find-text').value.trim();
    if (!text) return toast('Type what you\'re looking for first.');
    const item = { id: Date.now().toString(36), text, size: $('#find-size').value.trim(), done: false };
    state.hunt.items.push(item);
    state.hunt.activeId = item.id;
    $('#find-text').value = '';
    $('#find-size').value = '';
    app.categories = parseQuery(text);
    app.mainLimit = PAGE;
    save();
    render();
    $('#find-text').blur();
  });

  // Style chips
  $('#style-chips').innerHTML = Object.entries(app.styleLabels)
    .map(([id, label]) => `<button type="button" class="chip" data-style="${h(id)}" aria-pressed="false">${h(label)}</button>`)
    .join('');
  $('#style-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-style]');
    if (!chip) return;
    const id = chip.dataset.style;
    state.ui.styles = state.ui.styles.includes(id) ? state.ui.styles.filter((s) => s !== id) : [...state.ui.styles, id];
    app.mainLimit = PAGE;
    save();
    render();
  });

  $('#budget-select').addEventListener('change', (e) => {
    state.ui.budget = Number(e.target.value);
    save();
    render();
  });
  $('#offers-chip').addEventListener('click', () => {
    state.ui.offersOnly = !state.ui.offersOnly;
    save();
    render();
  });

  $('#map-toggle').addEventListener('click', () => setMapHidden(!state.ui.mapHidden));
  $('#search-area-btn').addEventListener('click', () => liveSearch(clampBox(app.map.bounds())));
  $('#recenter-btn').addEventListener('click', () => app.gps && app.map.focus(app.gps.lat, app.gps.lon, 16));
  $('#meet-btn').addEventListener('click', shareMeetup);
  $('#pocket-btn').addEventListener('click', () => openSheet(pocketHtml(viewCtx()), 'pocket'));
  $('#about-btn').addEventListener('click', () => openSheet(aboutHtml(viewCtx()), 'about'));

  document.addEventListener('click', onClick);
  document.addEventListener('change', (e) => {
    if (e.target.id === 'sort-select') {
      state.ui.sort = e.target.value;
      save();
      render();
    }
  });
  document.addEventListener('toggle', (e) => {
    if (e.target.id === 'other') app.otherOpen = e.target.open;
    if (e.target.id === 'events') app.eventsOpen = e.target.open;
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#checkout').hidden) closeCheckout();
    else if (!$('#sheet').hidden) closeSheet();
  });
  $('#shot-input').addEventListener('change', onShotChosen);
}

function updateControls() {
  const gpsOn = app.originSource === 'gps' && app.gps;
  const loc = $('#loc-btn');
  loc.setAttribute('aria-pressed', String(Boolean(gpsOn)));
  loc.classList.toggle('is-on', Boolean(gpsOn));
  $('#loc-label').textContent = app.watchId != null && !app.gps ? 'Locating…' : gpsOn ? 'Near me' : 'My location';
  $('#area-wrap').classList.toggle('is-on', app.originSource === 'area');
  const area = currentArea();
  if (area) $('#area-select').value = area.id;

  for (const btn of document.querySelectorAll('[data-mode]')) {
    btn.setAttribute('aria-selected', String(btn.dataset.mode === state.ui.mode));
  }
  const find = state.ui.mode === 'find';
  $('#find-form').hidden = !find;
  const hunt = $('#hunt');
  const items = state.hunt.items.filter((i) => !i.done);
  hunt.hidden = !find || !items.length;
  hunt.innerHTML = items.length
    ? `<span class="hunt-label">Hunting:</span>${items
        .map(
          (i) => `<span class="hunt-item${i.id === state.hunt.activeId ? ' is-on' : ''}">
          <button type="button" class="hunt-pick" data-action="hunt-pick" data-id="${h(i.id)}">${h(i.text)}${i.size ? ` · ${h(i.size)}` : ''}</button>
          <button type="button" class="hunt-x" data-action="hunt-done" data-id="${h(i.id)}" aria-label="Found ${h(i.text)}">✓</button>
          <button type="button" class="hunt-x" data-action="hunt-remove" data-id="${h(i.id)}" aria-label="Remove ${h(i.text)}">✕</button>
        </span>`,
        )
        .join('')}`
    : '';

  $('#budget-select').value = String(state.ui.budget || 0);
  $('#offers-chip').setAttribute('aria-pressed', String(state.ui.offersOnly));
  for (const chip of document.querySelectorAll('[data-style]')) {
    chip.setAttribute('aria-pressed', String(state.ui.styles.includes(chip.dataset.style)));
  }
  $('#pocket-count').textContent = String(Object.keys(state.shortlist).length);
  updateMapButtons();
}

function updateMapButtons() {
  if (!app.map) return;
  $('#search-area-btn').hidden = app.map.zoom() < 15 || app.live.loading;
  $('#recenter-btn').hidden = !app.gps;
  $('#meet-btn').hidden = !app.gps;
}

function setMapHidden(hidden) {
  state.ui.mapHidden = hidden;
  save();
  $('#map-wrap').classList.toggle('is-hidden', hidden);
  $('#map-toggle').textContent = hidden ? 'Show map' : 'Hide map';
  $('#map-toggle').setAttribute('aria-expanded', String(!hidden));
  if (!hidden) setTimeout(() => app.map?.invalidate(), 50);
}

// ------------------------------------------------------------------ origin & location

function setOriginToArea(area, { render: doRender = true } = {}) {
  state.ui.areaId = area.id;
  app.originSource = 'area';
  app.origin = area.center;
  app.mainLimit = PAGE;
  save();
  app.map?.focus(area.center[0], area.center[1], area.zoom);
  if (doRender) render();
}

function startGps() {
  if (!('geolocation' in navigator)) {
    toast('This browser can\'t share your location. Pick a neighborhood instead.');
    return;
  }
  state.ui.useGps = true;
  save();
  app.watchId = navigator.geolocation.watchPosition(onPosition, onGpsError, {
    enableHighAccuracy: true,
    maximumAge: 15000,
    timeout: 30000,
  });
  updateControls();
}

function stopGps() {
  if (app.watchId != null) navigator.geolocation.clearWatch(app.watchId);
  app.watchId = null;
}

function onPosition(pos) {
  const first = !app.gps;
  app.gps = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy };
  app.map.setMe(app.gps);
  const here = [app.gps.lat, app.gps.lon];
  if (first) {
    app.originSource = 'gps';
    app.origin = here;
    app.map.focus(here[0], here[1], 16);
    render();
    maybeSearchAround(here);
    return;
  }
  if (app.originSource !== 'gps') return updateMapButtons();
  app.origin = here;
  if (!app.lastRenderOrigin || distanceMeters(app.lastRenderOrigin, here) > MOVE_RERENDER_M) {
    render();
    refreshSheet();
  }
}

function onGpsError(err) {
  if (err.code === 1) {
    stopGps();
    state.ui.useGps = false;
    save();
    updateControls();
    toast('Location is off for this site. Pick a neighborhood instead, or allow it in Settings → Privacy & Security → Location Services → Safari Websites.', 9000);
  } else if (!app.gps) {
    toast('Still looking for your location…');
  }
}

function maybeSearchAround(point) {
  const nearby = [...app.stores.values()].filter((it) => distanceMeters(point, [it.lat, it.lon]) < 700).length;
  if (!areaAt(point) || nearby < 3) liveSearch(boxAround(point, 900));
}

// Keep live searches to a few blocks so the public Overpass servers answer quickly.
function clampBox([s, w, n, e]) {
  const maxLat = 0.018;
  const maxLon = 0.024;
  const cLat = (s + n) / 2;
  const cLon = (w + e) / 2;
  const halfLat = Math.min((n - s) / 2, maxLat / 2);
  const halfLon = Math.min((e - w) / 2, maxLon / 2);
  return [cLat - halfLat, cLon - halfLon, cLat + halfLat, cLon + halfLon];
}

async function liveSearch(bbox) {
  if (app.live.loading) return;
  app.live = { loading: true, error: null, added: 0 };
  render();
  try {
    const shops = await fetchShopsInBox(bbox);
    let added = 0;
    for (const raw of shops) if (addStore(raw, 'live')) added++;
    app.live = { loading: false, error: null, added };
    toast(added ? `Found ${added} more shop${added === 1 ? '' : 's'} on OpenStreetMap.` : 'No new shops found in this area.');
  } catch (err) {
    app.live = { loading: false, error: err?.name === 'AbortError' ? 'timed out' : err?.message || 'network error', added: 0 };
  }
  app.markersKey = '';
  render();
}

// ------------------------------------------------------------------ sheets

function findById(id) {
  return app.stores.get(id) || app.events.find((e) => e.id === id) || null;
}

function openById(id, { fromMap = false } = {}) {
  const found = findById(id);
  if (!found) {
    const snap = state.shortlist[id];
    if (snap?.lat != null) {
      app.map.focus(snap.lat, snap.lon, 17);
      toast(`${snap.name} isn't in the current list, so here it is on the map.`);
      closeSheet();
    }
    return;
  }
  app.selectedId = id;
  if (!fromMap && found.lat != null && !state.ui.mapHidden) app.map.focus(found.lat, found.lon);
  if (found.isEvent) {
    if (found.lat != null) found.dist = distanceMeters(app.origin, [found.lat, found.lon]);
    openSheet(eventSheetHtml(found, viewCtx()), id);
  } else {
    openSheet(storeSheetHtml(found, viewCtx()), id);
  }
  renderMarkersOnly();
}

function renderMarkersOnly() {
  app.markersKey = '';
  render();
}

function openSheet(html, id) {
  if ($('#sheet').hidden) app.lastFocus = document.activeElement;
  app.sheetId = id;
  $('#sheet-body').innerHTML = html;
  $('#sheet').hidden = false;
  document.body.classList.add('sheet-open');
  const panel = $('#sheet .sheet-panel');
  panel.scrollTop = 0;
  panel.focus({ preventScroll: true });
}

function refreshSheet() {
  const id = app.sheetId;
  if (!id || $('#sheet').hidden) return;
  const panel = $('#sheet .sheet-panel');
  const top = panel.scrollTop;
  if (id === 'pocket') $('#sheet-body').innerHTML = pocketHtml(viewCtx());
  else if (id === 'about') return;
  else {
    const found = findById(id);
    if (!found) return;
    $('#sheet-body').innerHTML = found.isEvent ? eventSheetHtml(found, viewCtx()) : storeSheetHtml(found, viewCtx());
  }
  panel.scrollTop = top;
}

function closeSheet() {
  if ($('#sheet').hidden) return;
  $('#sheet').hidden = true;
  document.body.classList.remove('sheet-open');
  app.sheetId = null;
  if (app.selectedId) {
    app.selectedId = null;
    renderMarkersOnly();
  }
  app.lastFocus?.focus?.({ preventScroll: true });
}

function openCheckout(itemId, index) {
  const it = app.stores.get(itemId);
  const offer = it?.offers[index];
  if (!offer) return;
  const el = $('#checkout');
  el.innerHTML = checkoutHtml(offer, it.brand?.name || it.name, formatCheckedAt(it.deals.checkedAt, app.now));
  el.hidden = false;
  el.querySelector('.checkout-close').focus();
}

function closeCheckout() {
  $('#checkout').hidden = true;
}

// ------------------------------------------------------------------ actions

function onClick(e) {
  if (e.target.closest('[data-close]')) return closeSheet();
  if (e.target.closest('[data-close-checkout]') || e.target.id === 'checkout') return closeCheckout();

  const opener = e.target.closest('[data-open]');
  if (opener) return openById(opener.dataset.open);

  const el = e.target.closest('[data-action]');
  if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.action) {
    case 'save':
      return toggleSaved(id);
    case 'unsave':
      delete state.shortlist[id];
      deleteShot(id);
      save();
      refreshSheet();
      return render();
    case 'share':
      return shareItem(id);
    case 'nextstop':
      return toggleNextStop(id);
    case 'clear-nextstop':
      state.nextStop = null;
      save();
      return render();
    case 'checkout':
      return openCheckout(id, Number(el.dataset.offer));
    case 'copy':
      return copyText(el.dataset.text);
    case 'visit':
      return recordVisit(id, el.dataset.outcome);
    case 'unvisit':
      return undoVisit(id);
    case 'more':
      app.mainLimit += PAGE;
      return render();
    case 'more-other':
      app.otherLimit += PAGE * 2;
      return render();
    case 'clear-filters':
      state.ui.styles = [];
      state.ui.budget = 0;
      state.ui.offersOnly = false;
      save();
      return render();
    case 'search-here':
      return liveSearch(boxAround(app.origin, 900));
    case 'hunt-pick':
      state.hunt.activeId = id;
      app.categories = parseQuery(activeHunt()?.text || '');
      save();
      return render();
    case 'hunt-done':
    case 'hunt-remove': {
      const item = state.hunt.items.find((i) => i.id === id);
      if (!item) return;
      if (el.dataset.action === 'hunt-done') {
        item.done = true;
        toast(`Crossed off “${item.text}”.`);
      } else {
        state.hunt.items = state.hunt.items.filter((i) => i.id !== id);
      }
      if (state.hunt.activeId === id) state.hunt.activeId = state.hunt.items.find((i) => !i.done)?.id || null;
      app.categories = parseQuery(activeHunt()?.text || '');
      save();
      return render();
    }
    case 'add-shot':
      app.shotTarget = id;
      return $('#shot-input').click();
    case 'remove-shot':
      deleteShot(id);
      return refreshSheet();
    case 'view-shot':
      return viewShot(id);
    case 'clear-all':
      if (!confirm('Clear your pocket, visits, hunt list and preferences on this phone?')) return;
      clearAll();
      location.reload();
      return;
    case 'about':
      return openSheet(aboutHtml(viewCtx()), 'about');
    default:
  }
}

function snapshot(found) {
  if (found.isEvent) {
    return {
      id: found.id,
      kind: 'event',
      name: found.name,
      address: found.address,
      lat: found.lat,
      lon: found.lon,
      when: found.hours,
      note: [found.discount, found.rules].filter(Boolean).join(' '),
      offer: null,
      savedAt: new Date().toISOString(),
    };
  }
  const o = found.offers[0];
  return {
    id: found.id,
    kind: 'store',
    name: found.name,
    address: found.raw.addr || null,
    lat: found.lat,
    lon: found.lon,
    when: found.raw.hours || null,
    phone: found.raw.phone || null,
    price: priceLabel(found.price),
    offer: o
      ? { title: o.title, code: o.code, terms: o.terms, exclusions: o.exclusions, ends: o.ends, channel: o.channel, sourceName: o.sourceName, sourceUrl: o.sourceUrl }
      : null,
    note: !o && found.deals?.signup ? `Sign-up offer: ${found.deals.signup.offer}` : '',
    savedAt: new Date().toISOString(),
  };
}

function toggleSaved(id) {
  const found = findById(id);
  if (!found) return;
  if (state.shortlist[id]) {
    delete state.shortlist[id];
    deleteShot(id);
    toast(`Removed ${found.name} from your pocket.`);
  } else {
    state.shortlist[id] = snapshot(found);
    const n = Object.keys(state.shortlist).length;
    toast(n === 1 ? 'Saved to your pocket. It works without signal.' : `Saved. ${n} in your pocket.`);
  }
  save();
  app.markersKey = '';
  render();
  refreshSheet();
}

function toggleNextStop(id) {
  const found = findById(id);
  if (!found) return;
  if (state.nextStop?.id === id) {
    state.nextStop = null;
  } else {
    state.nextStop = { id, name: found.name, lat: found.lat, lon: found.lon };
    toast(`Next stop: ${found.name}. Other stores now show the detour.`);
  }
  save();
  render();
  refreshSheet();
}

function shareUrl(params) {
  return `${location.origin}${location.pathname}#${new URLSearchParams(params)}`;
}

async function share({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  copyText(url, 'Link copied. Paste it in your group chat.');
}

function shareItem(id) {
  const found = findById(id);
  if (!found) return;
  const params = { s: id, n: found.name };
  if (found.lat != null) params.ll = `${found.lat},${found.lon}`;
  const where = found.isEvent ? found.address || found.venue : found.raw.addr;
  share({ title: found.name, text: `Meet at ${found.name}${where ? `, ${where}` : ''}`, url: shareUrl(params) });
}

function shareMeetup() {
  if (!app.gps) return;
  share({
    title: 'Meet here',
    text: 'Meet me here',
    url: shareUrl({ ll: `${app.gps.lat.toFixed(5)},${app.gps.lon.toFixed(5)}`, n: 'Meet here' }),
  });
}

async function copyText(text, message = 'Copied.') {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    window.prompt('Copy this:', text);
  }
}

function recordVisit(id, outcome) {
  const found = findById(id);
  if (!found) return;
  const hunt = state.ui.mode === 'find' ? activeHunt() : null;
  const visit = { id, name: found.name, outcome, at: new Date().toISOString(), hunt: hunt?.text || null, undo: {} };
  let message = `Marked “${OUTCOME_LABEL[outcome]}”.`;
  const styles = found.styles || [];
  if ((outcome === 'vibe' || outcome === 'great') && styles.length) {
    const delta = outcome === 'great' ? 1 : -1;
    visit.undo.styleWeights = {};
    for (const s of styles) {
      const before = state.prefs.styleWeights[s] || 0;
      visit.undo.styleWeights[s] = before;
      state.prefs.styleWeights[s] = Math.max(-3, Math.min(3, before + delta));
    }
    message += delta > 0 ? ' Similar shops will rank higher.' : ' Similar shops will rank lower.';
  }
  if (outcome === 'pricey' && found.price) {
    visit.undo.priceCap = state.prefs.priceCap;
    state.prefs.priceCap = Math.max(1, found.price - 1);
    message += ` ${priceLabel(found.price)}+ shops will rank lower.`;
  }
  if (outcome === 'bought' && hunt) {
    hunt.done = true;
    visit.undo.huntId = hunt.id;
    state.hunt.activeId = state.hunt.items.find((i) => !i.done)?.id || null;
    app.categories = parseQuery(activeHunt()?.text || '');
    message = `Nice! Crossed off “${hunt.text}”.`;
  }
  state.visits.push(visit);
  save();
  toast(message);
  render();
  refreshSheet();
}

function undoVisit(id) {
  const index = state.visits.findLastIndex((v) => v.id === id);
  if (index < 0) return;
  const [visit] = state.visits.splice(index, 1);
  const undo = visit.undo || {};
  if (undo.styleWeights) Object.assign(state.prefs.styleWeights, undo.styleWeights);
  if ('priceCap' in undo) state.prefs.priceCap = undo.priceCap;
  if (undo.huntId) {
    const item = state.hunt.items.find((i) => i.id === undo.huntId);
    if (item) {
      item.done = false;
      state.hunt.activeId = item.id;
      app.categories = parseQuery(item.text);
    }
  }
  save();
  render();
  refreshSheet();
}

// ------------------------------------------------------------------ screenshots

function onShotChosen(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  const id = app.shotTarget;
  if (!file || !id) return;
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(img.src);
    if (saveShot(id, canvas.toDataURL('image/jpeg', 0.72))) {
      toast('Screenshot saved on this phone.');
      refreshSheet();
    } else {
      toast('Not enough space on this phone to save that. Remove an older screenshot first.');
    }
  };
  img.onerror = () => toast('Couldn\'t read that image.');
  img.src = URL.createObjectURL(file);
}

function viewShot(id) {
  const src = loadShot(id);
  if (!src) return;
  const el = $('#checkout');
  el.innerHTML = `<div class="checkout-panel">
    <button type="button" class="icon-btn checkout-close" data-close-checkout aria-label="Close">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
    </button>
    <h2 id="checkout-title" class="sr-only">Saved screenshot</h2>
    <img class="shot-full" src="${h(src)}" alt="Saved screenshot">
  </div>`;
  el.hidden = false;
}

// ------------------------------------------------------------------ links in

function applyHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (!params.toString()) return;
  const areaId = params.get('area');
  if (areaId && app.areaById.has(areaId)) setOriginToArea(app.areaById.get(areaId));
  const id = params.get('s');
  const ll = (params.get('ll') || '').split(',').map(Number);
  const name = params.get('n') || 'Shared pin';
  if (id && findById(id)) {
    openById(id);
  } else if (ll.length === 2 && ll.every(Number.isFinite)) {
    app.pin = { lat: ll[0], lon: ll[1], name };
    app.map.setPin(app.pin);
    app.map.focus(ll[0], ll[1], 17);
    toast(`Showing “${name}” from a shared link.`);
    if (id) liveSearch(boxAround(ll, 250)).then(() => findById(id) && openById(id));
  }
  history.replaceState(null, '', location.pathname + location.search);
}

// ------------------------------------------------------------------ toast

let toastTimer;
function toast(message, ms = 3500) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, ms);
}
