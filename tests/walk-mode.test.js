// 걸어서 여행하기 계산 테스트(src/sim/walk-mode.js, src/sim/roads.js). 작은 가짜 자료로 본다.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { decodeRoads, indexRoads, nearestRoad, pointAlong, taxiRoute } from '../src/sim/roads.js';
import { addEntry, emptyRecord, minutesWalking, nearby, nextArrivals, stepWalk, walkable } from '../src/sim/walk-mode.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const grid = {
  cols: 3,
  rows: 1,
  terrain: [['flat', 'river', 'sea']],
};

test('걸을 수 있는 곳: 바다는 못 가고, 강은 다리(차도) 위에서만 간다', () => {
  assert.equal(walkable(grid, { x: 0.5, y: 0.5 }), true);
  assert.equal(walkable(grid, { x: 1.5, y: 0.5 }), false);
  assert.equal(walkable(grid, { x: 1.5, y: 0.5 }, () => true), true);
  assert.equal(walkable(grid, { x: 2.5, y: 0.5 }), false);
  assert.equal(walkable(grid, { x: -0.1, y: 0.5 }), false);
});

test('한 걸음: 막히면 가로나 세로로 미끄러지고, 다 막히면 서 있다', () => {
  const can = (p) => p.x < 1;
  const a = stepWalk({ x: 0.5, y: 0.5 }, { dx: 1, dy: 0 }, 0.2, can);
  assert.ok(Math.abs(a.x - 0.7) < 1e-9 && a.km > 0);
  const b = stepWalk({ x: 0.95, y: 0.5 }, { dx: 1, dy: 1 }, 0.1, can);
  assert.ok(b.x < 1 && b.y > 0.5);
  const c = stepWalk({ x: 0.95, y: 0.5 }, { dx: 1, dy: 0 }, 0.1, can);
  assert.deepEqual([c.x, c.y, c.km], [0.95, 0.5, 0]);
  assert.equal(minutesWalking(1, 4), 15);
});

test('가까운 곳은 가까운 차례로, 반지름 밖은 뺀다', () => {
  const items = [
    { id: 'a', x: 0, y: 0.1 },
    { id: 'b', x: 0, y: 0.05 },
    { id: 'c', x: 0, y: 1 },
  ];
  assert.deepEqual(
    nearby(items, { x: 0, y: 0 }, 0.15).map((n) => n.item.id),
    ['b', 'a'],
  );
});

test('다음에 오는 차: 지금 뒤로 배차 간격마다 오고, 같은 입력이면 같다', () => {
  const list = nextArrivals(480, 10, '서면역 1호선', 3);
  assert.equal(list.length, 3);
  assert.ok(list[0] >= 480 && list[0] < 490);
  assert.equal(list[1] - list[0], 10);
  assert.deepEqual(nextArrivals(480, 10, '서면역 1호선', 3), list);
  assert.deepEqual(nextArrivals(480, 0, 'x'), []);
});

test('여행 기록: 걷기는 이어 붙이고 탈것은 한 줄씩 더한다', () => {
  let r = emptyRecord(480);
  r = addEntry(r, { kind: '걷기', title: '걷기', minutes: 5, meters: 300 });
  r = addEntry(r, { kind: '걷기', title: '걷기', minutes: 3, meters: 200 });
  r = addEntry(r, { kind: '지하철', title: '1호선', minutes: 12, fare: 1600 });
  assert.equal(r.entries.length, 2);
  assert.equal(r.entries[0].meters, 500);
  assert.equal(r.entries[1].at, 488);
  assert.deepEqual([r.minutes, r.meters, r.paid], [20, 500, 1600]);
});

// 가짜 길: (0,0)─(1,0)─(2,0) 일반 도로, (0,0)─(0,1)─(2,0)은 간선(더 빠르지만 돌아간다)
const fake = decodeRoads({
  unit: 0.01,
  nodes: [0, 0, 100, 0, 200, 0, 0, 100],
  edges: [
    [0, 1, 4, 1000, []],
    [1, 2, 4, 1000, [50, 0]],
    [0, 3, 1, 1000, []],
    [3, 2, 1, 2236, []],
  ],
});

test('길 자료를 풀고, 가까운 길 위 점을 찾는다', () => {
  assert.equal(fake.edges[1].pts.length, 3);
  assert.deepEqual(fake.edges[1].pts[1], [1.5, 0]);
  const index = indexRoads(fake);
  const near = nearestRoad(fake, index, { x: 0.5, y: 0.02 }, 0.05);
  assert.equal(near.edge, 0);
  assert.ok(Math.abs(near.point[0] - 0.5) < 1e-9 && Math.abs(near.km - 0.02) < 1e-9);
  assert.equal(nearestRoad(fake, index, { x: 0.5, y: 0.5 }, 0.05), null);
});

test('택시 길: 가장 빨리 가는 길을 고르고, 모양은 탄 곳에서 내린 곳까지 이어진다', () => {
  const index = indexRoads(fake);
  const from = nearestRoad(fake, index, { x: 0.2, y: 0 }, 0.05);
  const to = nearestRoad(fake, index, { x: 1.8, y: 0 }, 0.05);
  const route = taxiRoute(fake, from, to);
  // 일반 도로로 곧장 1.6km(24km/h → 4분) vs 간선으로 돌아가기
  assert.ok(Math.abs(route.km - 1.6) < 1e-6);
  assert.deepEqual(route.points[0], [0.2, 0]);
  assert.deepEqual(route.points.at(-1), [1.8, 0]);
  assert.ok(Math.abs(route.minutes - 4) < 1e-6);
  // 같은 토막 위
  const short = taxiRoute(fake, from, nearestRoad(fake, index, { x: 0.8, y: 0 }, 0.05));
  assert.ok(Math.abs(short.km - 0.6) < 1e-6);
  // 같은 입력이면 같은 결과
  assert.deepEqual(taxiRoute(fake, from, to), route);
  const mid = pointAlong(route.points, 0.5);
  assert.ok(Math.abs(mid.x - 1) < 1e-6);
});

