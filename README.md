# Next Stop · NYC

**Which store deserves your next 20 minutes?** Next Stop is a mobile web app for shopping in New York. It shows the fashion stores near you, what they're known for, and current deals, and every deal carries its source link, the time it was checked, and whether the source says it works in store.

It's the "ship it today" version of the plan: a single link that works in Safari on iPhone, with a native SwiftUI app later.

## Use it today

1. Open the site: GitHub Pages serves `main`, at `https://wisemanmax.github.io/NHS/`.
2. In Safari, tap **Share → Add to Home Screen** so it opens like an app.
3. Tap **My location**, or pick a neighborhood. You don't have to share your location.
4. **Browse** ranks shops by distance and style fit. **Find something** ("black ankle boots", "denim jacket") puts shops whose catalogs carry the item first.
5. Tap **☆ Save** on about five stores. Your **Pocket** keeps their addresses, hours and offer terms on the phone, so they work with no signal.
6. Before you go, download Manhattan in **Apple Maps** (profile picture → Offline Maps). Every Directions button opens Apple Maps.

## What a store card shows

| Section | What it says | Basis shown |
|---|---|---|
| **Style fit** | "Worth checking for Denim" | Our brand notes, or OpenStreetMap tags / the shop's name for unresearched shops |
| **Selection** | What the brand's catalog carries, plus links to browse or search it | Always labelled "online catalog, not confirmed stock at this store". Call the store if it matters |
| **Deals** | Each offer's terms, exclusions, end date and in-store status | Source link, source type, and check time. "Online only" and "In store: not confirmed" are shown clearly |
| **Worth the detour?** | Extra distance vs. going straight to your chosen next stop | Straight-line estimate |
| **How did it go?** | Bought it · Wrong fit · Unavailable · Great selection · Not my vibe · Too pricey | Reorders what the app suggests next |

**Show at checkout** opens a high-contrast view with the code, what qualifies, exclusions, the end date and the source. **Share** sends a link that drops the store (or your "meet here" spot) on a friend's map.

## Honesty rules

- A deal without a source link and check time doesn't ship. `tests/data.test.js` enforces this.
- "Not researched" is different from "no deals", and the app says which one applies.
- The coverage line says what the list covers: "243 shops listed · 15 with offers found". It never says "checked".
- Distances are straight-line and labelled that way. Walking routes come from Apple Maps.
- Catalog matches are never presented as stock at a specific store.

## How the data works

```
OpenStreetMap ──(Overpass, daily GitHub Action)──▶ data/stores.json   shops in 8 neighborhoods
Deal research run ─────────────────────────────▶ data/deals.json    offers per brand, sourced
                                             └──▶ data/events.json   sample sales & store events
Brand notes ───────────────────────────────────▶ data/brands.json   style, price tier, catalog
                                                        │
The app joins them on the phone; outside the covered   ▼
neighborhoods, "Search this area" queries OpenStreetMap live.
```

- **`data/areas.json`**: neighborhood outlines. Add one and the next refresh lists its shops.
- **`scripts/build-stores.mjs`**: the morning run. `.github/workflows/refresh-stores.yml` runs it daily around 6:15 AM New York time, whenever the areas or events change, or on demand from the Actions tab. It also geocodes event addresses with Nominatim.
- **`data/deals.json`**: written by the research run. Each brand gets `checkedAt`, `offersPage`, `offers[]` (title, code, terms, exclusions, starts/ends, `channel`: in-store | online | both | unknown, `sourceUrl`, `sourceType`, `evidence`, `confidence`), plus `signup` and `notes`.
- **`data/brands.json`**: about 270 brands, matched to shops by OpenStreetMap `brand:wikidata`, then brand tag, then name.

The Sep 27 research run hit its web-search limit, so department stores, Madewell, J.Crew, Gap, Levi's, Aritzia, COS and others show "not researched".

### Refreshing deals (optional, costs money)

`scripts/research-deals.mjs` is the deal agent. Claude (`claude-opus-5`, web search + web fetch) researches each brand, then records its findings through a strict JSON tool. An offer is kept only if its source page was actually retrieved during the run and it hasn't ended. Refused requests re-run on Anthropic's recommended fallback model (`fallbacks: "default"`).

1. Add an `ANTHROPIC_API_KEY` repository secret (Settings → Secrets and variables → Actions).
2. Go to **Actions → Research deals → Run workflow**. You can do this from the GitHub mobile app. Leave "brands" empty to pick up to 40 brands with shops on the map, luxury last, skipping ones checked in the last 20 hours. Or list ids such as `madewell,jcrew,gap,levis,aritzia,cos`.
3. It also looks for this week's NYC sample sales, geocodes them, commits, and Pages redeploys.

Expect roughly $0.20–0.40 per brand at list prices. The run summary prints searches, tokens and an estimate. It only runs when you trigger it.

## Develop

```bash
npm test          # unit + data tests (Node 20+, no dependencies)
npm start         # serves the app at http://localhost:8080
npm run build:stores   # rebuild data/stores.json from OpenStreetMap (needs internet)
npm ci && ANTHROPIC_API_KEY=… node scripts/research-deals.mjs --brands=madewell --dry-run   # try the deal agent
```

No build step. It's plain ES modules. Leaflet is vendored in `vendor/leaflet`, and `sw.js` caches the app and data for offline use.

```
index.html, app.css, sw.js, manifest.webmanifest
js/app.js       controller: data loading, location, rendering, actions
js/views.js     HTML for rows, store/event cards, checkout, pocket
js/rank.js      Browse / Find ranking and list sections
js/brands.js    brand matching and OSM-tag inference
js/hours.js     opening_hours parser ("Closes in 35 min")
js/osm.js       Overpass queries and OSM normalization (shared with the build script)
js/map.js, js/overpass.js, js/geo.js, js/deals.js, js/format.js, js/state.js
```

## Next

- A per-store **re-check** button that re-runs the deal agent for one brand and shows what changed since the morning run.
- Native SwiftUI app: background location and **walk-by nudges** via region monitoring.
- Route planner, fitting-room memory, shared live pins for groups.

## Credits

Shop data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL); `data/stores.json` is an ODbL extract. Map tiles © [CARTO](https://carto.com/attributions). [Leaflet](https://leafletjs.com) (BSD-2-Clause, see `vendor/leaflet/LICENSE`).
