// npm run data: data/raw/의 원본을 가공해 data/build/에 게임용 JSON을 만든다.
// 네트워크를 쓰지 않는다. 같은 원본이면 언제 돌려도 같은 파일이 나온다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGrid } from './build/grid.mjs';
import { buildNetwork } from './build/network.mjs';
import { renderPreview } from './build/preview.mjs';
import { readTrains, summarizeService } from './build/service.mjs';
import { stringify } from './lib/json.mjs';
import { utm52 } from './lib/utm.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raw = (p) => resolve(ROOT, 'data/raw', p);
const readJson = (p, fallback) => (existsSync(resolve(ROOT, p)) ? JSON.parse(readFileSync(resolve(ROOT, p), 'utf8')) : fallback);
const OUT = resolve(ROOT, 'data/build');

const config = readJson('scripts/config/terrain.json');
const overrides = readJson('data/edits/terrain-overrides.json', { cells: [] });
const transferEdits = readJson('data/edits/transfers.json', {});
const stationEdits = readJson('data/edits/stations.json', {});
const facts = readJson('data/facts.json', { lines: {}, planned: [] });

// 1. 역, 노선, 구간, 환승
const network = buildNetwork(raw, transferEdits, stationEdits);
const issues = network.issues.map((m) => `[노선] ${m}`);

// 노선 색: 공식 출처(data/facts.json)가 있으면 그것을, 없으면 OSM 노선의 colour 태그를 쓴다.
const routes = JSON.parse(readFileSync(raw('osm/routes.json'), 'utf8'));
const osmColour = new Map();
for (const e of routes.elements) {
  if (e.type === 'relation' && e.tags?.colour && e.tags?.ref) osmColour.set(e.tags.ref, e.tags.colour);
}
for (const line of network.lines) {
  const fact = facts.lines?.[line.id] ?? {};
  const osmRef = line.id === 'DH' ? '동해' : line.id;
  if (fact.color) {
    line.color = fact.color.value;
    line.colorSource = fact.color.source;
  } else {
    line.color = osmColour.get(osmRef) ?? null;
    line.colorSource = line.color ? 'OSM colour 태그' : null;
    issues.push(`[노선] ${line.name} 공식 색: TODO(확인 필요). 지금은 OSM 색을 써요.`);
  }
  if (fact.lengthKm && line.lengthKm === null) {
    line.lengthKm = fact.lengthKm.value;
    line.lengthSource = fact.lengthKm.source;
  }
  // 역 사이 시간 자료가 없는 노선: 공식 전 구간 소요시간(정차시간 포함)을 역 사이 직선거리 비율로 나눈다.
  // 나눈 값에 정차시간이 이미 들어 있으므로 dwellS는 0으로 둔다.
  const own = network.links.filter((l) => l.line === line.id);
  if (own.some((l) => l.runS === null)) {
    if (fact.endToEndMin) {
      const totalS = Math.round(fact.endToEndMin.value * 60);
      const sumD = own.reduce((s, l) => s + l.distanceM, 0);
      let given = 0;
      own.forEach((l, i) => {
        l.runS = i === own.length - 1 ? totalS - given : Math.round((totalS * l.distanceM) / sumD);
        given += l.runS;
        l.runSource = '추정(정차시간 포함)';
      });
      line.runSource = `추정: 전 구간 ${fact.endToEndMin.text}(${fact.endToEndMin.source})을 역 사이 직선거리 비율로 나눔`;
      line.dwellS = 0;
      line.dwellSource = '역 사이 시간에 포함';
    } else {
      issues.push(`[노선] ${line.name} 역 사이 시간: TODO(확인 필요). 전 구간 소요시간 출처가 없어요.`);
    }
  }
  // 차량: 한 편성 칸 수와 정원
  if (fact.carsPerTrain) line.carsPerTrain = fact.carsPerTrain.value;
  if (fact.capacityPerCar) line.capacityPerCar = fact.capacityPerCar.value;
  if (fact.capacityPerTrain) line.capacityPerTrain = fact.capacityPerTrain.value;
  if (fact.vehicle) line.vehicle = fact.vehicle.value;
  if (fact.stations && fact.stations.value !== line.stations.length) {
    issues.push(`[노선] ${line.name} 역 수: 공식 ${fact.stations.value}개(${fact.stations.source}), 데이터 ${line.stations.length}개. TODO(확인 필요)`);
  }
}

