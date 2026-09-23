// 역 안과 승강장: 방향, 끝 역, 안내음 방향, 승강장 소리 자료
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chimeSide, platformInfo } from '../src/sim/platform.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const soundsPath = resolve(ROOT, 'data/build/station-sounds.json');

test('승강장 방향: 다음 역 쪽 끝 역, 지나온 쪽 역, 표지판 양쪽', () => {
  const stops = ['a', 'b', 'c', 'd'];
  const down = platformInfo(stops, 'b', 'c');
  assert.equal(down.direction, 1);
  assert.equal(down.terminusId, 'd');
  assert.equal(down.prevId, 'a');
  assert.deepEqual(down.sides, [
    { toward: 'a', next: 'a' },
    { toward: 'd', next: 'c' },
  ]);
  const up = platformInfo(stops, 'c', 'b');
  assert.equal(up.terminusId, 'a');
  assert.equal(up.prevId, 'd');
  // 끝 역에서는 표지판에 한쪽만 있다.
  assert.equal(platformInfo(stops, 'a', 'b').sides.length, 1);
  assert.equal(platformInfo(stops, 'a', 'b').prevId, null);
  assert.equal(platformInfo(stops, 'a', 'x'), null);
});

test('열차진입 안내음: 하행 끝 역으로 가면 하행, 아니면 상행, 자료 없는 노선은 없음', () => {
  const downEnds = { 1: '다대포해수욕장' };
  assert.equal(chimeSide(downEnds, '1', '다대포해수욕장'), 'down');
  assert.equal(chimeSide(downEnds, '1', '노포'), 'up');
  assert.equal(chimeSide(downEnds, 'DH', '태화강'), null);
});

test('승강장 소리 자료: 안내음 둘, 1~4호선 끝 역 진입 방송 여덟(한국어, 영어), 모두 MP3', { skip: existsSync(soundsPath) ? false : 'npm run station-sounds를 먼저 돌려요' }, () => {
  const sounds = JSON.parse(readFileSync(soundsPath, 'utf8'));
  const isMp3 = (base64) => Buffer.from(base64.slice(0, 8), 'base64').subarray(0, 3).toString('latin1') === 'ID3';
  assert.ok(isMp3(sounds.chimes.up) && isMp3(sounds.chimes.down));
  assert.deepEqual(Object.keys(sounds.approach).sort(), ['1|노포', '1|다대포해수욕장', '2|양산', '2|장산', '3|대저', '3|수영', '4|미남', '4|안평']);
  assert.ok(Object.values(sounds.approach).every(isMp3));
  // 영어 방송도 같은 여덟 행선지
  assert.deepEqual(Object.keys(sounds.approachEnglish).sort(), Object.keys(sounds.approach).sort());
  assert.ok(Object.values(sounds.approachEnglish).every(isMp3));
  assert.deepEqual(Object.keys(sounds.downEnds).sort(), ['1', '2', '3', '4']);
});
