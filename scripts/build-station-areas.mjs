// npm run station-areas: 기차역 둘레를 기차 3D 보기의 역사(역 건물)·승강장 자료로 만든다(data/build/station-areas.json).
//
// 원본(받는 곳은 scripts/sources.mjs, npm run fetch): OpenStreetMap 기차역 둘레(data/raw/osm/station-areas-1~20.json, 8역씩)
//  - 역 건물: building=train_station, 역(railway·public_transport=station) 표시가 있는 건물, 이름이 "○○역"인 건물
//  - 승강장: railway=platform, public_transport=platform + train=yes(지하철·경전철 승강장은 뺀다)
//  - 승강장 지붕: building=roof 가운데 승강장에 걸치는 것
//  - 건너는 다리: 다리 표시가 있는 걷는 길 가운데 선로를 가로지르는 것
//  - 역 안 선로: railway=rail(역 가운데에서 300m 안으로 자른다)
// 좌표는 역 자리(data/build/rail.json, UTM 52N)를 원점으로 한 미터다: x는 동쪽, y는 남쪽(격자와 같은 방향).
// 층수·높이·지붕 모양 같은 값은 OSM 태그에 있을 때만 넣는다(없으면 3D 보기에서 어림하고 그렇게 적는다).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { utm52 } from './lib/utm.mjs';
import { LEGACY_IDS } from './sources.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rail = JSON.parse(readFileSync(resolve(ROOT, 'data/build/rail.json'), 'utf8'));
const grid = JSON.parse(readFileSync(resolve(ROOT, 'data/build/grid.json'), 'utf8'));
const facts = JSON.parse(readFileSync(resolve(ROOT, 'data/facts.json'), 'utf8'));
/** 주요 역의 겉모습 특징(사진·위키백과에서 본 것, data/facts.json stationLooks). 역 이름 → 특징 */
const stationLooks = facts.stationLooks ?? {};

// 묶음을 합친다(같은 요소는 한 번만)
const elements = new Map();
const fetched = [];
/** 아직 받지 않은 묶음(그 역들은 자료 없이 만든 모양으로 그린다) */
const missing = [];
// 역 하나씩 받은 파일(data/raw/osm/station-areas/<역 id>.json). 처음 8역은 묶음(station-areas-1.json)으로 받아 두었다.
const dir = resolve(ROOT, 'data/raw/osm/station-areas');
const files = [];
const legacy = resolve(ROOT, 'data/raw/osm/station-areas-1.json');
if (existsSync(legacy)) files.push(legacy);
for (const st of rail.stations) {
  const path = resolve(dir, `${st.id}.json`);
  if (existsSync(path)) files.push(path);
  else missing.push(st.name);
}
for (const path of files) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  fetched.push(data.osm3s?.timestamp_osm_base ?? null);
  for (const e of data.elements) elements.set(`${e.type}/${e.id}`, e);
}

const round1 = (v) => Math.round(v * 10) / 10;
const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null;
};

