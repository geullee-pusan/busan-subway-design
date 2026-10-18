// 기차 길 찾기·기차 타기 계산 테스트(src/sim/train-trip.js, src/sim/train-ride.js). 작은 가짜 자료로 본다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { directTrains, trainFare, trainGroup, trainTrips } from '../src/sim/train-trip.js';
import { railPathBetween, seatFor, segmentScenes, speedProfile } from '../src/sim/train-ride.js';

const rail = {
  stations: [
    { id: 'A', name: '가', x: 0, y: 0 },
    { id: 'B', name: '나', x: 20, y: 0 },
    { id: 'C', name: '다', x: 40, y: 0 },
  ],
  lines: [
    {
      id: 'L',
      stations: ['A', 'B', 'C'],
      links: [
        { from: 'A', to: 'B', km: 21 },
        { from: 'B', to: 'C', km: 22 },
      ],
      paths: [
        [
          [0, 0],
          [1000, 0],
          [2000, 0],
        ],
        [
          [2000, 0],
          [4000, 0],
        ],
      ],
    },
  ],
};

const trains = [
  { no: 101, kind: 'KTX', stops: [['A', null, 500], ['C', 530, null]] },
  { no: 1201, kind: '무궁화호', stops: [['A', null, 490], ['B', 520, 521], ['C', 560, null]] },
  { no: 103, kind: 'KTX-산천', stops: [['A', null, 600], ['C', 630, null]] },
  { no: 102, kind: 'KTX', stops: [['C', null, 500], ['A', 530, null]] },
];

const fareTable = {
  'A|C': { byTrain: { 101: 8400 }, byKind: { KTX: 8400, 'KTX-산천': 8400, 무궁화호: 4800 } },
};

// 걷기만 하는 가짜 길: 1km에 15분
const access = (a, b) => {
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  return { legs: [{ mode: '걷기', minutes: d * 15 }], minutes: d * 15, fare: 0 };
};

test('고속열차와 일반열차를 나눈다', () => {
  assert.equal(trainGroup('KTX-청룡'), '고속');
  assert.equal(trainGroup('KTX-이음'), '고속');
  assert.equal(trainGroup('ITX-마음'), '일반');
  assert.equal(trainGroup('무궁화호'), '일반');
});

test('바로 가는 열차는 방향과 떠나는 시각을 지키고, 일찍 닿는 차례로 나온다', () => {
  const out = directTrains(trains, 'A', 'C', 480);
  assert.deepEqual(
    out.map((o) => o.train.no),
    [101, 1201, 103],
  );
  assert.deepEqual(
    directTrains(trains, 'A', 'C', 495).map((o) => o.train.no),
    [101, 103],
  );
  assert.deepEqual(
    directTrains(trains, 'C', 'A', 0).map((o) => o.train.no),
    [102],
  );
});

test('운임: 열차번호 값, 없으면 종류 값, 어린이는 절반(100원 밑 버림), 모르면 null', () => {
  assert.equal(trainFare(fareTable, 'A', 'C', trains[0]), 8400);
  assert.equal(trainFare(fareTable, 'A', 'C', trains[1]), 4800);
  assert.equal(trainFare(fareTable, 'A', 'C', trains[0], 'child'), 4200);
  assert.equal(trainFare({ 'A|C': { byTrain: { 9: 8450 } } }, 'A', 'C', { no: 9 }, 'child'), 4200);
  assert.equal(trainFare(fareTable, 'C', 'A', trains[3]), null);
});

test('기차 길: 고속 하나, 일반 하나를 찾고, 걷기와 기차 구간을 잇는다', () => {
  const p = { from: { x: 0.2, y: 0 }, to: { x: 40.2, y: 0 }, hour: 8, rail, trains, fareTable, access };
  const trips = trainTrips(p);
  assert.equal(trips.length, 2);
  const fast = trips.find((t) => t.group === '고속');
  const train = fast.legs.find((l) => l.mode === '기차');
  assert.equal(train.train, 101);
  assert.equal(train.meters, 43000);
  assert.equal(train.fare, 8400);
  assert.equal(fast.legs[0].toRail, 'A');
  assert.equal(fast.legs.at(-1).fromRail, 'C');
  // 같은 입력이면 같은 결과
  assert.deepEqual(trainTrips(p), trips);
  // 가까우면 기차 길을 찾지 않는다
  assert.deepEqual(trainTrips({ ...p, to: { x: 3, y: 0 } }), []);
});

test('선로 모양은 두 역 사이 토막을 잇고, 거꾸로 가면 뒤집는다', () => {
  const path = railPathBetween(rail, 'A', 'C');
  assert.equal(path.km, 43);
  assert.deepEqual(path.points, [
    [0, 0],
    [10, 0],
    [20, 0],
    [40, 0],
  ]);
  assert.deepEqual(railPathBetween(rail, 'C', 'B').points, [
    [40, 0],
    [20, 0],
  ]);
  assert.equal(railPathBetween(rail, 'A', 'Z'), null);
});

test('빠르기: 출발·도착에서 0, 최고속도를 넘지 않는다', () => {
  const v = speedProfile(100, 30, 300);
  assert.equal(v(0), 0);
  assert.equal(v(1), 0);
  assert.ok(Math.abs(v(0.5) - 200 / 0.75) < 1e-9);
  assert.equal(speedProfile(100, 10, 300)(0.5), 300);
});

test('자리는 열차번호로 늘 같고, 칸 수 안에 있다', () => {
  for (const no of [1, 101, 1201, 4567]) {
    const a = seatFor({ no }, 20, true);
    assert.deepEqual(seatFor({ no }, 20, true), a);
    assert.ok(a.car >= 1 && a.car <= 18);
    assert.match(a.seat, /^\d+[ABCD]$/);
  }
  assert.equal(seatFor({ no: 5 }, 8, false).reverse, false);
});

test('풍경: 바다·강·도시·들, 고속열차는 산을 터널로 지난다', () => {
  const grid = {
    cols: 4,
    rows: 1,
    terrain: [['flat', 'mountain', 'river', 'sea']],
    population: [[5000, 0, 0, 0]],
  };
  const a = { x: 0.1, y: 0.5 };
  const b = { x: 3.9, y: 0.5 };
  assert.deepEqual(segmentScenes(grid, a, b, '고속'), ['city', 'tunnel', 'river', 'sea']);
  assert.deepEqual(segmentScenes(grid, a, b, '일반'), ['city', 'mountain', 'river', 'sea']);
});
