// 시승 모드 테스트: 열차 한 대의 사람 수, 타고 내린 사람, 창밖 모습
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crowdWord, rideTrip, windowScene } from '../src/sim/ride.js';

const stops = [
  { id: 'A', name: '가' },
  { id: 'B', name: '나' },
  { id: 'C', name: '다' },
  { id: 'D', name: '라' },
];
const links = [
  { from: 'A', to: 'B', people: 8000, runS: 120 },
  { from: 'B', to: 'C', people: 12000, runS: 150 },
  { from: 'C', to: 'D', people: 4000, runS: 90 },
];
const stations = [
  { id: 'A', board: 4000, alight: 4000 },
  { id: 'B', board: 3000, alight: 3000 },
  { id: 'C', board: 5000, alight: 5000 },
  { id: 'D', board: 2000, alight: 2000 },
];
// 그 시간대가 하루의 10%, 한 시간에 열차 10대 → 한 대 몫은 하루의 1%
const base = { stops, links, stations, hourShare: 0.1, trainsPerHour: 10, capacity: 100 };

test('시승: 구간 사람 수는 한 방향(절반)을 열차 한 대 몫으로 나눈다', () => {
  const trip = rideTrip(base);
  assert.deepEqual(
    trip.stops.map((s) => s.load),
    [40, 60, 20, 0],
  );
  assert.deepEqual(
    trip.stops.map((s) => s.runS),
    [120, 150, 90, null],
  );
  assert.equal(trip.stops[1].ratio, 0.6);
});

test('시승: 탄 사람 − 내린 사람 = 늘어난 사람, 첫 역에서는 내리지 않고 끝 역에서는 타지 않는다', () => {
  for (const direction of [1, -1]) {
    const trip = rideTrip({ ...base, direction });
    let inside = 0;
    for (const stop of trip.stops) {
      assert.ok(stop.on >= 0 && stop.off >= 0);
      assert.ok(stop.off <= inside, '타고 있던 사람보다 많이 내리지 않는다');
      inside += stop.on - stop.off;
      assert.equal(inside, stop.load);
    }
    assert.equal(trip.stops[0].off, 0);
    assert.equal(trip.stops.at(-1).on, 0);
    assert.equal(trip.stops.at(-1).load, 0);
  }
});

test('시승: 상행은 역 차례가 거꾸로이고 구간 사람 수는 같다', () => {
  const down = rideTrip(base);
  const up = rideTrip({ ...base, direction: -1 });
  assert.deepEqual(
    up.stops.map((s) => s.name),
    ['라', '다', '나', '가'],
  );
  assert.deepEqual(
    up.stops.slice(0, -1).map((s) => s.load),
    down.stops.slice(0, -1).map((s) => s.load).reverse(),
  );
});

test('시승: 중간 역에서는 내리는 사람과 타는 사람이 함께 있다', () => {
  const trip = rideTrip(base);
  // 나역: 하루 6000명 → 한 방향·한 가지 1500명 → 한 대 15명 안팎
  assert.ok(trip.stops[1].on > 0 && trip.stops[1].off > 0);
});

test('시승: 늘 같은 결과, 열차가 없으면 아무도 없다', () => {
  assert.deepEqual(rideTrip(base), rideTrip(base));
  const empty = rideTrip({ ...base, hourShare: 0 });
  assert.ok(empty.stops.every((s) => s.load === 0 && s.on === 0 && s.off === 0));
});

test('붐빔 말과 창밖 모습', () => {
  assert.equal(crowdWord(0), '아무도 없어요');
  assert.equal(crowdWord(0.2), '앉을 자리가 있어요');
  assert.equal(crowdWord(0.5), '서서 가는 사람이 있어요');
  assert.equal(crowdWord(0.9), '붐벼요');
  assert.equal(crowdWord(1.3), '아주 붐벼요');
  assert.equal(windowScene(['flat', 'flat']), '땅속');
  assert.equal(windowScene(['flat', 'river', 'flat']), '강 위 다리');
  assert.equal(windowScene(['flat', 'sea', 'river']), '바다 밑');
  assert.equal(windowScene(['field', 'field', 'flat']), '높은 다리');
});