/** 요소의 고리(닫힌 선)나 선을 경위도 목록으로. 다각형 관계는 바깥 고리만(구멍은 holes). */
function shapesOf(e) {
  // 역 하나씩 받은 파일은 네모 밖 점이 null이다(out geom(네모)). 빈 점은 건너뛴다.
  if (e.type === 'way' && e.geometry) return [{ outer: e.geometry.filter(Boolean).map((g) => [g.lon, g.lat]), holes: [] }];
  if (e.type === 'relation' && e.members) {
    // 바깥 고리 조각을 이어 붙인다(관계의 way들은 순서·방향이 섞여 있을 수 있다)
    const join = (role) => {
      const parts = e.members.filter((m) => m.type === 'way' && m.geometry && (m.role || 'outer') === role).map((m) => m.geometry.filter(Boolean).map((g) => [g.lon, g.lat])).filter((q) => q.length >= 2);
      const rings = [];
      while (parts.length) {
        let ring = parts.shift();
        let grew = true;
        while (grew && (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) {
          grew = false;
          for (let k = 0; k < parts.length; k++) {
            const p = parts[k];
            const end = ring.at(-1);
            const same = (a, b) => a[0] === b[0] && a[1] === b[1];
            if (same(p[0], end)) ring = [...ring, ...p.slice(1)];
            else if (same(p.at(-1), end)) ring = [...ring, ...p.slice(0, -1).reverse()];
            else continue;
            parts.splice(k, 1);
            grew = true;
            break;
          }
        }
        rings.push(ring);
      }
      return rings;
    };
    const holes = join('inner');
    return join('outer').map((outer) => ({ outer, holes }));
  }
  return [];
}

/** 넓이(제곱미터, 부호 없음) */
function areaOf(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
}
/** 점이 고리 안에 있는가 */
function inside([x, y], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
/** 두 선분이 만나는가 */
function cross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
const linesCross = (p, q) => {
  for (let i = 1; i < p.length; i++) for (let j = 1; j < q.length; j++) if (cross(p[i - 1], p[i], q[j - 1], q[j])) return true;
  return false;
};
/** 점에서 선(점 목록)까지 가장 가까운 거리 */
function distToLine([x, y], line) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1];
    const [bx, by] = line[i];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

// 역마다 원점(UTM)
const stationOrigin = rail.stations.map((st) => {
  const [e, n] = utm52.forward(st.lon, st.lat);
  return { st, e, n };
});
/** 경위도 → 역 기준 미터 [동, 남] */
const localOf = (o) => ([lon, lat]) => {
  const [e, n] = utm52.forward(lon, lat);
  return [round1(e - o.e), round1(o.n - n)];
};
/** 요소의 가운데에서 가장 가까운 역 */
function nearestStation(e) {
  const pts = shapesOf(e).flatMap((s) => s.outer);
  if (!pts.length) return null;
  const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const [ex, nx] = utm52.forward(lon, lat);
  let best = null;
  for (const o of stationOrigin) {
    const d = Math.hypot(ex - o.e, nx - o.n);
    if (!best || d < best.d) best = { o, d };
  }
  return best;
}

const isTrue = (v) => v === 'yes' || v === 'true' || v === '1';
const baseName = (s) => String(s ?? '').replace(/\s+/g, '').replace(/[()]/g, '');
const out = {};
for (const o of stationOrigin) {
  // 역 원점의 격자 좌표(km, rail.json의 x, y는 10m로 반올림돼 있어 다시 셈한다)
  const origin = [Number(((o.e - grid.origin.easting) / 1000).toFixed(5)), Number(((grid.origin.northing - o.n) / 1000).toFixed(5))];
  const lookFact = stationLooks[o.st.name];
  out[o.st.id] = {
    name: o.st.name,
    origin,
    look: lookFact ? { ...lookFact.value, source: lookFact.source } : null,
    buildings: [],
    platforms: [],
    roofs: [],
    bridges: [],
    tracks: [],
  };
}

// 1) 역 안 선로(다른 것을 고를 때 쓴다): 역마다 300m 안
const railWays = [...elements.values()].filter((e) => e.type === 'way' && e.tags?.railway === 'rail' && e.geometry);
for (const o of stationOrigin) {
  const loc = localOf(o);
  for (const w of railWays) {
    // 빈 점(null)에서 끊어 토막으로
    const pieces = [];
    let cur = [];
    for (const g of w.geometry) {
      if (!g) {
        if (cur.length >= 2) pieces.push(cur);
        cur = [];
      } else cur.push(loc([g.lon, g.lat]));
    }
    if (cur.length >= 2) pieces.push(cur);
    for (const line of pieces) {
    // 300m 안의 토막만(앞뒤로 한 점씩 더 남겨 선이 끊기지 않게)
    const keep = line.map((p) => Math.hypot(p[0], p[1]) <= 300);
    const cut = line.filter((_, i) => keep[i] || keep[i - 1] || keep[i + 1]);
    if (cut.length < 2) continue;
    out[o.st.id].tracks.push({
      line: cut,
      service: w.tags.service ?? null,
      tunnel: isTrue(w.tags.tunnel) || w.tags.tunnel === 'building_passage',
      bridge: isTrue(w.tags.bridge) || w.tags.bridge === 'viaduct',
      usage: w.tags.usage ?? null,
    });
    }
  }
}

// 2) 나머지: 가장 가까운 역 하나에만 넣는다
for (const e of elements.values()) {
  const t = e.tags ?? {};
  if (t.railway === 'rail') continue;
  const near = nearestStation(e);
  if (!near || near.d > 460) continue;
  const o = near.o;
  const st = out[o.st.id];
  const loc = localOf(o);
  const shapes = shapesOf(e).map((s) => ({ outer: s.outer.map(loc), holes: s.holes.map((h) => h.map(loc)) }));
  if (!shapes.length) continue;
  const closed = (r) => r.length > 3 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1];
  const stationWord = `${baseName(o.st.name)}역`;
  const isStationBuilding =
    t.building &&
    t.building !== 'roof' &&
    (t.building === 'train_station' || t.railway === 'station' || t.public_transport === 'station' || baseName(t.name).includes(stationWord));
  if (isStationBuilding) {
    for (const s of shapes) {
      if (!closed(s.outer)) continue;
      st.buildings.push({
        osm: `${e.type}/${e.id}`,
        name: t.name ?? null,
        ring: s.outer.slice(0, -1),
        holes: s.holes.filter(closed).map((h) => h.slice(0, -1)),
        area: Math.round(areaOf(s.outer)),
        levels: num(t['building:levels']),
        height: num(t.height),
        minHeight: num(t.min_height),
        minLevel: num(t['building:min_level']),
        roof: t['roof:shape'] ?? null,
        roofHeight: num(t['roof:height']),
        roofColour: t['roof:colour'] ?? null,
        colour: t['building:colour'] ?? null,
        material: t['building:material'] ?? t['facade:material'] ?? null,
        layer: num(t.layer),
        tagged: t.building,
      });
    }
    continue;
  }
  const isPlatform = t.railway === 'platform' || (t.public_transport === 'platform' && t.train === 'yes');
  if (isPlatform) {
    // 지하철·경전철 승강장은 뺀다
    if (t.subway === 'yes' || t.light_rail === 'yes' || t.monorail === 'yes' || t.station === 'subway') continue;
    for (const s of shapes) {
      const area = closed(s.outer);
      st.platforms.push({
        osm: `${e.type}/${e.id}`,
        ref: t.ref ?? t['local_ref'] ?? null,
        area,
        shape: area ? s.outer.slice(0, -1) : s.outer,
        width: num(t.width),
        covered: isTrue(t.covered) || isTrue(t.shelter),
        layer: num(t.layer),
        level: t.level ?? null,
      });
    }
    continue;
  }
  if (t.building === 'roof') {
    for (const s of shapes) if (closed(s.outer)) st.roofs.push({ osm: `${e.type}/${e.id}`, ring: s.outer.slice(0, -1), height: num(t.height), minHeight: num(t.min_height), layer: num(t.layer) });
    continue;
  }
  if (t.bridge && /^(footway|steps|corridor|path)$/.test(t.highway ?? '')) {
    for (const s of shapes) st.bridges.push({ osm: `${e.type}/${e.id}`, line: s.outer, width: num(t.width), covered: isTrue(t.covered) || t.highway === 'corridor', layer: num(t.layer) });
  }
}

