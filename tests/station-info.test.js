// 설계 화면의 역 정보 테스트: 둘레 사람 수, 가장 가까운 역, 새로 걸어갈 역이 생긴 사람, 예상 승객 단계
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { withDesign } from '../src/sim/design-world.js';
import { prepareWorld, runDay } from '../src/sim/run.js';
import { RIDER_LEVELS, riderLevel, stationSurroundings } from '../src/sim/station-info.js';
import { buildWorld, rulesFromCards } from '../src/sim/world.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const dataReady = ['data/build/grid.json', 'data/build/ridership.json'].every((p) => existsSync(resolve(ROOT, p)));
const skip = dataReady ? false : 'npm run data를 먼저 돌려요';

// 시속 4km, 25분이면 1km 666m까지 걷는다.
const rules = { walkSpeedKmh: 4, walkHill: 1.5, walkMaxMin: 25 };

test('둘레: 걸어갈 수 있는 칸만 센다(언덕은 더 느리다)', () => {
  const zones = [
    { x: 0, y: 0, population: 100 },
    { x: 1, y: 0, population: 10 }, // 15분
    { x: 1.5, y: 0, population: 1, hilly: true }, // 22분 30초 × 1.5 = 33분 45초 → 못 온다
    { x: 3, y: 0, population: 1000 }, // 너무 멀다
  ];
  const got = stationSurroundings({ point: { x: 0, y: 0 }, zones, existing: [], centers: [], rules });
  assert.equal(got.walkPeople, 110);
  assert.equal(got.newPeople, 110);
  assert.equal(got.closestPeople, 110);
});

test('둘레: 원래 역이 가까운 사람과 새로 역이 생긴 사람을 나눈다', () => {
  const zones = [
    { x: -1, y: 0, population: 30 },
    { x: 1, y: 0, population: 70 },
  ];
  const existing = [{ x: 1.2, y: 0 }]; // 오른쪽 칸 옆에 이미 역이 있다
  const got = stationSurroundings({ point: { x: 0, y: 0 }, zones, existing, centers: [], rules });
  assert.equal(got.walkPeople, 100);
  // 오른쪽 칸은 옛 역이 더 가깝다.
  assert.equal(got.closestPeople, 30);
  // 왼쪽 칸(-1)에서 옛 역까지 2km 200m → 걸어갈 역이 없었다.
  assert.equal(got.newPeople, 30);
});

test('둘레: 같은 설계의 다른 새 역이 더 가까우면 그 역 몫이다', () => {
  const zones = [{ x: 1, y: 0, population: 50 }];
  const got = stationSurroundings({
    point: { x: 0, y: 0 },
    zones,
    existing: [],
    others: [{ x: 1, y: 0 }],
    centers: [],
    rules,
  });
  assert.equal(got.walkPeople, 50);
  assert.equal(got.closestPeople, 0);
  assert.equal(got.newPeople, 50);
});

test('둘레: 갈아타는 역처럼 옛 역과 같은 자리면 가장 가까운 역으로 친다', () => {
  const zones = [{ x: 0.5, y: 0, population: 40 }];
  const got = stationSurroundings({ point: { x: 0, y: 0 }, zones, existing: [{ x: 0, y: 0 }], centers: [], rules });
  assert.equal(got.closestPeople, 40);
  assert.equal(got.newPeople, 0);
});

test('둘레: 걸어갈 수 있는 중심지를 가까운 순서로', () => {
  const centers = [
    { name: '먼곳', x: 5, y: 0 },
    { name: '나', x: 1, y: 0 },
    { name: '가', x: 0.5, y: 0 },
  ];
  const got = stationSurroundings({ point: { x: 0, y: 0 }, zones: [], existing: [], centers, rules });
  assert.deepEqual(
    got.places.map((p) => p.name),
    ['가', '나'],
  );
  assert.equal(got.places[0].walkMin, 7.5);
});

test('예상 승객 단계: 다른 역과 견주어 1~5, 없으면 0', () => {
  const refs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(riderLevel(0, refs), 0);
  assert.equal(riderLevel(5, refs), 1);
  assert.equal(riderLevel(15, refs), 1);
  assert.equal(riderLevel(25, refs), 2);
  assert.equal(riderLevel(55, refs), 3);
  assert.equal(riderLevel(95, refs), 5);
  assert.equal(riderLevel(1000, refs), RIDER_LEVELS);
  assert.equal(riderLevel(7, []), 1);
});

test('실제 부산: 하단 서쪽 새 노선의 역 정보가 늘 같고 말이 된다', { skip }, () => {
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
  const cell = (col, row) => row * grid.cols + col;
  // 과제 5처럼 하단 칸에서 서쪽으로 네 칸
  const path = [cell(16, 33), cell(15, 33), cell(14, 33), cell(13, 33), cell(12, 33)];
  const design = { path, stations: [path[0], path[2], path[4]], kind: '경전철', trainsPerHour: 8 };
  const center = (c) => ({ x: (c % grid.cols) + 0.5, y: Math.floor(c / grid.cols) + 0.5 });
  const info = () =>
    design.stations.map((c) =>
      stationSurroundings({
        point: center(c),
        zones: world.zones,
        existing: world.stations,
        others: design.stations.filter((o) => o !== c).map(center),
        centers: world.centers,
        rules: allRules,
      }),
    );
  const first = info();
  assert.deepEqual(info(), first, '같은 입력이면 같은 결과');
  for (const item of first) {
    assert.ok(item.walkPeople > 0);
    assert.ok(item.closestPeople <= item.walkPeople);
    assert.ok(item.newPeople <= item.walkPeople);
  }
  // 하단 칸은 이미 역이 있어서, 원래 걸어갈 역이 없던 사람은 거의 없다.
  assert.equal(first[0].newPeople, 0);

  // 예상 승객 단계는 실제 하루 운행 결과에서 나온다.
  const base = runDay(world, prepareWorld(world, allRules), allRules);
  const next = withDesign(world, design, grid, readJson('src/content/rules.json').tables);
  const after = runDay(next, prepareWorld(next, allRules), allRules);
  const refs = base.stations.map((s) => s.board + s.alight).filter((v) => v > 0);
  for (const c of design.stations) {
    const s = after.stations.find((x) => x.id === `NEW-${c}`);
    const level = riderLevel(s.board + s.alight, refs);
    assert.ok(level >= 1 && level <= RIDER_LEVELS);
  }
});