// 2. 격자: 부산 전역 + 북정역(양산선, OSM) + 가야대역(부산김해경전철 끝 역)
const osmStations = JSON.parse(readFileSync(raw('osm/stations.json'), 'utf8'));
const bukjeong = osmStations.elements.find((e) => e.type === 'node' && e.tags?.name === '북정');
if (!bukjeong) throw new Error('OSM 자료에서 북정역을 찾지 못했어요.');
const bglLine = network.lines.find((l) => l.id === 'BGL');
const gaya = network.stations.find((s) => s.id === bglLine.stations.at(-1));
const extraPoints = [
  { name: '북정(양산선, OSM)', lon: bukjeong.lon, lat: bukjeong.lat },
  { name: gaya.name, lon: gaya.lon, lat: gaya.lat },
];
const { grid, stats: gridStats, issues: gridIssues } = buildGrid({ raw, config, extraPoints, overrides });
issues.push(...gridIssues.map((m) => `[격자] ${m}`));

// 역의 격자 좌표(km). x는 서쪽 끝에서 동쪽으로, y는 북쪽 끝에서 남쪽으로 잰다.
for (const s of network.stations) {
  const [e, n] = utm52.forward(s.lon, s.lat);
  s.x = Math.round(e - grid.origin.easting) / 1000;
  s.y = Math.round(grid.origin.northing - n) / 1000;
  s.col = Math.floor(s.x);
  s.row = Math.floor(s.y);
  s.inGrid = s.col >= 0 && s.col < grid.cols && s.row >= 0 && s.row < grid.rows;
}

// 격자 배열은 행마다 한 줄로 쓴다.
const toRows = (flat) => Array.from({ length: grid.rows }, (_, r) => flat.slice(r * grid.cols, (r + 1) * grid.cols));
const gridOut = {
  ...grid,
  terrain: toRows(grid.terrain),
  population: toRows(grid.population),
  populationBusan: toRows(grid.populationBusan),
  elevationM: toRows(grid.elevationM),
  slopeDeg: toRows(grid.slopeDeg),
  district: toRows(grid.district),
  sources: {
    boundary: 'vuski/admdongkor ver20260701 (통계청 SGIS 가공, CC BY 4.0)',
    population: '행정안전부 지역별(행정동) 주민등록 인구수 2026-08-31 (공공데이터포털 15097972)',
    elevation: 'SRTM 1초, Tilezen Terrain Tiles (skadi)',
    water: 'OpenStreetMap natural=water (© OpenStreetMap contributors)',
    rules: 'scripts/config/terrain.json, data/edits/terrain-overrides.json',
  },
};

// 3. 운행 요약(시각표)
const trains = readTrains(raw('datagokr/15082980.csv'));
const humetroOrder = network.lines
  .filter((l) => ['1', '2', '3', '4'].includes(l.id))
  .map((l) => ({ id: l.id, order: l.stations.map((id) => network.stations.find((s) => s.id === id).name) }));
const service = {
  source: '부산교통공사 부산도시철도 운행 정보 2026-07-22 (공공데이터포털 15082980)',
  note: '시각표는 분 단위다. 전 구간 소요시간은 첫 역 출발부터 끝 역 도착까지다. 열차 수는 reference 역을 지나는 열차를 센다.',
  weekday: summarizeService(trains, humetroOrder, '평일'),
};

// 4. 쓰기
mkdirSync(OUT, { recursive: true });
const write = (name, data) => writeFileSync(resolve(OUT, name), typeof data === 'string' ? data : stringify(data));
write('lines.json', { lines: network.lines, planned: facts.planned ?? [] });
write('stations.json', { stations: network.stations });
write('links.json', { links: network.links });
write('transfers.json', { transfers: network.transfers });
write('grid.json', gridOut);
write('service.json', service);
write('build-report.json', { grid: gridStats, stations: network.stations.length, links: network.links.length, issues });
write(
  'preview.svg',
  renderPreview({
    grid: gridOut,
    lines: network.lines,
    stations: network.stations,
    notes: ['노선 색은 OSM 태그(공식 색 확인 전)', '역 사이 선은 직선으로 그림'],
  }),
);

console.log(`격자 ${grid.cols} × ${grid.rows}칸, 역 ${network.stations.length}개, 구간 ${network.links.length}개, 환승 ${network.transfers.length}곳`);
console.log(`부산 인구: 공식 ${gridStats.busanOfficial.toLocaleString()}명, 격자 안 ${gridStats.busanInGrid.toLocaleString()}명`);
console.log(`지형: ${Object.entries(gridStats.terrainCounts).map(([k, n]) => `${k} ${n}`).join(', ')}`);
if (issues.length) {
  console.log(`\n확인할 것 ${issues.length}개:`);
  for (const m of issues) console.log(`- ${m}`);
}
