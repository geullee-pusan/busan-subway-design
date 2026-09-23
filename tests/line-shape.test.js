// 새 노선 모양과 열차 움직임 테스트
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { lineShape, pointBetween, shapeLength } from '../src/sim/line-shape.js';
import { lineRoutes, trainsAt, tripSeconds } from '../src/sim/train-motion.js';
import { buildWorld, rulesFromCards } from '../src/sim/world.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

/** 10 × 10 칸, 모두 평지 */
function flatGrid(size = 10, special = {}) {
  const terrain = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => special[`${c},${r}`] ?? 'flat'),
  );
  return { cols: size, rows: size, terrain };
}
const at = (col, row, cols = 10) => row * cols + col;

// --- 모양 ---

test('계단처럼 그은 선은 비스듬한 직선으로 편다', () => {
  const grid = flatGrid();
  // (0,0) → 오른쪽 → 아래 → 오른쪽 → 아래 … (4,4)
  const path = [at(0, 0), at(1, 0), at(1, 1), at(2, 1), at(2, 2), at(3, 2), at(3, 3), at(4, 3), at(4, 4)];
  const { points, stops } = lineShape({ path, stations: [path[0], path.at(-1)], grid });
  assert.equal(points.length, 2, '끝 역 두 점만 남아 곧은 선이 돼야 해요');
  assert.deepEqual(points[0], { x: 0.5, y: 0.5 });
  assert.deepEqual(points[1], { x: 4.5, y: 4.5 });
  assert.deepEqual(stops, [
    { cell: path[0], index: 0 },
    { cell: path.at(-1), index: 1 },
  ]);
  // 계단(8칸)보다 짧다
  assert.ok(shapeLength(points) < 8);
});

test('ㄱ자로 꺾인 곳은 둥글게 돈다(평지)', () => {
  const grid = flatGrid();
  const path = [at(0, 2), at(1, 2), at(2, 2), at(3, 2), at(3, 3), at(3, 4), at(3, 5)];
  const { points } = lineShape({ path, stations: [path[0], path.at(-1)], grid });
  assert.ok(points.length > 3, '꺾인 곳에 곡선 점이 더해져야 해요');
  // 꺾인 칸 가운데(3.5, 2.5)는 곡선이 되면서 그대로 지나지 않는다
  assert.ok(!points.some((p) => p.x === 3.5 && p.y === 2.5));
});

test('지하철은 경전철보다 크게 돈다', () => {
  const grid = flatGrid();
  const path = [at(0, 2), at(1, 2), at(2, 2), at(3, 2), at(4, 2), at(4, 3), at(4, 4), at(4, 5), at(4, 6)];
  const corner = { x: 4.5, y: 2.5 };
  const farthest = (kind) => {
    const { points } = lineShape({ path, stations: [path[0], path.at(-1)], grid, kind });
    return Math.max(...points.map((p) => (p.x === 0.5 || p.y === 6.5 ? 0 : Math.hypot(p.x - corner.x, p.y - corner.y))));
  };
  assert.ok(farthest('지하철') > farthest('경전철'));
});

test('바다 쪽으로는 부풀지 않는다(바다 칸 안으로 들어가지 않는다)', () => {
  // 꺾인 곳 안쪽 대각선 칸(2,3)이 바다
  const grid = flatGrid(10, { '2,3': 'sea' });
  const path = [at(0, 2), at(1, 2), at(2, 2), at(3, 2), at(3, 3), at(3, 4), at(3, 5)];
  const { points } = lineShape({ path, stations: [path[0], path.at(-1)], grid });
  assert.ok(
    points.every((p) => !(Math.floor(p.x) === 2 && Math.floor(p.y) === 3)),
    '바다 칸 위로 선이 지나가요',
  );
});

test('역은 늘 제자리를 지나고, 역 차례대로 나온다', () => {
  const grid = flatGrid();
  const path = [at(0, 0), at(1, 0), at(2, 0), at(2, 1), at(2, 2), at(3, 2), at(4, 2)];
  const stations = [at(0, 0), at(2, 1), at(4, 2)];
  const { points, stops } = lineShape({ path, stations, grid });
  assert.deepEqual(
    stops.map((s) => s.cell),
    stations,
  );
  assert.deepEqual(points[stops[1].index], { x: 2.5, y: 1.5 });
  // 역 자리는 뒤로 갈수록 커진다
  assert.ok(stops[0].index < stops[1].index && stops[1].index < stops[2].index);
});

