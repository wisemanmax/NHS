// Offer bookkeeping: what's active today (New York date), and how to describe where it works.
import { NYC_TZ } from './hours.js';

/** Today's date in New York as YYYY-MM-DD. */
export function todayISO(date = new Date(), timeZone = NYC_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function isActive(offer, today) {
  if (offer.confidence === 'low') return false;
  if (offer.starts && offer.starts > today) return false;
  if (offer.ends && offer.ends < today) return false;
  return true;
}

export const activeOffers = (offers, today) => (offers || []).filter((o) => isActive(o, today));

export const CHANNEL = {
  'in-store': { label: 'In store (per source)', tone: 'ok' },
  both: { label: 'Online & in store (per source)', tone: 'ok' },
  online: { label: 'Online only (per source)', tone: 'warn' },
  unknown: { label: 'In store: not confirmed. Ask before you pay', tone: 'muted' },
};

export const channelInfo = (channel) => CHANNEL[channel] || CHANNEL.unknown;

/** 'today' | 'upcoming' | 'ended' for an event with YYYY-MM-DD starts/ends. */
export function eventTiming(event, today) {
  if (event.ends && event.ends < today) return 'ended';
  if (event.starts && event.starts > today) return 'upcoming';
  return 'today';
}
