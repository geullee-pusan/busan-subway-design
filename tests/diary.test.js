// 여행 일기 계산 테스트(src/sim/diary.js)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendPoint, appendRide, compactTrack, thinPoints, trackBounds } from '../src/sim/diary.js';

test('자취: 같은 종류는 이어 붙이고, 너무 가까운 점은 빼고, 새 조각은 앞 끝에서 시작한다', () => {
  let t = [];
  t = appendPoint(t, '걷기', { x: 0, y: 0 });
  t = appendPoint(t, '걷기', { x: 0.01, y: 0 });
  t = appendPoint(t, '걷기', { x: 0.1, y: 0 });
  assert.deepEqual(t, [{ kind: '걷기', pts: [[0, 0], [0.1, 0]] }]);
  t = appendRide(t, '지하철', [[0.1, 0], [2, 1]]);
  t = appendPoint(t, '걷기', { x: 2.1, y: 1 });
  assert.equal(t.length, 3);
  assert.deepEqual(t[2].pts, [[2, 1], [2.1, 1]]);
});

test('점 줄이기: 처음과 끝은 남기고 개수를 맞춘다', () => {
  const pts = Array.from({ length: 101 }, (_, i) => [i, 0]);
  const thin = thinPoints(pts, 11);
  assert.equal(thin.length, 11);
  assert.deepEqual(thin[0], [0, 0]);
  assert.deepEqual(thin.at(-1), [100, 0]);
  const big = [{ kind: '걷기', pts }, { kind: '버스', pts }];
  const small = compactTrack(big, 50);
  assert.ok(small.reduce((s, seg) => s + seg.pts.length, 0) <= 50);
});

test('범위: 자취와 랜드마크를 모두 담고 너무 좁으면 넓힌다', () => {
  const b = trackBounds([{ kind: '걷기', pts: [[1, 1], [3, 2]] }], [{ x: 4, y: 5 }]);
  assert.ok(b.x0 < 1 && b.x1 > 4 && b.y0 < 1 && b.y1 > 5);
  const tiny = trackBounds([{ kind: '걷기', pts: [[1, 1], [1.01, 1]] }]);
  assert.ok(tiny.x1 - tiny.x0 >= 0.6 && tiny.y1 - tiny.y0 >= 0.6);
  assert.equal(trackBounds([]), null);
});
