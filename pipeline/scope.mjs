// Wyznacza zakres mapy Göteborga z feedu Västtrafiku obejmującego CAŁE
// Västra Götaland (611 linii autobusowych od Strömstadu po Skövde, 24 000 km²)
// i zapisuje listy route_id do data/scope.json:
//
//  autobusy (route_type 700):
//   - linia należy do mapy, gdy >=50% jej przystanków leży w promieniu 25 km
//     od Brunnsparken — to zasięg zwartej aglomeracji: Mölndal, Partille,
//     Härryda, Lerum, Kungälv, Ale i Landvetter wchodzą, Borås (60 km),
//     Trollhättan (70 km) i Uddevalla (80 km) już nie;
//   - odpada linia z przystankiem dalej niż 45 km, żeby jeden kurs do
//     Alingsås nie rozciągał kadru na pół regionu.
//  tramwaje (900): ta sama reguła promienia — cała sieć i tak mieści się
//   w 12 km od centrum.
//  poza mapą:
//   - kolej (100): feed nazywa KAŻDY pociąg „TÅG" i nie daje numerów linii
//     (Västtågen, Öresundståg, SJ Regional) — nie ma czego podpisać, więc
//     regionalne pociągi zostają poza mapą, inaczej niż sztokholmski
//     pendeltåg z numerami 40–48;
//   - Närtrafiken (1501): kursy na telefon, mają numer, ale nie mają trasy;
//   - promy (1000): Älvsnabben i archipelag Styrsöbolaget — silnik nie ma
//     grafu wodnego (ta sama decyzja co przy promach w Kopenhadze i Stambule).
//
// Uruchamiane przez download.sh po pobraniu GTFS; build.mjs wymaga wyniku.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { iterCsv, readCsv } from './lib/csv.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GD = join(ROOT, 'data/gtfs');

const CX = 11.9676, CY = 57.7075;          // Brunnsparken
const CORE_KM = 25, CORE_SHARE = 0.5, CAP_KM = 45;

const t0 = Date.now();
const log = (m) => console.log(`[scope ${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);

const candidates = new Map();   // route_id → 'bus' | 'tram'
for (const r of await readCsv(join(GD, 'routes.txt'))) {
  if (r.route_type === '700') candidates.set(r.route_id, 'bus');
  else if (r.route_type === '900') candidates.set(r.route_id, 'tram');
}
log(`kandydatów: ${[...candidates.values()].filter((v) => v === 'bus').length} bus, `
  + `${[...candidates.values()].filter((v) => v === 'tram').length} tram`);

const mx = 111320 * Math.cos(CY * Math.PI / 180), my = 111132;
const stopKm = new Map();
for await (const s of iterCsv(join(GD, 'stops.txt'))) {
  const lat = Number(s.stop_lat), lon = Number(s.stop_lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    stopKm.set(s.stop_id, Math.hypot((lon - CX) * mx, (lat - CY) * my) / 1000);
  }
}
const t2r = new Map();
for await (const t of iterCsv(join(GD, 'trips.txt'))) {
  if (candidates.has(t.route_id)) t2r.set(t.trip_id, t.route_id);
}
log(`kursów do zmierzenia: ${t2r.size}`);

const rStops = new Map();
for await (const st of iterCsv(join(GD, 'stop_times.txt'))) {
  const rid = t2r.get(st.trip_id);
  if (!rid) continue;
  let s = rStops.get(rid);
  if (!s) rStops.set(rid, (s = new Set()));
  s.add(st.stop_id);
}
log(`tras z przystankami: ${rStops.size}`);

const out = { bus: [], tram: [], busKey: {} };
const cut = { bus: 0, tram: 0 };
for (const [rid, stops] of rStops) {
  const kind = candidates.get(rid);
  let n = 0, inside = 0, max = 0;
  for (const sid of stops) {
    const d = stopKm.get(sid);
    if (d === undefined) continue;
    n++; if (d <= CORE_KM) inside++; if (d > max) max = d;
  }
  if (!n) continue;
  if (inside / n < CORE_SHARE) continue;
  if (max > CAP_KM) { cut[kind]++; continue; }
  out[kind].push(rid);
}
out.bus.sort(); out.tram.sort();
log(`wybrano: bus ${out.bus.length} (odrzucone limitem: ${cut.bus}), `
  + `tram ${out.tram.length} (${cut.tram})`);

// ---------- numery powtórzone w kilku miastach ----------
// Västtrafik numeruje lokalną sieć KAŻDEJ gminy od 1, więc w kadrze są cztery
// różne „jedynki": Kungälv, Öckerö, Mölnlycke i Kungsbacka. Nie mają wspólnej
// jezdni, więc na ulicy nic nie drukuje się dwa razy — ale w jednym pliku
// muszą mieć różne KLUCZE, inaczej silnik sklei je w jedną linię skaczącą po
// całym regionie. Klucz dostaje przedrostek gminy (Göteborg, jako sieć
// główna, nie dostaje żadnego), a build.mjs drukuje goły numer przez LBL —
// zasada z Rybnika (powiatowe „W"). Reguła jest samoobsługowa: jeśli feed
// doda kolejną kolizję, przedrostek pojawi się sam.
const TOWNS = [
  ['', 57.708, 11.968],      // Göteborg — sieć główna, klucz bez przedrostka
  ['KV', 57.870, 11.974],    // Kungälv
  ['OC', 57.711, 11.653],    // Öckerö
  ['HA', 57.659, 12.117],    // Mölnlycke (Härryda)
  ['KB', 57.487, 12.076],    // Kungsbacka
  ['PA', 57.740, 12.107],    // Partille
  ['LE', 57.770, 12.269],    // Lerum
  ['AL', 57.895, 12.055],    // Nödinge (Ale)
  ['ST', 58.070, 11.818],    // Stenungsund
  ['MO', 57.655, 12.013],    // Mölndal
  ['LV', 57.685, 12.216],    // Landvetter
];
const shortName = new Map();
for (const r of await readCsv(join(GD, 'routes.txt'))) shortName.set(r.route_id, (r.route_short_name || '').trim());
const stopPos = new Map();
for await (const s of iterCsv(join(GD, 'stops.txt'))) {
  const lat = Number(s.stop_lat), lon = Number(s.stop_lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) stopPos.set(s.stop_id, [lat, lon]);
}
const byName = new Map();
for (const rid of out.bus) {
  const sn = shortName.get(rid);
  let a = byName.get(sn);
  if (!a) byName.set(sn, (a = []));
  a.push(rid);
}
let prefixed = 0;
for (const [sn, rids] of byName) {
  if (rids.length < 2) continue;
  for (const rid of rids) {
    let n = 0, la = 0, lo = 0;
    for (const sid of rStops.get(rid)) {
      const p = stopPos.get(sid);
      if (p) { n++; la += p[0]; lo += p[1]; }
    }
    if (!n) continue;
    la /= n; lo /= n;
    let best = TOWNS[0], bd = Infinity;
    for (const t of TOWNS) {
      const d = Math.hypot((t[1] - la) * my, (t[2] - lo) * mx);
      if (d < bd) { bd = d; best = t; }
    }
    if (best[0]) { out.busKey[rid] = best[0] + sn; prefixed++; }
  }
}
log(`kluczy z przedrostkiem gminy: ${prefixed} (numery powtórzone: `
  + `${[...byName].filter(([, a]) => a.length > 1).map(([k]) => k).sort().join(', ')})`);

writeFileSync(join(ROOT, 'data/scope.json'), JSON.stringify(out, null, 0));
log('zapisano data/scope.json');
