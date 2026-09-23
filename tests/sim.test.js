// 이동 모델 테스트: 결정론, 성능, 경로, 탑승 규칙, 보정 목표(docs/SPEC.md 5.5, 5.6, 11장)
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { compareToReal, meetsTargets, ranks, spearman } from '../src/sim/compare.js';
import { boardingShare, busMinutes, centerWeight } from '../src/sim/demand.js';
import { allShortestTimes, buildRailGraph, pathBetween } from '../src/sim/rail.js';
import { prepareWorld, runDay } from '../src/sim/run.js';
import { nearbyStations, straightKm, walkMinutes } from '../src/sim/walk.js';
import { buildBusNetwork, withBusTimes } from '../src/sim/bus-network.js';
import { buildWorld, rulesFromCards } from '../src/sim/world.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const dataReady = ['data/build/grid.json', 'data/build/ridership.json', 'data/build/dongs.json', 'data/build/bus.json'].every((p) =>
  existsSync(resolve(ROOT, p)),
);
const skip = dataReady ? false : 'npm run data를 먼저 돌려요';

const smallRules = {
  walkSpeedKmh: 4,
  walkHill: 1.5,
  walkDetour: 1.3,
  walkMaxMin: 25,
  accessStations: 3,
  transferWalkMin: 3,
  boardBase: 0.05,
  boardSlope: 0.035,
  boardMax: 0.8,
  busWaitMin: 6,
  busSpeedCityKmh: 17,
  busSpeedOuterKmh: 26,
  decayKm: 3,
  centerPower: 1,
};

