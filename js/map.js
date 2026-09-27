// Thin wrapper around Leaflet (loaded globally from vendor/leaflet).
// Leaflet treats tooltip strings as HTML, so names from OSM or share links are escaped.
import { escapeHtml } from './format.js';

const L = window.L;

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function createMap(el, { onSelect, onViewChange }) {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const colors = {
    offer: cssVar('--accent') || '#d9480f',
    researched: cssVar('--ink') || '#1b1a17',
    plain: cssVar('--muted-2') || '#a8a29a',
    ring: cssVar('--surface') || '#ffffff',
    saved: cssVar('--gold') || '#c99a06',
    area: cssVar('--accent') || '#d9480f',
    me: cssVar('--me') || '#2563eb',
  };

  const map = L.map(el, { zoomControl: false, preferCanvas: true, attributionControl: true }).setView(
    [40.7233, -73.9993],
    15,
  );
  L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, {
    subdomains: 'abcd',
    maxZoom: 20,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  const areaLayer = L.layerGroup().addTo(map);
  const storeLayer = L.layerGroup().addTo(map);
  const eventLayer = L.layerGroup().addTo(map);
  const pinLayer = L.layerGroup().addTo(map);
  const meLayer = L.layerGroup().addTo(map);

  const syncZoomClass = () => el.classList.toggle('zoomed-out', map.getZoom() <= 14);
  map.on('zoomend', syncZoomClass);
  map.on('moveend', () => onViewChange?.(map.getZoom()));
  syncZoomClass();

  return {
    leaflet: map,

    setAreas(areas, labelFor) {
      areaLayer.clearLayers();
      for (const a of areas) {
        L.polygon(a.polygon, {
          color: colors.area,
          weight: 1.5,
          opacity: 0.55,
          dashArray: '4 6',
          fillOpacity: 0.035,
          interactive: false,
        }).addTo(areaLayer);
        L.tooltip({ permanent: true, direction: 'center', className: 'area-label', interactive: false })
          .setLatLng(a.center)
          .setContent(labelFor(a))
          .addTo(areaLayer);
      }
    },

    /** items: [{ id, lat, lon, name, hasOffer, researched, saved }] */
    setStores(items, selectedId) {
      storeLayer.clearLayers();
      for (const it of items) {
        const selected = it.id === selectedId;
        const fill = it.hasOffer || it.onlineOffer ? colors.offer : it.researched ? colors.researched : colors.plain;
        const marker = L.circleMarker([it.lat, it.lon], {
          radius: selected ? 10 : it.hasOffer ? 7 : it.researched ? 6 : 4.5,
          color: it.saved ? colors.saved : colors.ring,
          weight: it.saved ? 3 : selected ? 3 : 1.5,
          fillColor: fill,
          fillOpacity: it.onlineOffer ? 0.45 : it.researched || it.hasOffer ? 0.95 : 0.75,
        });
        marker.bindTooltip(escapeHtml(it.name), { direction: 'top', offset: [0, -6] });
        marker.on('click', () => onSelect?.(it.id));
        marker.addTo(storeLayer);
      }
    },

    setEvents(events) {
      eventLayer.clearLayers();
      for (const ev of events) {
        if (ev.lat == null) continue;
        L.marker([ev.lat, ev.lon], {
          icon: L.divIcon({ className: 'event-pin', html: '<span>★</span>', iconSize: [28, 28], iconAnchor: [14, 14] }),
          title: ev.name,
          keyboard: false,
        })
          .on('click', () => onSelect?.(ev.id))
          .addTo(eventLayer);
      }
    },

    setMe(position) {
      meLayer.clearLayers();
      if (!position) return;
      const ll = [position.lat, position.lon];
      if (position.accuracy && position.accuracy < 800) {
        L.circle(ll, { radius: position.accuracy, color: colors.me, weight: 1, opacity: 0.4, fillOpacity: 0.08, interactive: false }).addTo(meLayer);
      }
      L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2.5, fillColor: colors.me, fillOpacity: 1, interactive: false }).addTo(meLayer);
    },

    setPin(pin) {
      pinLayer.clearLayers();
      if (!pin) return;
      L.marker([pin.lat, pin.lon], {
        icon: L.divIcon({ className: 'shared-pin', html: '<span></span>', iconSize: [26, 34], iconAnchor: [13, 32] }),
        title: pin.name,
      })
        .bindTooltip(escapeHtml(pin.name), { permanent: true, direction: 'top', offset: [0, -30], className: 'pin-label' })
        .addTo(pinLayer);
    },

    focus(lat, lon, zoom) {
      map.setView([lat, lon], zoom ?? Math.max(map.getZoom(), 16), { animate: true });
    },

    bounds() {
      const b = map.getBounds();
      return [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
    },

    center() {
      const c = map.getCenter();
      return [c.lat, c.lng];
    },

    zoom: () => map.getZoom(),
    invalidate: () => map.invalidateSize(),
  };
}
