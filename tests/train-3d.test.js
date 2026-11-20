import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cellNoise, distanceFraction, groundAt, pointAt, routeProfile } from '../src/sim/train-3d-path.js';
import { railPathBetween, speedProfile } from '../src/sim/train-ride.js';

const grid = JSON.parse(readFileSync(new URL('../data/build/grid.json', import.meta.url), 'utf8'));
const rail = JSON.parse(readFileSync(new URL('../data/build/rail.json', import.meta.url), 'utf8'));

test('선로 모양을 50m마다 다시 찍고 길이를 지킨다', () => {
  const p = routeProfile(grid, [[200, 200], [203, 204]]);
  assert.ok(Math.abs(p.lengthKm - 5) < 1e-9);
  assert.ok(Math.abs(p.s.at(-1) - 5) < 1e-6);
  assert.ok(p.s.length >= 100 && p.s.length <= 102);
  for (let i = 1; i < p.s.length; i++) assert.ok(p.s[i] > p.s[i - 1]);
});

test('같은 입력은 같은 선로 높이를 낸다', () => {
  const line = rail.lines[0];
  const a = line.stations[0];
  const b = line.stations[1];
  const path = railPathBetween(rail, a, b);
  const p1 = routeProfile(grid, path.points);
  const p2 = routeProfile(grid, path.points);
  assert.deepEqual(p1.track, p2.track);
  for (const h of p1.track) assert.ok(Number.isFinite(h) && h >= 3);
});

test('선로 높이는 땅보다 부드럽다', () => {
  // 중앙선 영주–안동 같은 산길에서 이웃 점 사이 높이 차가 땅보다 작다
  const line = rail.lines.find((l) => l.stations.length > 5);
  const path = railPathBetween(rail, line.stations[0], line.stations.at(-1));
  const p = routeProfile(grid, path.points);
  const jump = (arr) => arr.slice(1).reduce((m, v, i) => Math.max(m, Math.abs(v - arr[i])), 0);
  assert.ok(jump(p.track) <= jump(p.ground));
});

test('선로 위 지점은 끝을 넘지 않고 방향은 길이 1이다', () => {
  const p = routeProfile(grid, [[100, 100], [101, 100], [101, 102]]);
  const end = pointAt(p, 999);
  assert.ok(Math.abs(end.x - 101) < 1e-9 && Math.abs(end.y - 102) < 1e-9);
  const start = pointAt(p, -5);
  assert.equal(start.x, 100);
  const mid = pointAt(p, 0.5);
  assert.ok(Math.abs(Math.hypot(mid.dx, mid.dy) - 1) < 1e-9);
  assert.ok(Math.abs(mid.dx - 1) < 1e-9);
});

test('간 거리 비율은 0에서 1까지 늘기만 한다', () => {
  const speedAt = speedProfile(12, 8, 150);
  const f = distanceFraction(speedAt);
  assert.equal(f(0), 0);
  assert.ok(Math.abs(f(1) - 1) < 1e-9);
  let prev = 0;
  for (let i = 1; i <= 50; i++) {
    const v = f(i / 50);
    assert.ok(v >= prev);
    prev = v;
  }
  // 처음에는 천천히 간다(빨라지는 동안)
  assert.ok(f(0.1) < 0.1);
});

test('바다 칸은 물보다 낮고, 칸 무늬 수는 늘 같다', () => {
  // 북동쪽 모서리(동해). 북서쪽 모서리는 강원까지 넓힌 뒤(2026-11-20) 북한 장산곶 둘레 땅이 되었다.
  assert.ok(groundAt(grid, grid.cols - 1.5, 1.5) < 0);
  assert.equal(cellNoise(3, 4, 5), cellNoise(3, 4, 5));
  const v = cellNoise(10, 20, 1);
  assert.ok(v >= 0 && v < 1);
});