test('걷기: 시속 4km, 언덕은 1.5배', () => {
  assert.equal(walkMinutes(1, smallRules), 15);
  assert.equal(walkMinutes(1, smallRules, true), 22.5);
  assert.equal(straightKm({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('걷기: 너무 먼 역은 빼고, 가까운 역 3개만 고른다', () => {
  const stations = [
    { id: 'a', x: 0.2, y: 0 },
    { id: 'b', x: 0.5, y: 0 },
    { id: 'c', x: 1, y: 0 },
    { id: 'd', x: 1.2, y: 0 },
    { id: 'far', x: 9, y: 0 },
  ];
  const found = nearbyStations({ x: 0, y: 0 }, stations, smallRules);
  assert.deepEqual(
    found.map((f) => f.station.id),
    ['a', 'b', 'c'],
  );
  assert.ok(found[0].walkMin < found[1].walkMin);
});

test('버스: 곧은 거리 × 1.3 ÷ 속도 + 기다리는 시간', () => {
  assert.equal(Math.round(busMinutes(10, smallRules)), 6 + Math.round(((10 * 1.3) / 17) * 60));
  assert.ok(busMinutes(10, smallRules, true) < busMinutes(10, smallRules));
});

test('탑승 규칙: 10분 빠르면 10명 중 4명, 0과 0.8 사이로 자른다', () => {
  assert.equal(Math.round(boardingShare(30, 20, smallRules) * 100) / 100, 0.4);
  assert.equal(boardingShare(20, 30, smallRules), 0);
  assert.equal(boardingShare(100, 10, smallRules), 0.8);
});

test('중력 모델: 크면 많이, 멀면 적게', () => {
  const big = { size: 5 };
  const small = { size: 2 };
  assert.ok(centerWeight(big, 5, smallRules) > centerWeight(small, 5, smallRules));
  assert.ok(centerWeight(big, 10, smallRules) < centerWeight(big, 5, smallRules));
});

test('도시철도 경로: 갈아타기보다 곧장 가는 길이 빠르면 그 길을 고른다', () => {
  const stations = [
    { id: 'A1', line: '1' },
    { id: 'B1', line: '1' },
    { id: 'C1', line: '1' },
    { id: 'B2', line: '2' },
    { id: 'D2', line: '2' },
  ];
  const links = [
    { line: '1', from: 'A1', to: 'B1', runS: 120 },
    { line: '1', from: 'B1', to: 'C1', runS: 120 },
    { line: '2', from: 'B2', to: 'D2', runS: 120 },
  ];
  const transfers = [{ id: 'T', stations: ['B1', 'B2'] }];
  const lineInfo = { 1: { dwellS: 30, headwayMin: 6 }, 2: { dwellS: 30, headwayMin: 10 } };
  const graph = buildRailGraph(stations, links, transfers, lineInfo, smallRules);
  const shortest = allShortestTimes(graph);
  const n = stations.length;
  const acToC = shortest.times[0 * n + 2];
  assert.equal(Math.round(acToC * 100) / 100, 5); // (2분 + 30초 정차) × 2
  const aToD = shortest.times[0 * n + 4];
  assert.equal(Math.round(aToD * 100) / 100, 2.5 + 3 + 5 + 2.5); // 타고 + 걷기 + 기다리기 + 타고
  assert.deepEqual(pathBetween(shortest, 0, 4), [0, 1, 3, 4]);
});

test('순위 상관: 같은 순서면 1, 뒤집으면 -1', () => {
  assert.deepEqual(ranks([10, 30, 20]), [3, 1, 2]);
  assert.equal(spearman([1, 2, 3], [10, 20, 30]), 1);
  assert.equal(spearman([1, 2, 3], [30, 20, 10]), -1);
});

// --- 실제 자료로 돌리는 시험 ---

/** @param {{year?: number}} options 2027년이면 양산선과 사상–하단선을 더한다. */
function loadWorld({ year = 2026, dayType = '평일' } = {}) {
  const rules = rulesFromCards(readJson('src/content/rules.json').rules);
  const future = year >= 2027 ? readJson('data/build/future-lines.json') : { stations: [], lines: [], links: [], transfers: [] };
  const stations = [...readJson('data/build/stations.json').stations, ...future.stations];
  const grid = readJson('data/build/grid.json');
  const plainWorld = buildWorld({
    grid,
    stations,
    lines: [...readJson('data/build/lines.json').lines, ...future.lines],
    links: [...readJson('data/build/links.json').links, ...future.links],
    transfers: [...readJson('data/build/transfers.json').transfers, ...future.transfers],
    places: readJson('src/content/places.json').places,
    dongs: readJson('data/build/dongs.json').dongs,
    hourShape: readJson('data/build/ridership.json').shape[dayType],
    defaultHeadwayMin: rules.defaultHeadwayMin,
  });
  // 게임과 같이 실제 시내버스 노선으로 버스 시간을 찾는다.
  const world = withBusTimes(plainWorld, buildBusNetwork(readJson('data/build/bus.json'), grid, rules), rules);
  return { world, rules, stations };
}

test('결정론: 같은 입력을 두 번 돌리면 결과가 완전히 같다', { skip }, () => {
  const { world, rules } = loadWorld();
  const run = () => JSON.stringify(runDay(world, prepareWorld(world, rules), rules));
  assert.equal(run(), run());
});

test('기준 연도: 2027년 부산에는 앞으로 생길 노선이 들어 있다', { skip }, () => {
  const now = loadWorld();
  const later = loadWorld({ year: 2027 });
  const newLines = later.world.lines.filter((line) => !now.world.lines.some((old) => old.id === line.id));
  assert.deepEqual(
    newLines.map((line) => line.id),
    ['YS', 'SH'],
  );
  assert.equal(later.stations.length, now.stations.length + 14);
  // 노포역에서 양산선으로 갈아탈 수 있어야 한다.
  const transfer = later.world.transfers.find((t) => t.stations.includes('YS-노포'));
  assert.ok(transfer && transfer.stations.includes('134'));
});

test('기준 연도: 2027년을 두 번 돌려도 같은 값이 나온다', { skip }, () => {
  const { world, rules } = loadWorld({ year: 2027 });
  const run = () => JSON.stringify(runDay(world, prepareWorld(world, rules), rules));
  assert.equal(run(), run());
});

test('기준 연도: 양산선이 생기면 양산 쪽 사람들이 도시철도를 더 탄다', { skip }, () => {
  const now = loadWorld();
  const later = loadWorld({ year: 2027 });
  const trips = ({ world, rules }) => runDay(world, prepareWorld(world, rules), rules).totals.railTrips;
  assert.ok(trips(later) > trips(now), '2027년에 도시철도를 타는 사람이 더 많아야 한다');
});

test('요일: 토요일은 시간대 모양이 달라도 늘 같은 결과를 낸다(과제 6)', { skip }, () => {
  const saturday = loadWorld({ dayType: '토요일' });
  const run = (w) => runDay(w.world, prepareWorld(w.world, w.rules), w.rules);
  const once = JSON.stringify(run(saturday));
  assert.equal(once, JSON.stringify(run(saturday)));
  const weekday = JSON.stringify(run(loadWorld()));
  assert.notEqual(once, weekday, '토요일과 평일 결과가 같으면 요일 자료를 안 쓰고 있다');
});

test('성능: 하루 돌리기가 1초 안에 끝난다', { skip }, () => {
  const { world, rules } = loadWorld();
  const start = performance.now();
  const prepared = prepareWorld(world, rules);
  const result = runDay(world, prepared, rules);
  const elapsed = performance.now() - start;
  assert.ok(result.totals.railTrips > 0);
  assert.ok(elapsed < 1000, `${elapsed.toFixed(0)}ms 걸렸어요`);
});

test('보정 목표: 총이용객 ±15%, 순위 상관 0.6 이상, 상위 10개 중 6개 이상', { skip }, () => {
  const { world, rules, stations } = loadWorld();
  const ridership = readJson('data/build/ridership.json');
  const real = {};
  for (const [id, station] of Object.entries(ridership.stations)) {
    if (station['평일']) real[id] = station['평일'].board + station['평일'].alight;
  }
  const result = runDay(world, prepareWorld(world, rules), rules);
  const comparison = compareToReal(result.stations, real, world.transfers, Object.fromEntries(stations.map((s) => [s.id, s.name])));
  const targets = meetsTargets(comparison);
  assert.ok(targets.total, `총이용객 차이 ${comparison.totals.diffPercent.toFixed(1)}%`);
  assert.ok(targets.spearman, `순위 상관 ${comparison.spearman.toFixed(3)}`);
  assert.ok(targets.topMatch, `상위 10개 중 ${comparison.topMatch.matched}개`);
});

test('붐빔: 가장 붐비는 구간이 나오고, 정원이 있는 노선은 비율이 나온다', { skip }, () => {
  const { world, rules } = loadWorld();
  const result = runDay(world, prepareWorld(world, rules), rules);
  const withRatio = result.crowding.filter((c) => c.ratio !== null);
  assert.ok(withRatio.length > 0);
  const worst = withRatio.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  assert.ok(worst.peopleAtPeak > 0 && worst.ratio > 0);
  assert.equal(result.byHour.length, 24);
  const hourSum = result.byHour.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(hourSum - result.totals.board) / result.totals.board < 0.01);
});
