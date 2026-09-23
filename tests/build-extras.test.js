// Phase 1에서 더한 가공(개통일, 노선도 좌표, 구·군 경계)의 작은 함수들
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simplify } from '../scripts/build/districts.mjs';
import { buildSchematic } from '../scripts/build/schematic.mjs';
import { openingOf } from '../scripts/build/station-info.mjs';

const line = { stations: ['가', '나', '다', '라', '마'] };
const openings = [
  { date: '2000-01-01', from: '나', to: '마' },
  { date: '2010-05-05', from: '가', to: '가' },
  { date: '2020-09-09', from: '다', to: '다' },
];

test('개통일: 역이 든 구간을 찾는다', () => {
  assert.equal(openingOf(line, '나', openings).date, '2000-01-01');
  assert.equal(openingOf(line, '가', openings).date, '2010-05-05');
  assert.equal(openingOf(line, '없는역', openings), null);
});

test('개통일: 구간이 겹치면 좁은 구간이 이긴다(나중에 따로 연 역)', () => {
  assert.equal(openingOf(line, '다', openings).date, '2020-09-09');
});

test('노선도 좌표: 환승역과 종점은 실제 자리, 그 사이는 고른 간격', () => {
  const stations = [
    { id: 'a', x: 0, y: 0, transfer: null },
    { id: 'b', x: 3, y: 1, transfer: null },
    { id: 'c', x: 4, y: 4, transfer: 'T1' },
    { id: 'd', x: 6, y: 6, transfer: null },
  ];
  const lines = [{ id: '1', stations: ['a', 'b', 'c', 'd'] }];
  const { positions, anchors } = buildSchematic(lines, stations);
  assert.deepEqual(anchors, ['a', 'c', 'd']);
  assert.deepEqual(positions.a, { x: 0, y: 0 });
  assert.deepEqual(positions.c, { x: 4, y: 4 });
  assert.deepEqual(positions.b, { x: 2, y: 2 }); // a와 c의 가운데
  assert.deepEqual(positions.d, { x: 6, y: 6 });
});

test('선 줄이기: 곧은 선은 두 점만 남는다', () => {
  const points = [
    [0, 0],
    [1, 0.01],
    [2, 0],
    [3, 0],
  ];
  assert.deepEqual(simplify(points, 0.1), [
    [0, 0],
    [3, 0],
  ]);
  assert.equal(simplify(points, 0.001).length, 4);
});
