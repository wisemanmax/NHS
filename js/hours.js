// A deliberately small parser for OpenStreetMap `opening_hours` strings.
// It understands the patterns shops actually use ("Mo-Sa 10:00-20:00; Su 11:00-19:00",
// "10:00-21:00", "24/7", "Su off") and skips anything fancier (holidays, month ranges),
// flagging the result as partial. Unparseable strings return null so the UI can show
// the raw text instead of guessing.

export const NYC_TZ = 'America/New_York';

// Index matches Date#getDay(): 0 = Sunday.
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY = '(?:Mo|Tu|We|Th|Fr|Sa|Su)';
const DAY_ITEM = `(?:${DAY}|PH)(?:\\s*-\\s*${DAY})?`;
const RULE_RE = new RegExp(`^(${DAY_ITEM}(?:\\s*,\\s*${DAY_ITEM})*)?\\s*(.*)$`);
const TIME_RANGE_RE = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\+?$/;

export function parseOpeningHours(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let text = raw.trim();
  if (text === '24/7') {
    return { week: DAYS.map(() => [[0, 1440]]), always: true, partial: false, raw };
  }
  // "Mo-Sa 10:00-20:00, Su 11:00-19:00" uses a comma where the spec wants ";".
  text = text.replace(/(\d)\s*,\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/g, '$1;');

  const week = DAYS.map(() => null);
  let partial = false;
  let matchedAny = false;

  for (const rawRule of text.split(/\s*(?:;|\|\|)\s*/)) {
    const rule = rawRule.trim();
    if (!rule) continue;
    const m = rule.match(RULE_RE);
    const daysPart = m[1];
    const timePart = m[2].trim();

    let days;
    if (daysPart) {
      days = new Set();
      for (const seg of daysPart.split(/\s*,\s*/)) {
        if (seg === 'PH') continue; // public holidays: we don't know the calendar
        const [from, to] = seg.split(/\s*-\s*/);
        const start = DAYS.indexOf(from);
        const end = to ? DAYS.indexOf(to) : start;
        let i = start;
        days.add(i);
        while (i !== end) {
          i = (i + 1) % 7;
          days.add(i);
        }
      }
      if (days.size === 0) continue; // a PH-only rule
    } else {
      days = new Set([0, 1, 2, 3, 4, 5, 6]);
    }

    let intervals = [];
    if (!/^(off|closed)$/i.test(timePart)) {
      for (const range of timePart.split(/\s*,\s*/)) {
        const t = range.match(TIME_RANGE_RE);
        if (!t) {
          intervals = null;
          break;
        }
        const start = Number(t[1]) * 60 + Number(t[2]);
        let end = Number(t[3]) * 60 + Number(t[4]);
        if (end <= start) end += 1440; // runs past midnight
        intervals.push([start, end]);
      }
    }
    if (!intervals) {
      partial = true; // e.g. "Dec 24 10:00-16:00" or "sunrise-sunset"
      continue;
    }
    // Later rules override earlier ones for the days they name (OSM semantics).
    for (const d of days) week[d] = intervals;
    matchedAny = true;
  }

  if (!matchedAny) return null;
  return { week, always: false, partial, raw };
}

/** Day of week (0 = Sunday) and minutes since midnight in the given time zone. */
export function zonedClock(date = new Date(), timeZone = NYC_TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
}

/**
 * Open/closed state at `date`.
 * → { state: 'open', closesIn, closesAt } | { state: 'closed', opensAt, opensInDays, opensDay } | { state: 'unknown' }
 * Days an opening_hours string doesn't mention count as closed, per the OSM spec.
 */
export function openStatus(parsed, date = new Date(), timeZone = NYC_TZ) {
  if (!parsed) return { state: 'unknown' };
  const { day, minutes } = zonedClock(date, timeZone);
  if (parsed.always) return { state: 'open', always: true, closesIn: Infinity, closesAt: null };

  const yesterday = (day + 6) % 7;
  const current = [];
  for (const [s, e] of parsed.week[yesterday] || []) if (e > 1440) current.push([s - 1440, e - 1440]);
  for (const iv of parsed.week[day] || []) current.push(iv);
  for (const [s, e] of current) {
    if (minutes >= s && minutes < e) return { state: 'open', closesIn: e - minutes, closesAt: e % 1440 };
  }

  for (let offset = 0; offset < 8; offset++) {
    const d = (day + offset) % 7;
    const starts = (parsed.week[d] || []).map(([s]) => s).sort((a, b) => a - b);
    for (const s of starts) {
      if (offset === 0 && s <= minutes) continue;
      return { state: 'closed', opensAt: s, opensInDays: offset, opensDay: d };
    }
  }
  return { state: 'closed', opensAt: null };
}

export function formatClock(minutesOfDay) {
  const m = ((minutesOfDay % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return min ? `${h12}:${String(min).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Short human label plus a tone the UI can color: 'urgent' | 'ok' | 'muted'. */
export function statusLabel(status) {
  if (!status || status.state === 'unknown') return null;
  if (status.state === 'open') {
    if (status.always) return { text: 'Open 24 hours', tone: 'ok' };
    if (status.closesIn <= 60) return { text: `Closes in ${status.closesIn} min`, tone: 'urgent' };
    return { text: `Open until ${formatClock(status.closesAt)}`, tone: 'ok' };
  }
  if (status.opensAt == null) return { text: 'Closed', tone: 'muted' };
  const when =
    status.opensInDays === 0
      ? formatClock(status.opensAt)
      : status.opensInDays === 1
        ? `tomorrow ${formatClock(status.opensAt)}`
        : `${DAY_NAMES[status.opensDay]} ${formatClock(status.opensAt)}`;
  return { text: `Closed · opens ${when}`, tone: 'muted' };
}
