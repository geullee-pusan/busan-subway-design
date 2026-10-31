// npm run dong-shapes: 행정동 경계(vuski/admdongkor ver20260701, 통계청 SGIS 가공, CC BY 4.0)를 줄여
// 걸어서 여행하기의 "지금 있는 곳" 주소(시·구·동)에 쓰는 data/build/dong-shapes.json을 만든다.
// - 게임 지도(격자)에 걸치는 동만 넣는다. 모양은 40m 오차로 줄이고, 좌표는 10m 단위 정수로 앞 점과의 차이를 적는다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simplify } from './build/districts.mjs';
import { utm52 } from './lib/utm.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const grid = JSON.parse(readFileSync(resolve(ROOT, 'data/build/grid.json'), 'utf8'));
const fc = JSON.parse(readFileSync(resolve(ROOT, 'data/raw/admdongkor/HangJeongDong_ver20260701.geojson'), 'utf8'));
const TOLERANCE_M = 40;

const toMeters = ([lon, lat]) => {
  const [e, n] = utm52.forward(lon, lat);
  return [e - grid.origin.easting, grid.origin.northing - n];
};
const W = grid.cols * 1000;
const H = grid.rows * 1000;

const dongs = [];
let points = 0;
for (const f of fc.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = [];
  let touches = false;
  for (const poly of polys) {
    // 바깥 고리만 쓴다(동 안의 구멍은 거의 없고, 있어도 주소에는 상관없다)
    const outer = poly[0].map(toMeters);
    if (outer.some(([x, y]) => x >= 0 && y >= 0 && x < W && y < H)) touches = true;
    const small = simplify(outer, TOLERANCE_M);
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
  if (!touches || !rings.length) continue;
  const p = f.properties;
  dongs.push({ name: p.adm_nm, rings });
}
const out = {
  _설명: '걸어서 여행하기 주소용 행정동 모양. rings는 고리마다 [dx, dy, ...](10m 단위, 첫 점은 격자 왼쪽 위에서, 그다음은 앞 점에서 옮긴 만큼).',
  source: '행정동 경계(vuski/admdongkor ver20260701, 통계청 SGIS 가공, CC BY 4.0)',
  unit: 0.01,
  dongs,
};
const text = JSON.stringify(out);
writeFileSync(resolve(ROOT, 'data/build/dong-shapes.json'), text);
console.log(`동 ${dongs.length}개, 점 ${points}개, dong-shapes.json ${(text.length / 1024).toFixed(0)}KB`);