const roadsPath = resolve(ROOT, 'data/build/roads.json');
test('진짜 차도: 부산 시내에서 택시 길을 찾는다', { skip: existsSync(roadsPath) ? false : 'npm run roads를 먼저 돌려요' }, () => {
  const roads = decodeRoads(JSON.parse(readFileSync(roadsPath, 'utf8')));
  const index = indexRoads(roads);
  const stations = JSON.parse(readFileSync(resolve(ROOT, 'data/build/stations.json'), 'utf8')).stations;
  const at = (name) => stations.find((s) => s.name === name);
  const from = nearestRoad(roads, index, at('서면'), 0.3);
  const to = nearestRoad(roads, index, at('부산역') ?? at('부산'), 0.3);
  assert.ok(from && to, '서면과 부산역 가까이에 차도가 있다');
  const route = taxiRoute(roads, from, to);
  assert.ok(route, '택시 길이 있다');
  // 곧은 거리 약 4km. 길로는 그보다 길고 아주 멀리 돌지는 않는다.
  assert.ok(route.km > 3 && route.km < 9, `길이 ${route.km}`);
});

test('지하철 배차 간격: 그 시간 시간당 열차 수의 두 방향 평균으로 셈한다', async () => {
  const { subwayHeadway } = await import('../src/sim/walk-mode.js');
  const service = { weekday: [{ line: '1', directions: [{ trainsPerHour: { '08': 12 } }, { trainsPerHour: { '08': 8 } }] }] };
  assert.equal(subwayHeadway(service, '1', 8.5), 6);
  assert.equal(subwayHeadway(service, '1', 3), null);
  assert.equal(subwayHeadway(service, '9', 8), null);
});

test('주소: 점이 들어 있는 행정동을 찾는다', async () => {
  const { decodeDongs, dongAt } = await import('../src/sim/address.js');
  const dongs = decodeDongs({ unit: 0.01, dongs: [{ name: '가동', rings: [[0, 0, 100, 0, 0, 100, -100, 0]] }, { name: '나동', rings: [[100, 0, 100, 0, 0, 100, -100, 0]] }] });
  assert.equal(dongAt(dongs, { x: 0.5, y: 0.5 }), '가동');
  assert.equal(dongAt(dongs, { x: 1.5, y: 0.5 }), '나동');
  assert.equal(dongAt(dongs, { x: 3, y: 3 }), null);
});

test('진짜 주소: 서면역은 부산진구에 있다', { skip: existsSync(resolve(ROOT, 'data/build/dong-shapes.json')) ? false : 'npm run dong-shapes를 먼저 돌려요' }, async () => {
  const { decodeDongs, dongAt } = await import('../src/sim/address.js');
  const dongs = decodeDongs(JSON.parse(readFileSync(resolve(ROOT, 'data/build/dong-shapes.json'), 'utf8')));
  const stations = JSON.parse(readFileSync(resolve(ROOT, 'data/build/stations.json'), 'utf8')).stations;
  const seomyeon = stations.find((s) => s.name === '서면');
  assert.match(dongAt(dongs, seomyeon) ?? '', /부산광역시 부산진구/);
});

test('길 따라 걷기: 길을 따라가고, 갈림점에서 누른 방향 길로 꺾고, 길이 없으면 선다', async () => {
  const { walkAlong } = await import('../src/sim/roads.js');
  // 가짜 길: (0,0)─(1,0)─(2,0), (0,0)─(0,1)
  const at = { edge: 0, seg: 0, t: 0.5 };
  const east = walkAlong(fake, at, { dx: 1, dy: 0.1 }, 0.3);
  assert.ok(Math.abs(east.x - 0.8) < 1e-9 && Math.abs(east.y) < 1e-9);
  // 길과 직각으로 누르면, 그쪽으로 꺾을 수 있는 가까운 갈림점((0,0)에서 아래로 가는 간선)으로 간다
  const side = walkAlong(fake, at, { dx: 0, dy: 1 }, 0.3);
  assert.ok(side.km > 0 && side.x < 0.5);
  // 꺾을 곳이 없는 쪽(위)으로 누르면 서 있다
  assert.equal(walkAlong(fake, at, { dx: 0, dy: -1 }, 0.3).km, 0);
  // 서쪽 끝 갈림점(0,0)에서 아래(남쪽)로 누르면 간선으로 꺾는다
  const turn = walkAlong(fake, { edge: 0, seg: 0, t: 0.05 }, { dx: -1, dy: 0 }, 0.05);
  const down = walkAlong(fake, turn.at, { dx: 0, dy: 1 }, 0.3);
  assert.ok(Math.abs(down.x) < 1e-9 && down.y > 0.25);
  // 막다른 곳(2,0)에서 동쪽으로 더 누르면 선다
  const end = walkAlong(fake, { edge: 1, seg: 1, t: 0.9 }, { dx: 1, dy: 0 }, 1);
  assert.ok(Math.abs(end.x - 2) < 1e-9);
});