// 3) 고르기: 지붕은 승강장에 걸치는 것만, 건너는 다리는 선로를 가로지르는 것만
const report = [];
for (const [id, st] of Object.entries(out)) {
  const platformPts = st.platforms.flatMap((p) => p.shape);
  st.roofs = st.roofs.filter((r) => platformPts.some((p) => inside(p, r.ring) || distToLine(p, [...r.ring, r.ring[0]]) < 6) || st.platforms.some((p) => p.area && r.ring.some((q) => inside(q, p.shape))));
  st.bridges = st.bridges.filter((b) => st.tracks.some((t) => linesCross(b.line, t.line)));
  // 쓰지 않는 먼 선로는 줄인다(역 가운데 250m 안에 한 점이라도 있는 것)
  st.tracks = st.tracks.filter((t) => t.line.some((p) => Math.hypot(p[0], p[1]) <= 250));
  // 역 가운데를 가로지르는 선로 수(그 자리에서 남북·동서 두 방향 중 많은 쪽): 역 안 선로 줄 수의 어림
  const across = (a, b) => st.tracks.filter((t) => linesCross(t.line, [a, b])).length;
  const trackCount = Math.max(across([-120, 0], [120, 0]), across([0, -120], [0, 120]));
  report.push({
    id,
    name: st.name,
    buildings: st.buildings.length,
    buildingArea: st.buildings.reduce((s, b) => s + b.area, 0),
    levels: st.buildings.some((b) => b.levels !== null || b.height !== null),
    roofShape: st.buildings.some((b) => b.roof),
    platforms: st.platforms.length,
    roofs: st.roofs.length,
    bridges: st.bridges.length,
    trackCount,
  });
  st.trackCount = trackCount;
}

