// 여행 모드 테스트: 요금(부산 교통카드·택시 요금표)과 가는 길 찾기
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { prepareWorld } from '../src/sim/run.js';
import { planTrips, taxiFare, transitFare } from '../src/sim/trip.js';
import { buildWorld, rulesFromCards } from '../src/sim/world.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const fares = readJson('src/content/fares.json');
const rules = rulesFromCards(readJson('src/content/rules.json').rules);

test('버스·지하철 요금: 교통카드 어른, 갈아타면 비싼 쪽까지, 지하철 2구간은 따로', () => {
  assert.equal(transitFare(fares, { bus: true }), 1550);
  assert.equal(transitFare(fares, { subway: true, subwayKm: 8 }), 1600);
  assert.equal(transitFare(fares, { subway: true, subwayKm: 12 }), 1800);
  // 버스 1,550원 + 지하철 1구간 1,600원 → 1,600원
  assert.equal(transitFare(fares, { bus: true, subway: true, subwayKm: 5 }), 1600);
  // 2구간이면 200원을 더 낸다.
  assert.equal(transitFare(fares, { bus: true, subway: true, subwayKm: 15 }), 1800);
  // 어린이는 교통카드면 무료
  assert.equal(transitFare(fares, { bus: true, subway: true, subwayKm: 15 }, 'child'), 0);
});

test('택시 요금: 기본 2km 4,800원, 132m마다 100원, 밤에는 할증', () => {
  assert.equal(taxiFare(fares, 2, 6, 13), 4800);
  // 3km: 1,000m ÷ 132m → 8번(올림) × 100원
  assert.equal(taxiFare(fares, 3, 8, 13), 4800 + 800);
  // 밤 11시 20%, 새벽 1시 30%
  assert.equal(taxiFare(fares, 2, 6, 23), 5800);
  assert.equal(taxiFare(fares, 2, 6, 1), 6200);
  // 시속 15km 이하면 시간으로: 4km를 30분(8km/h)
  const slow = taxiFare(fares, 4, 30, 13);
  assert.ok(slow > taxiFare(fares, 4, 10, 13));
});

const dataReady = existsSync(resolve(ROOT, 'data/build/grid.json'));

test('실제 부산: 서면에서 해운대까지 길을 견준다', { skip: !dataReady }, () => {
  const world = buildWorld({
    grid: readJson('data/build/grid.json'),
    stations: readJson('data/build/stations.json').stations,
    lines: readJson('data/build/lines.json').lines,
    links: readJson('data/build/links.json').links,
    transfers: readJson('data/build/transfers.json').transfers,
    places: readJson('src/content/places.json').places,
    dongs: readJson('data/build/dongs.json').dongs,
    hourShape: readJson('data/build/ridership.json').shape['평일'],
    defaultHeadwayMin: rules.defaultHeadwayMin,
  });
  const prepared = prepareWorld(world, rules);
  const at = (name, line) => world.stations.find((s) => s.name === name && s.line === line);
  const from = { x: at('서면', '1').x, y: at('서면', '1').y };
  const to = { x: at('해운대', '2').x, y: at('해운대', '2').y };
  const modes = { walk: true, bus: true, subway: true, taxi: true };
  const trips = planTrips({ from, to, hour: 13, modes, rider: 'adult', world, prepared, rules, fares });
  const ids = trips.map((t) => t.id);
  for (const id of ['walk', 'subway', 'bus', 'taxi']) assert.ok(ids.includes(id), id);
  // 빠른 차례, 늘 같은 결과
  for (let i = 1; i < trips.length; i++) assert.ok(trips[i - 1].minutes <= trips[i].minutes);
  assert.deepEqual(planTrips({ from, to, hour: 13, modes, rider: 'adult', world, prepared, rules, fares }), trips);
  const walk = trips.find((t) => t.id === 'walk');
  const subway = trips.find((t) => t.id === 'subway');
  const taxi = trips.find((t) => t.id === 'taxi');
  assert.ok(subway.minutes < walk.minutes, '지하철이 걷기보다 빠르다');
  assert.ok(subway.legs.some((l) => l.mode === '지하철' && l.line === '2'), '2호선을 탄다');
  assert.equal(subway.fare, 1800, '서면–해운대는 10km가 넘어 2구간');
  assert.ok(taxi.fare > subway.fare, '택시가 더 비싸다');
  // 어린이는 버스·지하철이 무료, 택시는 그대로
  const kid = planTrips({ from, to, hour: 13, modes, rider: 'child', world, prepared, rules, fares });
  assert.equal(kid.find((t) => t.id === 'subway').fare, 0);
  assert.equal(kid.find((t) => t.id === 'taxi').fare, taxi.fare);
  // 켜 둔 것만
  const onlyTaxi = planTrips({ from, to, hour: 13, modes: { taxi: true }, world, prepared, rules, fares });
  assert.deepEqual(onlyTaxi.map((t) => t.id), ['taxi']);
});
