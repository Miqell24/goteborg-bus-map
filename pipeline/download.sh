#!/usr/bin/env bash
# Downloads input data: the Västtrafik GTFS, OSM extracts (Geofabrik),
# MapLibre GL. Everything is cached — re-running only fetches what is missing.
#
# Göteborg: Trafiklab publishes Västtrafik's timetable as "GTFS Regional
# Västtrafik" — the detailed feed, the one with shapes — but only behind a free
# API key, which a build script cannot carry. The Mobility Database keeps a
# daily mirror of that same file as feed mdb-3248 and serves it openly, the
# same route Stockholm's SL feed takes here.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/gtfs data/osm/tiles web/vendor

# pyosmium does the cutting; it is the one dependency outside Node here.
need_osmium () {
  python3 -c "import osmium" 2>/dev/null && return 0
  echo "brak pakietu osmium — zainstaluj: pip3 install --user osmium" >&2
  return 1
}

# 1) GTFS — Västtrafik through the Mobility Database mirror
if [ ! -f data/gtfs/routes.txt ]; then
  echo "== Västtrafik GTFS (Västra Götaland) =="
  curl -fL --retry 3 --max-time 1800 -o data/vt-gtfs.zip "https://files.mobilitydatabase.org/mdb-3248/latest.zip"
  unzip -o data/vt-gtfs.zip -d data/gtfs
fi

# 1b) scope: which of the 611 regional lines belong on a GÖTEBORG map
if [ ! -f data/scope.json ]; then
  node --max-old-space-size=8192 pipeline/scope.mjs
fi

# 2) OSM — from the Geofabrik extracts, not Overpass.
#    Sweden has no Geofabrik sub-regions, so the country file is read and
#    clipped here. If stockholm-bus-map already has it, hard-link it instead:
#    `ln ../stockholm-bus-map/data/sweden-latest.osm.pbf data/`.
#    pipeline/pbf-tiles.py cuts the tiles out of the .pbf and writes exactly the
#    JSON shape Overpass would have returned (ways with tags, NODE IDS and
#    geometry — buildGraph silently drops ways without el.nodes).
if [ ! -f data/osm/tiles/t16.json ] || [ ! -f data/osm/goteborg-rail.json ]; then
  need_osmium
  if [ ! -f data/sweden-latest.osm.pbf ]; then
    echo "== Geofabrik sweden-latest.osm.pbf =="
    curl -fL --retry 5 --retry-delay 5 -C - --max-time 3600 -o data/sweden-latest.osm.pbf \
      "https://download.geofabrik.de/europe/sweden-latest.osm.pbf"
  fi
  echo "== cutting OSM tiles out of the extracts =="
  python3 pipeline/pbf-tiles.py
fi

# 3) MapLibre GL (vendored, no CDN at runtime)
if [ ! -f web/vendor/maplibre-gl.js ]; then
  echo "== MapLibre GL =="
  curl -fL --retry 3 -o web/vendor/maplibre-gl.js  https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js
  curl -fL --retry 3 -o web/vendor/maplibre-gl.css https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css
fi

echo "OK — data ready:"
du -sh data/gtfs data/osm 2>/dev/null || true