const has = (k) => report.filter((r) => r[k]).length;
const result = {
  _설명:
    '기차 3D 보기의 역사·승강장 자료. stations[역 id]: buildings(역 건물 바닥 고리, 층수·높이·지붕 태그), platforms(승강장 고리 또는 선), roofs(승강장 지붕), bridges(선로를 건너는 걷는 다리), tracks(역 안 선로, 300m까지). 좌표는 역 자리(rail.json)를 원점으로 한 미터 [동, 남]. 만든 곳: scripts/build-station-areas.mjs',
  source: `OpenStreetMap contributors(ODbL), Overpass API ${fetched.filter(Boolean)[0] ?? ''}`,
  stations: out,
};
writeFileSync(resolve(ROOT, 'data/build/station-areas.json'), JSON.stringify(result));

// 보고서(사람이 읽는 것)
const lines = [
  '# 기차역 둘레 자료(3D 역사)',
  '',
  `만든 곳: scripts/build-station-areas.mjs (npm run station-areas). 원본: ${result.source}.`,
  '',
  `- 기차역 ${report.length}곳`,
  `- 역 건물이 있는 역 ${has('buildings')}곳, 층수나 높이 태그가 있는 역 ${has('levels')}곳, 지붕 모양 태그가 있는 역 ${has('roofShape')}곳`,
  `- 승강장이 있는 역 ${has('platforms')}곳, 승강장 지붕 ${has('roofs')}곳, 건너는 다리 ${has('bridges')}곳`,
  '',
  '| 역 | 건물 | 건물 넓이(㎡) | 층수·높이 | 지붕 모양 | 승강장 | 지붕 | 건너는 다리 | 선로 줄 |',
  '|---|---|---|---|---|---|---|---|---|',
  ...report
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .map((r) => `| ${r.name} | ${r.buildings} | ${r.buildingArea} | ${r.levels ? '있음' : '-'} | ${r.roofShape ? '있음' : '-'} | ${r.platforms} | ${r.roofs} | ${r.bridges} | ${r.trackCount} |`),
  '',
];
writeFileSync(resolve(ROOT, 'docs/station-areas.md'), lines.join('\n'));
const size = JSON.stringify(result).length;
const legacyNames = new Set(LEGACY_IDS.map((id) => id.replace(/^R-/, ''))); // station-areas-1.json에 든 역
const stillMissing = missing.filter((n) => !(existsSync(legacy) && legacyNames.has(n)));
if (stillMissing.length) console.log(`! 아직 받지 않은 역 ${stillMissing.length}곳(npm run fetch). 그 역들은 자료 없이 그려요: ${stillMissing.slice(0, 12).join(', ')}${stillMissing.length > 12 ? ' 등' : ''}`);
console.log(`data/build/station-areas.json ${(size / 1024).toFixed(0)}KB. 역 건물 ${has('buildings')}/${report.length}, 승강장 ${has('platforms')}, 지붕 ${has('roofs')}, 건너는 다리 ${has('bridges')}, 층수·높이 ${has('levels')}`);
