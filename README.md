# Göteborg Public Transport — interactive map

Interactive, poster-grade map of the public transport network of **Göteborg and
its kommuner**: Västtrafik's buses and Sweden's largest tram network — lines
1–13 and the works-period X — drawn along the real street and track geometry.

## Live

Local build on port 8165 (`npm run serve`).

Everything comes from ONE feed — **Trafiklab's GTFS Regional Västtrafik**, the
detailed one with shapes. Trafiklab serves it only behind a free API key, which
a build script cannot carry, so the download takes the **Mobility Database's**
open daily mirror of the same file
(`files.mobilitydatabase.org/mdb-3248/latest.zip`), the same route Stockholm's
SL feed takes here.

The feed covers all of Västra Götaland, 611 bus lines from Strömstad to Skövde
over 24 000 km², so the map's scope is a precomputed allowlist
(`pipeline/scope.mjs` → `data/scope.json`):

| mode | route_type | scope | graph |
|---|---|---|---|
| buses | 700 | ≥50% of stops within 25 km of Brunnsparken, no stop past 45 km | OSM roadways |
| trams | 900 | the whole network — it fits inside 12 km | `railway=tram` + `light_rail` |

Mölndal, Partille, Härryda, Lerum, Kungälv, Ale, Öckerö, Landvetter and
Kungsbacka are in; Borås (60 km), Trollhättan (70) and Uddevalla (80) are out.

Cut deliberately:

* **the regional trains** (route_type 100). The feed calls every one of them
  "TÅG" and gives it no line number — Västtågen, Öresundståg, SJ Regional all
  share the same short name — so unlike Stockholm's numbered pendeltåg there is
  nothing to draw and nothing to label;
* **Närtrafiken** (1501), dial-a-ride with numbers but no fixed run;
* **the ferries** (1000) — Älvsnabben and the Styrsö archipelago; the engine
  has no water graph, the same call Copenhagen's harbour buses got.

**Line keys.** Västtrafik numbers each municipality's local network from 1, so
four different "1" run inside the frame — Kungälv, Öckerö, Mölnlycke and
Kungsbacka — and the same for 2, 3 and 21. They share no roadway, so nothing
prints twice on any street, but in one file they need different keys or the
engine welds them into a single line hopping across the region. `scope.mjs`
gives them a town prefix in the KEY (`KV1`, `OC1`, `HA1`, `KB1`; Göteborg, the
main network, keeps bare keys) and `build.mjs` prints the street's own number
through `LBL` — the Rybnik rule, where the county's W never reaches the
pavement. The rule is self-maintaining: a new collision picks up its town's
prefix from the route's own stop centroid.

Västtrafik also brands every works-period tram "X", and in this timetable two
of them run at once. They get keys `X` and `X#2` — the hash because a plain
`X2` is a real Västtrafik express bus, which promptly inherited the tram's
printed label — and both still print the single letter the stop flag shows.

## Pipeline

`npm run download` fetches the Västtrafik feed, computes the scope, and cuts
the OSM extracts. **The OSM data comes from Geofabrik, not Overpass** — Sweden
has no sub-regions there, so `pipeline/pbf-tiles.py` (needs `pip3 install
--user osmium`) reads the 815 MB country file and clips a 4 × 4 road grid plus
the tram layer out of it, writing exactly the JSON shape Overpass would have
returned, node ids included. If `stockholm-bus-map` already has the file, hard-
link it: `ln ../stockholm-bus-map/data/sweden-latest.osm.pbf data/`.

`npm run build` map-matches every line (HMM/Viterbi on the OSM graphs) and
writes GeoJSON to `data/out/`; `npm run lines` adds the line-by-line view.
`npm run serve` hosts the map at <http://localhost:8165>.

Data: Trafiklab / Västtrafik (CC0) ·
base map © OpenFreeMap / OpenMapTiles / OpenStreetMap contributors.
