// 데이터 가공 도구(scripts/lib, scripts/build)의 작은 함수들
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allocateInteger } from '../scripts/build/grid.mjs';
import { displayName, normalizeName, parseMinSec } from '../scripts/build/network.mjs';
import { formatMinutes, toMinutes } from '../scripts/build/service.mjs';
import { decodeText, parseCsv } from '../scripts/lib/csv.mjs';
import { assembleRings, pointInRings, ringArea } from '../scripts/lib/geo.mjs';

test('CSV: 따옴표 안의 쉼표·줄바꿈·겹따옴표를 지킨다', () => {
  const rows = parseCsv('a,b\r\n"1,2","줄\n바꿈"\r\n"그는 ""안녕""",x\n');
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['1,2', '줄\n바꿈'],
    ['그는 "안녕"', 'x'],
  ]);
});

test('CSV: 첫 줄에 탭이 많으면 탭으로 나눈다', () => {
  assert.deepEqual(parseCsv('역\t노선\n서면\t1\n'), [
    ['역', '노선'],
    ['서면', '1'],
  ]);
});

test('인코딩: BOM, UTF-16, EUC-KR을 알아본다', () => {
  assert.deepEqual(decodeText(Buffer.from([0xef, 0xbb, 0xbf, 0x61])), { text: 'a', encoding: 'utf-8 (BOM)' });
  assert.deepEqual(decodeText(Buffer.from([0xff, 0xfe, 0x00, 0xac])), { text: '가', encoding: 'utf-16le (BOM)' });
  assert.deepEqual(decodeText(Buffer.from([0xb0, 0xa1])), { text: '가', encoding: 'euc-kr' });
  assert.equal(decodeText(Buffer.from('부산', 'utf8')).encoding, 'utf-8');
});

test('역 이름: 비교용 이름과 화면용 이름', () => {
  assert.equal(normalizeName('서면역(1호선)'), '서면');
  assert.equal(normalizeName('경성대.부경대'), normalizeName('경성대·부경대'));
  assert.equal(normalizeName('하단(부산본병원)'), '하단');
  assert.equal(displayName('국제금융센터.부산은행'), '국제금융센터·부산은행');
  assert.equal(parseMinSec('02:15'), 135);
});

test('시각: 새벽 3시 전은 다음 날로 본다', () => {
  assert.equal(toMinutes('05:08'), 308);
  assert.equal(toMinutes('00:10'), 1450);
  assert.equal(toMinutes(':'), null);
  assert.equal(formatMinutes(1450), '00:10');
});

test('인구 나누기: 합계가 정확히 맞고, 같은 입력은 같은 결과', () => {
  const weights = new Map([
    [3, 1],
    [1, 1],
    [2, 1],
  ]);
  const a = allocateInteger(10, weights);
  assert.equal([...a.values()].reduce((s, n) => s + n, 0), 10);
  assert.deepEqual([...a.entries()].sort(), [
    [1, 4],
    [2, 3],
    [3, 3],
  ]); // 나머지 1명은 칸 번호가 작은 쪽
  assert.deepEqual(allocateInteger(10, weights), a);
  assert.equal(allocateInteger(5, new Map()).size, 0);
});

test('다각형: 조각 이어 붙이기, 넓이, 구멍 안의 점', () => {
  const rings = assembleRings([
    [
      [0, 0],
      [4, 0],
    ],
    [
      [4, 4],
      [4, 0],
    ],
    [
      [4, 4],
      [0, 4],
      [0, 0],
    ],
  ]);
  assert.equal(rings.length, 1);
  assert.equal(rings[0].closed, true);
  const outer = Float64Array.from(rings[0].coords.flat());
  assert.equal(ringArea(outer), 16);
  const hole = Float64Array.from([1, 1, 3, 1, 3, 3, 1, 3, 1, 1]);
  assert.equal(pointInRings(0.5, 0.5, [outer, hole]), true);
  assert.equal(pointInRings(2, 2, [outer, hole]), false);
  assert.equal(pointInRings(5, 2, [outer, hole]), false);
});
