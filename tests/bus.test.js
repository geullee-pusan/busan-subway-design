// 실제 시내버스 노선 테스트: 그래프, 길 찾기, 칸 × 중심지 버스 시간, 여행 모드 버스 길
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildBusNetwork, busJourney, busReach, busTimeTable, routesAtStop, stopGroup, stopPlace, stopsInCell, stopsNear, withBusTimes } from '../src/sim/bus-network.js';
import { withDesign } from '../src/sim/design-world.js';
import { planTrips } from '../src/sim/trip.js';
import { prepareWorld, runDay } from '../src/sim/run.js';
import { buildWorld, rulesFromCards } from '../src/sim/world.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const dataReady = ['data/build/bus.json', 'data/build/grid.json'].every((p) => existsSync(resolve(ROOT, p)));
const skip = dataReady ? false : 'npm run bus를 먼저 돌려요';

const rules = {
  walkSpeedKmh: 4,
  walkHill: 1.5,
  walkDetour: 1.3,
  busStopWaitMin: 5,
  busWalkMaxMin: 15,
  busSpeedCityKmh: 12,
  busSpeedOuterKmh: 24,
};
// 작은 도시: 가로 노선 A(정류장 0→1→2)와 세로 노선 B(정류장 3→4). 정류장 2와 3은 100m 떨어져 있다.
const flat = { terrain: Array.from({ length: 10 }, () => Array(10).fill('flat')) };
const tiny = {
  names: ['가', '나', '다', '라', '마'],
  stops: [
    [100, 100, 0],
    [300, 100, 1],
    [500, 100, 2],
    [510, 110, 3],
    [510, 500, 4],
  ],
  routes: [
    { no: 'A', stops: [[0, 10, 0], [1, 5, 3], [2, 0, 12]] },
    { no: 'B', stops: [[3, 8, 0], [4, 0, 8]] },
  ],
};

test('버스 길: 걷기 → 기다리기 → 타기 → 걸어서 갈아타기 → 기다리기 → 타기 → 걷기', () => {
  const network = buildBusNetwork(tiny, flat, rules);
  const trip = busJourney(network, { x: 1, y: 1 }, { x: 5.1, y: 5 }, rules);
  assert.ok(trip);
  assert.deepEqual(
    trip.legs.map((leg) => leg.type),
    ['walk', 'wait', 'bus', 'walk', 'wait', 'bus', 'walk'],
  );
  const buses = trip.legs.filter((leg) => leg.type === 'bus');
  assert.deepEqual(buses.map((leg) => leg.route), ['A', 'B']);
  assert.deepEqual(buses[0].stops.map((stop) => stop.name), ['가', '나', '다']);
  // 시간은 조각을 더한 것과 같다.
  const sum = trip.legs.reduce((total, leg) => total + leg.minutes, 0);
  assert.ok(Math.abs(sum - trip.minutes) < 1e-9);
  // A를 4km 타는 시간: 12km/h면 20분
  assert.ok(Math.abs(buses[0].minutes - 20) < 1e-9);
  assert.equal(buses[1].endsAtTerminal, true);
});

test('버스 길: 거꾸로는 못 간다(노선은 한 방향)', () => {
  const network = buildBusNetwork(tiny, flat, rules);
  assert.equal(busJourney(network, { x: 5.1, y: 5 }, { x: 1, y: 1 }, rules), null);
});

test('버스 붐빔: 노선에서 가장 붐비는 곳이 1이다', () => {
  const network = buildBusNetwork(tiny, flat, rules);
  // A: 10명 타고 → 5명 더 타고 3명 내림(12명) → 12명 내림
  assert.deepEqual(network.loads[0], [10 / 12, 1, 0]);
});

