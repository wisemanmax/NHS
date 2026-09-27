import { NYC_TZ } from './hours.js';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/** Only http(s) links make it into an href. */
export function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

export const priceLabel = (tier) => (tier ? '$'.repeat(tier) : null);

const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: NYC_TZ,
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "Sep 27, 9:05 AM", with an age hint once it's more than a day old. */
export function formatCheckedAt(iso, now = new Date()) {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  const hours = (now - when) / 36e5;
  const base = timeFmt.format(when);
  if (hours < 36) return base;
  return `${base} (${Math.round(hours / 24)} days ago)`;
}

/** "Sun, Sep 27" for a YYYY-MM-DD calendar date. */
export function formatDay(isoDate) {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

export const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\d?\./, '');
  } catch {
    return url;
  }
};

/** Digits-and-plus phone string for tel: links. */
export const telHref = (phone) => `tel:${String(phone).split(';')[0].replace(/[^+\d]/g, '')}`;
