// npm run water-shapes: OpenStreetMap 수면(data/raw/osm/water.json)으로 걸어서 여행하기 지도의 강과 호수 모양을 만든다.
// 1km 칸 지형으로는 수영강처럼 폭이 좁은 강이 나타나지 않아, 실제 모양을 따로 담는다.
// 작은 웅덩이는 빼고, 모양은 10m 오차로 줄인다. 구멍(강 가운데 섬)은 짝수-홀수 규칙으로 칠한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simplify } from './build/districts.mjs';
import { utm52 } from './lib/utm.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const grid = JSON.parse(readFileSync(resolve(ROOT, 'data/build/grid.json'), 'utf8'));
const osm = JSON.parse(readFileSync(resolve(ROOT, 'data/raw/osm/water.json'), 'utf8'));

const TOLERANCE_M = 10;
const MIN_AREA_M2 = 3000;
/** 물이 아니거나 지도에 그릴 것이 아닌 수면 */
const SKIP = new Set(['fountain', 'wastewater', 'basin']);
const W = grid.cols * 1000;
const H = grid.rows * 1000;

const toMeters = ({ lon, lat }) => {
  const [e, n] = utm52.forward(lon, lat);
  return [e - grid.origin.easting, grid.origin.northing - n];
};
const area = (ring) => {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    sum += x0 * y1 - x1 * y0;
  }
  return Math.abs(sum) / 2;
};
const keyOf = (p) => `${p.lat},${p.lon}`;

/** 조각난 선(여러 way)을 끝점끼리 이어 닫힌 고리로 만든다. 닫히지 않는 것은 버린다. */
function stitch(parts) {
  const left = parts.filter((g) => g?.length >= 2).map((g) => g.filter(Boolean));
  const rings = [];
  while (left.length) {
    const line = [...left.shift()];
    for (let grown = true; grown && keyOf(line[0]) !== keyOf(line.at(-1)); ) {
      grown = false;
      for (let i = 0; i < left.length; i++) {
        const g = left[i];
        if (keyOf(g[0]) === keyOf(line.at(-1))) line.push(...g.slice(1));
        else if (keyOf(g.at(-1)) === keyOf(line.at(-1))) line.push(...[...g].reverse().slice(1));
        else continue;
        left.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (line.length >= 4 && keyOf(line[0]) === keyOf(line.at(-1))) rings.push(line);
  }
  return rings;
}

const out = [];
let points = 0;
let open = 0;
for (const e of osm.elements) {
  if (SKIP.has(e.tags?.water)) continue;
  const outer = e.type === 'way' ? [e.geometry] : e.members.filter((m) => m.role !== 'inner').map((m) => m.geometry);
  const inner = e.type === 'way' ? [] : e.members.filter((m) => m.role === 'inner').map((m) => m.geometry);
  const outers = stitch(outer);
  if (!outers.length) open += 1;
  const rings = [];
  for (const line of [...outers, ...stitch(inner)]) {
    const ring = line.slice(0, -1).map(toMeters);
    if (area(ring) < MIN_AREA_M2) continue;
    if (!ring.some(([x, y]) => x >= 0 && y >= 0 && x < W && y < H)) continue;
    const small = simplify(ring, TOLERANCE_M);
    if (small.length < 3) continue;
    const flat = [];
    let px = 0;
    let py = 0;
    for (const [x, y] of small) {
      const qx = Math.round(x / 10);
      const qy = Math.round(y / 10);
      flat.push(qx - px, qy - py);
      px = qx;
      py = qy;
    }
    rings.push(flat);
    points += small.length;
  }
  if (rings.length) out.push(e.tags?.name ? { name: e.tags.name, rings } : { rings });
}
const data = {
  _설명: '걸어서 여행하기 지도의 강과 호수. rings는 고리마다 [dx, dy, ...](10m 단위, 첫 점은 격자 왼쪽 위에서, 그다음은 앞 점에서 옮긴 만큼). 만든 곳: scripts/build-water-shapes.mjs',
  source: 'OpenStreetMap 수면(natural=water, waterway=riverbank), © OpenStreetMap contributors, ODbL',
  unit: 0.01,
  water: out,
};
const text = JSON.stringify(data);
writeFileSync(resolve(ROOT, 'data/build/water-shapes.json'), text);
console.log(`수면 ${out.length}곳, 점 ${points}개, 고리가 닫히지 않아 뺀 것 ${open}곳, ${(text.length / 1024).toFixed(0)}KB`);