test('짧은 터널은 지우고 가까운 터널은 잇는다', async () => {
  const { tidyRuns } = await import('../src/sim/train-3d-path.js');
  const s = Array.from({ length: 30 }, (_, i) => i * 0.1);
  const f = s.map(() => false);
  for (const i of [2, 3]) f[i] = true; // 0.1km: 지운다
  for (let i = 8; i <= 12; i++) f[i] = true; // 0.4km
  for (let i = 15; i <= 20; i++) f[i] = true; // 사이 0.3km: 잇는다
  const out = tidyRuns(f, s, { gapKm: 0.4, minKm: 0.3 });
  assert.equal(out[2], false);
  assert.equal(out[13], true);
  assert.equal(out[20], true);
  assert.equal(out[21], false);
});

test('tailOf는 선 모양의 끝 km만 남긴다', async () => {
  const { tailOf } = await import('../src/sim/train-3d-path.js');
  const pts = [[0, 0], [1, 0], [3, 0]];
  const t = tailOf(pts, 2.5);
  assert.deepEqual(t.at(-1), [3, 0]);
  assert.ok(Math.abs(t[0][0] - 0.5) < 1e-9 && t[0][1] === 0);
  assert.equal(tailOf(pts, 10)[0][0], 0); // 짧으면 전부
});

test('extendBack은 첫 방향 뒤로 곧게 늘이고, joinPoints는 이음매를 한 번만 둔다', async () => {
  const { extendBack, joinPoints } = await import('../src/sim/train-3d-path.js');
  const back = extendBack([[2, 2], [2, 3]], 0.8);
  assert.ok(Math.abs(back[0][0] - 2) < 1e-9 && Math.abs(back[0][1] - 1.2) < 1e-9);
  assert.deepEqual(back[1], [2, 2]);
  assert.deepEqual(joinPoints([[0, 0], [1, 0]], [[1, 0], [2, 0]]), [[0, 0], [1, 0], [2, 0]]);
});

test('노선을 갈아타는 구간(밀양 → 창원중앙)도 선로가 이어진다', () => {
  const path = railPathBetween(rail, 'R-밀양', 'R-창원중앙');
  assert.ok(path, '선로를 찾아야 한다');
  // 삼랑진을 거친다: 밀양 → 삼랑진 선로 뒤에 삼랑진 → 창원중앙 선로가 그대로 이어진다(토막 방향이 맞다)
  const a = railPathBetween(rail, 'R-밀양', 'R-삼랑진');
  const b = railPathBetween(rail, 'R-삼랑진', 'R-창원중앙');
  assert.deepEqual(path.points, [...a.points, ...b.points.slice(1)]);
  assert.ok(Math.abs(path.km - (a.km + b.km)) < 0.2, `${path.km} vs ${a.km} + ${b.km}`);
  // 같은 입력은 같은 길
  assert.deepEqual(railPathBetween(rail, 'R-밀양', 'R-창원중앙'), path);
});

test('시각표의 모든 이웃 정차역 사이에 선로가 있다', () => {
  const trains = JSON.parse(readFileSync(new URL('../data/build/trains.json', import.meta.url), 'utf8')).trains;
  const missing = [];
  for (const t of trains) {
    for (let i = 0; i + 1 < t.stops.length; i++) if (!railPathBetween(rail, t.stops[i][0], t.stops[i + 1][0])) missing.push(`${t.stops[i][0]}→${t.stops[i + 1][0]}`);
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('headOf와 extendForward는 tailOf, extendBack의 거꾸로다', async () => {
  const { headOf, extendForward } = await import('../src/sim/train-3d-path.js');
  const pts = [[0, 0], [1, 0], [3, 0]];
  const h = headOf(pts, 1.5);
  assert.deepEqual(h[0], [0, 0]);
  assert.ok(Math.abs(h.at(-1)[0] - 1.5) < 1e-9);
  const f = extendForward([[0, 0], [0, 2]], 0.5);
  assert.deepEqual(f[0], [0, 2]);
  assert.ok(Math.abs(f[1][1] - 2.5) < 1e-9 && Math.abs(f[1][0]) < 1e-9);
});