test('기존 역과 같은 칸이면 그 역 자리에 정확히 겹친다', () => {
  const grid = flatGrid();
  const path = [at(0, 0), at(1, 0), at(2, 0)];
  const snap = { [at(2, 0)]: { x: 2.83, y: 0.21 } };
  const { points, stops } = lineShape({ path, stations: [at(0, 0), at(2, 0)], grid, snap });
  assert.deepEqual(points[stops[1].index], { x: 2.83, y: 0.21 });
});

test('두 역 사이 곡선 위의 점', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
  ];
  assert.deepEqual(pointBetween(points, 0, 2, 0), { x: 0, y: 0 });
  assert.deepEqual(pointBetween(points, 0, 2, 0.5), { x: 1, y: 0 });
  assert.deepEqual(pointBetween(points, 0, 2, 1), { x: 1, y: 1 });
  // 거꾸로 가도 된다
  assert.deepEqual(pointBetween(points, 2, 0, 0.25), { x: 1, y: 0.5 });
});

test('같은 설계는 늘 같은 모양', () => {
  const grid = flatGrid(10, { '5,5': 'mountain', '6,1': 'river' });
  const path = [at(0, 0), at(1, 0), at(1, 1), at(2, 1), at(3, 1), at(3, 2), at(3, 3), at(4, 3)];
  const args = { path, stations: [path[0], path[3], path.at(-1)], grid, kind: '지하철' };
  assert.deepEqual(lineShape(args), lineShape(args));
});

// --- 열차 움직임 ---

const route = { line: 'T', stops: ['A', 'B', 'C'], runS: [600, 600], dwellS: 0, headwayMin: 10 };

test('첫차 전과 막차 뒤에는 열차가 없다', () => {
  assert.deepEqual(trainsAt(route, 5), []);
  assert.deepEqual(trainsAt(route, 23.5 + 20 / 60 + 0.01), []);
});

test('첫차가 떠나고 5분 뒤에는 양쪽에서 한 대씩 반쯤 와 있다', () => {
  const trains = trainsAt(route, 5.5 + 5 / 60);
  assert.equal(trains.length, 2);
  const forward = trains.find((t) => t.direction === 1);
  const backward = trains.find((t) => t.direction === -1);
  assert.ok(Math.abs(forward.at - 0.5) < 1e-9);
  assert.ok(Math.abs(backward.at - 1.5) < 1e-9);
});

test('배차 간격이 짧으면 열차가 더 많다', () => {
  const noon = 12;
  const every10 = trainsAt(route, noon).length;
  const every5 = trainsAt({ ...route, headwayMin: 5 }, noon).length;
  assert.equal(every10, 4); // 한쪽 20분 걸리고 10분마다: 한쪽 2대 × 양쪽
  assert.equal(every5, 8);
});

test('중간 역에서는 서는 시간만큼 머문다', () => {
  const stopping = { ...route, dwellS: 60 };
  assert.equal(tripSeconds(stopping), 1260);
  // 떠나고 10분 30초 뒤: 앞 열차는 B 역에 서 있다
  const trains = trainsAt(stopping, 5.5 + 10.5 / 60);
  assert.ok(trains.some((t) => t.direction === 1 && t.at === 1));
});

test('실제 부산 노선으로 노선마다 역 차례를 만든다', () => {
  const rules = rulesFromCards(readJson('src/content/rules.json').rules);
  const lines = readJson('data/build/lines.json').lines;
  const world = buildWorld({
    grid: readJson('data/build/grid.json'),
    stations: readJson('data/build/stations.json').stations,
    lines,
    links: readJson('data/build/links.json').links,
    transfers: readJson('data/build/transfers.json').transfers,
    places: readJson('src/content/places.json').places,
    dongs: readJson('data/build/dongs.json').dongs,
    hourShape: readJson('data/build/ridership.json').shape['평일'],
    defaultHeadwayMin: rules.defaultHeadwayMin,
  });
  const routes = lineRoutes(world);
  assert.equal(routes.length, lines.length);
  for (const r of routes) {
    const line = lines.find((l) => l.id === r.line);
    assert.equal(r.stops.length, line.stations.length, `${line.name}의 역 수가 달라요`);
    assert.equal(new Set(r.stops).size, r.stops.length);
    // 끝 역에서 시작해 끝 역에서 끝난다
    const ends = [line.stations[0], line.stations.at(-1)];
    assert.ok(ends.includes(r.stops[0]) && ends.includes(r.stops.at(-1)));
    // 낮 12시에 적어도 한 대는 달린다
    assert.ok(trainsAt(r, 12).length > 0, `${line.name}에 열차가 없어요`);
  }
});
