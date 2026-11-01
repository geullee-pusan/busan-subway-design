// npm run landmarks: 걸어서 여행하기의 랜드마크(data/build/landmarks.json)를 만든다.
// - 고른 곳: scripts/config/landmarks.json
// - 자리: OpenStreetMap(data/raw/osm/landmarks.json)의 그 요소 가운데 점. © OpenStreetMap contributors, ODbL
// - 소개 글: data/facts.json의 landmarks(문장마다 출처)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { utm52 } from './lib/utm.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const grid = JSON.parse(readFileSync(resolve(ROOT, 'data/build/grid.json'), 'utf8'));
const osm = JSON.parse(readFileSync(resolve(ROOT, 'data/raw/osm/landmarks.json'), 'utf8'));
const config = JSON.parse(readFileSync(resolve(ROOT, 'scripts/config/landmarks.json'), 'utf8'));
const facts = JSON.parse(readFileSync(resolve(ROOT, 'data/facts.json'), 'utf8')).landmarks ?? {};

const byId = new Map(osm.elements.map((e) => [`${e.type}/${e.id}`, e]));
const pointOf = (e) => (e.center ? [e.center.lon, e.center.lat] : [e.lon, e.lat]);
const toGrid = ([lon, lat]) => {
  const [east, north] = utm52.forward(lon, lat);
  return { x: Math.round((east - grid.origin.easting) / 10) / 100, y: Math.round((grid.origin.northing - north) / 10) / 100 };
};

const out = [];
const problems = [];
for (const item of config.landmarks) {
  let element = item.osm ? byId.get(item.osm) : null;
  if (!element && item.osmName) {
    // 같은 이름 요소 가운데 near에 가장 가까운 것
    const [lat0, lon0] = item.near;
    element = osm.elements
      .filter((e) => e.tags?.name === item.osmName)
      .map((e) => ({ e, d: Math.hypot(pointOf(e)[0] - lon0, pointOf(e)[1] - lat0) }))
      .sort((a, b) => a.d - b.d)[0]?.e;
  }
  if (!element) {
    problems.push(`${item.name}: OpenStreetMap 요소를 찾지 못했어요`);
    continue;
  }
  const point = toGrid(pointOf(element));
  if (point.x < 0 || point.y < 0 || point.x >= grid.cols || point.y >= grid.rows) {
    problems.push(`${item.name}: 지도 밖이에요`);
    continue;
  }
  const lines = (facts[item.id]?.facts ?? []).map((f) => ({ text: f.text, source: f.source }));
  if (!lines.length) problems.push(`${item.name}: 소개 글이 없어요`);
  out.push({ id: item.id, name: item.name, city: item.city, kind: item.kind, x: point.x, y: point.y, radius: item.radius / 1000, ...(item.address ? { address: item.address } : {}), osm: `${element.type}/${element.id}`, facts: lines });
}
const data = {
  _설명: '걸어서 여행하기의 랜드마크. x, y는 격자 좌표(km), radius는 도착으로 보는 거리(km). facts는 소개 글과 출처(자세한 근거는 data/facts.json). 만든 곳: scripts/build-landmarks.mjs',
  source: '자리: OpenStreetMap, © OpenStreetMap contributors, ODbL. 소개 글: data/facts.json landmarks',
  landmarks: out,
};
writeFileSync(resolve(ROOT, 'data/build/landmarks.json'), JSON.stringify(data));
console.log(`랜드마크 ${out.length}곳`);
for (const p of problems) console.log(`확인할 것: ${p}`);