test('칸 × 중심지 버스 시간: 정류장이 멀면 Infinity, 가까우면 걷기와 견줘 빠른 쪽', () => {
  const network = buildBusNetwork(tiny, flat, rules);
  const zones = [
    { index: 0, x: 1, y: 1 },
    { index: 1, x: 9, y: 9 },
  ];
  const centers = [{ x: 5, y: 1 }];
  const table = busTimeTable(network, zones, centers, rules);
  assert.ok(Number.isFinite(table[0]));
  assert.equal(table[1], Infinity);
  // busReach로 구한 값과 같다.
  const reach = busReach(network, centers[0], rules, true);
  assert.ok(Math.abs(Math.min(reach(zones[0]), (4 * 1.3 * 60) / 4) - table[0]) < 1e-9);
});

test('부산 버스 자료: 심야 노선이 없고, 정류장 번호가 모두 맞다', { skip }, () => {
  const bus = readJson('data/build/bus.json');
  assert.ok(bus.routes.length > 100);
  assert.ok(bus.routes.every((route) => !route.no.includes('심야')));
  for (const route of bus.routes) {
    for (const [index] of route.stops) assert.ok(bus.stops[index], `${route.no} 정류장 ${index}`);
  }
});

function busanWorld() {
  const allRules = rulesFromCards(readJson('src/content/rules.json').rules);
  const grid = readJson('data/build/grid.json');
  const world = buildWorld({
    grid,
    stations: readJson('data/build/stations.json').stations,
    lines: readJson('data/build/lines.json').lines,
    links: readJson('data/build/links.json').links,
    transfers: readJson('data/build/transfers.json').transfers,
    places: readJson('src/content/places.json').places,
    dongs: readJson('data/build/dongs.json').dongs,
    hourShape: readJson('data/build/ridership.json').shape['평일'],
    defaultHeadwayMin: allRules.defaultHeadwayMin,
  });
  const network = buildBusNetwork(readJson('data/build/bus.json'), grid, allRules);
  return { world, network, rules: allRules };
}

test('부산: 서면 → 해운대는 실제 버스로 갈 수 있고, 같은 입력은 같은 길이다', { skip }, () => {
  const { world, network, rules: allRules } = busanWorld();
  const from = world.centers.find((c) => c.name === '서면');
  const to = world.centers.find((c) => c.name === '해운대');
  const a = busJourney(network, from, to, allRules);
  assert.ok(a && a.legs.some((leg) => leg.type === 'bus'));
  assert.ok(a.minutes > 20 && a.minutes < 120, `${a.minutes}분`);
  assert.deepEqual(busJourney(network, from, to, allRules), a);
  assert.ok(stopsNear(network, from, allRules).length > 0);
});

test('부산: 하루 운행은 실제 버스 시간을 쓰고, 결과는 늘 같다', { skip }, () => {
  const { world, network, rules: allRules } = busanWorld();
  const withBus = withBusTimes(world, network, allRules);
  assert.equal(withBus.busTimes.length, world.zones.length * world.centers.length);
  assert.ok(withBus.busTimes.some(Number.isFinite));
  const run = () => JSON.stringify(runDay(withBus, prepareWorld(withBus, allRules), allRules).totals);
  assert.equal(run(), run());
  // 실제 버스 시간이 들어가면 결과가 달라진다(버스 시간을 정말 쓴다).
  assert.notEqual(run(), JSON.stringify(runDay(world, prepareWorld(world, allRules), allRules).totals));
});

test('여행 모드: 버스 길에 노선 번호와 정류장이 붙는다', { skip }, () => {
  const { world, network, rules: allRules } = busanWorld();
  const prepared = prepareWorld(world, allRules);
  const from = world.centers.find((c) => c.name === '서면');
  const to = world.centers.find((c) => c.name === '광안리');
  const trips = planTrips({
    from,
    to,
    hour: 13,
    modes: { bus: true, subway: true },
    world,
    prepared,
    rules: allRules,
    fares: readJson('src/content/fares.json'),
    busNetwork: network,
  });
  const bus = trips.find((t) => t.id === 'bus');
  assert.ok(bus);
  const rides = bus.legs.filter((leg) => leg.mode === '버스');
  assert.ok(rides.length > 0 && rides.every((leg) => leg.route && leg.stops.length >= 2));
  // 첫 걷기는 첫 정류장으로 간다.
  assert.equal(bus.legs[0].stop, rides[0].stops[0].name);
});

