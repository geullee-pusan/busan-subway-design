// 주민 목소리 카드 테스트(docs/SPEC.md 8장, Phase 5)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { residentVoices } from '../src/sim/voices.js';
import { rulesFromCards } from '../src/sim/world.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rules = rulesFromCards(JSON.parse(readFileSync(resolve(ROOT, 'src/content/rules.json'), 'utf8')).rules);

// 6 × 4칸 연습 격자. 가운데 줄(행 1)에 노선을 긋는다.
// 행 0: 사람이 많은 동네가 죽 늘어서 있다.
const grid = {
  cols: 6,
  rows: 4,
  cellSizeM: 1000,
  terrain: [
    ['flat', 'flat', 'flat', 'flat', 'flat', 'flat'],
    ['field', 'field', 'field', 'field', 'field', 'field'],
    ['flat', 'flat', 'flat', 'flat', 'flat', 'flat'],
    ['flat', 'flat', 'flat', 'flat', 'flat', 'flat'],
  ],
  population: [
    [5000, 5000, 5000, 5000, 5000, 5000],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
  ],
};
// 행 1의 여섯 칸(6~11). 양 끝에만 역을 둔다.
const path = [6, 7, 8, 9, 10, 11];

test('들판 위 노선이 사람 많은 동네 옆을 지나면 소음 카드가 나온다', () => {
  const voices = residentVoices({
    design: { path, stations: [6, 11] },
    grid,
    existingStations: [],
    rules,
  });
  const noise = voices.find((v) => v.id === 'noise');
  assert.ok(noise, '소음 카드가 있어야 한다');
  assert.equal(noise.people, 30000); // 행 0의 여섯 칸
  assert.match(noise.text, /소음/);
});

test('노선은 지나가는데 역이 멀면 역을 놓아 달라는 카드가 나온다', () => {
  const voices = residentVoices({
    design: { path, stations: [6, 11] },
    grid,
    existingStations: [],
    rules,
  });
  const ask = voices.find((v) => v.id === 'no-station');
  assert.ok(ask, '역 요청 카드가 있어야 한다');
  // 역 바로 위 칸(열 0, 5)만 한 칸 안이다. 나머지 네 칸은 걸어가기 멀다.
  assert.equal(ask.people, 20000);
});

test('모든 칸에 역을 놓으면 역 요청 카드는 사라지고 너무 자주 선다는 카드가 나온다', () => {
  const voices = residentVoices({
    design: { path, stations: path },
    grid,
    existingStations: [],
    rules,
  });
  assert.equal(
    voices.find((v) => v.id === 'no-station'),
    undefined,
  );
  assert.ok(voices.find((v) => v.id === 'too-close'));
});

test('이미 있는 역 자리에 역을 놓으면 갈아타기 카드가 나온다', () => {
  const voices = residentVoices({
    design: { path, stations: [6, 11] },
    grid,
    existingStations: [{ col: 0, row: 1 }],
    rules,
  });
  const transfer = voices.find((v) => v.id === 'transfer');
  assert.ok(transfer);
  assert.equal(transfer.people, 5000); // 역 칸과 그 둘레 가운데 사람이 사는 칸은 행 0의 한 칸
});

test('카드는 세 장까지만, 사람이 많은 순서로 나온다', () => {
  const voices = residentVoices({
    design: { path, stations: [6, 7, 11] },
    grid,
    existingStations: [{ col: 0, row: 1 }],
    rules,
  });
  assert.ok(voices.length <= 3);
  for (let i = 0; i + 1 < voices.length; i++) {
    assert.ok(voices[i].people >= voices[i + 1].people, '사람이 많은 순서여야 한다');
  }
});

test('같은 설계는 늘 같은 카드를 낸다', () => {
  const design = { path, stations: [6, 9, 11] };
  const once = residentVoices({ design, grid, existingStations: [{ col: 5, row: 1 }], rules });
  const twice = residentVoices({ design, grid, existingStations: [{ col: 5, row: 1 }], rules });
  assert.deepEqual(once, twice);
});

test('노선을 긋지 않으면 카드가 없다', () => {
  assert.deepEqual(residentVoices({ design: { path: [], stations: [] }, grid, existingStations: [], rules }), []);
});

test('모든 카드에는 아이 말 문장과 까닭이 있다', () => {
  const voices = residentVoices({
    design: { path, stations: [6, 7, 11] },
    grid,
    existingStations: [{ col: 0, row: 1 }],
    rules,
  });
  assert.ok(voices.length > 0);
  for (const voice of voices) {
    assert.match(voice.text, /(요|에요)\.$/, `"${voice.text}"는 ~해요체여야 한다`);
    assert.ok(voice.why.length > 0);
    assert.ok(Number.isFinite(voice.people));
  }
});
