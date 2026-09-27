// Everything the app remembers lives in this browser only (localStorage).
// Reads and writes never throw: private mode or a full quota just means nothing is saved.

const KEY = 'nextstop:v1';
const SHOT_PREFIX = 'nextstop:shot:';

const DEFAULTS = {
  ui: {
    mode: 'browse',
    styles: [],
    budget: 0,
    offersOnly: false,
    sort: 'best',
    areaId: 'soho',
    useGps: false,
    mapHidden: false,
  },
  shortlist: {},
  visits: [],
  prefs: { styleWeights: {}, priceCap: null },
  hunt: { items: [], activeId: null },
  nextStop: null,
};

function merge(defaults, saved) {
  const out = structuredClone(defaults);
  if (!saved || typeof saved !== 'object') return out;
  for (const [k, v] of Object.entries(saved)) {
    if (k in out && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) && v && typeof v === 'object') {
      out[k] = { ...out[k], ...v };
    } else if (k in out) {
      out[k] = v;
    }
  }
  return out;
}

export function loadState() {
  try {
    return merge(DEFAULTS, JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function saveShot(id, dataUrl) {
  try {
    localStorage.setItem(SHOT_PREFIX + id, dataUrl);
    return true;
  } catch {
    return false;
  }
}

export function loadShot(id) {
  try {
    return localStorage.getItem(SHOT_PREFIX + id);
  } catch {
    return null;
  }
}

export function deleteShot(id) {
  try {
    localStorage.removeItem(SHOT_PREFIX + id);
  } catch {
    /* nothing to do */
  }
}

export function clearAll() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('nextstop:')) localStorage.removeItem(k);
  } catch {
    /* nothing to do */
  }
}