test('칸의 실제 정류장: 같은 자리는 하나로, 서는 노선과 방면(다음 정류장)이 붙는다', () => {
  // 정류장 2와 3은 같은 이름이 아니고 10m 떨어져 있다. 같은 자리 정류장 하나를 더 둔다.
  const bus = {
    names: ['가', '나', '다', '라', '마', '다'],
    stops: [...tiny.stops, [500, 100, 5]],
    routes: [...tiny.routes, { no: 'C', stops: [[5, 1, 0], [4, 0, 1]] }],
  };
  const network = buildBusNetwork(bus, flat, rules);
  const grid = { cols: 10 };
  // 칸 (5, 1): 정류장 2(다), 3(라), 5(다, 2와 같은 자리)
  const list = stopsInCell(network, grid, 1 * 10 + 5);
  assert.deepEqual(list.map((s) => s.name), ['다', '라']);
  const da = list[0];
  assert.deepEqual(da.routes, ['A', 'C']);
  assert.equal(da.toward, '마');
  assert.deepEqual(routesAtStop(network, 5), ['A', 'C']);
  assert.equal(stopPlace(network, 2).name, '다');
  // 정류장이 없는 칸
  assert.deepEqual(stopsInCell(network, grid, 9 * 10 + 9), []);
});

test('버스 노선 설계: 고른 실제 정류장 자리에 역을 둔다', () => {
  const world = { stations: [], links: [], transfers: [], lines: [] };
  const tables = { lineKinds: { 버스: { speedKmh: 17, capacityPerTrain: 49 } } };
  const design = { path: [11, 12, 13], stations: [11, 13], kind: '버스', trainsPerHour: 8, busStopPoints: { 11: { x: 1.23, y: 1.77 } } };
  const next = withDesign(world, design, { cols: 10 }, tables);
  const [a, b] = next.stations;
  assert.deepEqual([a.x, a.y], [1.23, 1.77]);
  // 고르지 않은 칸은 칸 가운데
  assert.deepEqual([b.x, b.y], [3.5, 1.5]);
});

test('정류장을 고른 출발·도착: 그 정류장에서 타고 내리고, 걷기는 0분이다', () => {
  const network = buildBusNetwork(tiny, flat, rules);
  // 정류장 1(나)에서 타서 정류장 2(다)에서 내린다: 둘레의 정류장 0(가)에서 타지 않는다.
  const trip = busJourney(network, { x: 3, y: 1, stopIndex: 1 }, { x: 5, y: 1, stopIndex: 2 }, rules);
  assert.ok(trip);
  const ride = trip.legs.find((leg) => leg.type === 'bus');
  assert.deepEqual(ride.stops.map((stop) => stop.name), ['나', '다']);
  assert.equal(ride.toward, '다');
  assert.equal(trip.legs[0].minutes, 0);
  assert.equal(trip.legs.at(-1).minutes, 0);
  assert.deepEqual(stopGroup(network, 2), [2]);
});

test('고른 정류장에서 갈 버스가 없으면 다른 정류장으로 걸어가 타지 않는다', () => {
  const network = buildBusNetwork(tiny, flat, rules);
  // 정류장 2(다)는 노선 A의 끝이라 다에서 타는 버스가 없다(옆 정류장 라로 걸어가면 B를 탈 수 있지만 그러지 않는다).
  assert.equal(busJourney(network, { x: 5, y: 1, stopIndex: 2 }, { x: 5.1, y: 5, stopIndex: 4 }, rules), null);
  // 정류장을 고르지 않으면 걸어서 갈아탄다.
  assert.ok(busJourney(network, { x: 5, y: 1 }, { x: 5.1, y: 5 }, rules));
  // 라에서 타면 B로 바로 간다.
  const trip = busJourney(network, { x: 5.1, y: 1.1, stopIndex: 3 }, { x: 5.1, y: 5, stopIndex: 4 }, rules);
  assert.deepEqual(trip.legs.filter((leg) => leg.type === 'bus').map((leg) => leg.route), ['B']);
});
