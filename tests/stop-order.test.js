// 정류장 차례 어림(scripts/lib/stop-order.mjs) 테스트
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderStops } from '../scripts/lib/stop-order.mjs';

test('곧은 길 위의 정류장은 섞어 넣어도 차례대로 잇는다', () => {
  const line = [0, 1, 2, 3, 4, 5, 6].map((x) => ({ x, y: x * 0.1 }));
  const shuffled = [3, 0, 6, 2, 5, 1, 4].map((i) => line[i]);
  const order = orderStops(shuffled).map((i) => shuffled[i].x);
  assert.ok(
    JSON.stringify(order) === JSON.stringify([0, 1, 2, 3, 4, 5, 6]) || JSON.stringify(order) === JSON.stringify([6, 5, 4, 3, 2, 1, 0]),
    order.join(','),
  );
});

test('ㄱ자로 꺾인 길도 꼬이지 않게 잇는다', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 1 },
    { x: 2, y: 2 },
  ];
  const order = orderStops([points[4], points[0], points[2], points[1], points[3]]);
  const xs = order.map((i) => [points[4], points[0], points[2], points[1], points[3]][i]);
  let length = 0;
  for (let k = 1; k < xs.length; k++) length += Math.hypot(xs[k].x - xs[k - 1].x, xs[k].y - xs[k - 1].y);
  assert.equal(length, 4);
});

test('같은 입력이면 같은 차례', () => {
  const points = Array.from({ length: 20 }, (_, i) => ({ x: (i * 7) % 11, y: (i * 5) % 13 }));
  assert.deepEqual(orderStops(points), orderStops(points));
});
