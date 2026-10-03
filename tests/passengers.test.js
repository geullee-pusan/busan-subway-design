// 승객: 이름, 성별, 나이, 외모, 대사
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = JSON.parse(readFileSync(resolve(ROOT, 'src/content/passengers.json'), 'utf8'));
import * as model from '../src/sim/passengers.js';

const makePerson = (seed, slot, generation) => model.makePerson(file, seed, slot, generation);
const createCrowd = (seed) => model.createCrowd(file, seed);
const talkLines = (person, ctx) => model.talkLines(file, person, ctx);

test('승객: 같은 씨앗과 자리는 같은 사람, 나이는 나이대 안', () => {
  assert.deepEqual(makePerson(42, 3, 0), makePerson(42, 3, 0));
  assert.notDeepEqual(makePerson(42, 3, 0), makePerson(42, 3, 1));
  const range = { 어린이: [5, 12], 청소년: [13, 18], 어른: [19, 64], 어르신: [65, 85] };
  for (let slot = 0; slot < 300; slot++) {
    const p = makePerson(7, slot);
    const [low, high] = range[p.ageGroup];
    assert.ok(p.age >= low && p.age <= high, `${p.ageGroup} ${p.age}`);
    assert.ok(['여자', '남자'].includes(p.gender));
    assert.ok(p.name.length >= 2);
  }
});

test('승객 무리: 역에서 내린 자리와 새로 찬 자리만 사람이 바뀐다', () => {
  const crowd = createCrowd(99);
  const first = [0, 1, 2, 3, 4].map((slot) => crowd.personAt(slot).id);
  // 5명 → 3명: 3, 4번 자리는 내렸다. 내린 비율 0이면 0~2번은 그대로
  crowd.arrive(1, 5, 3, 0);
  assert.deepEqual([0, 1, 2].map((slot) => crowd.personAt(slot).id), first.slice(0, 3));
  // 3명 → 5명: 3, 4번 자리에 새 사람
  crowd.arrive(2, 3, 5, 0);
  assert.notEqual(crowd.personAt(3).id, first[3]);
  // 모두 내리면(비율 1) 모두 바뀐다
  crowd.arrive(3, 5, 5, 1);
  assert.notEqual(crowd.personAt(0).id, first[0]);
});

test('대사: ~요로 끝나는 짧은 문장, 내릴 역을 말한다', () => {
  for (let slot = 0; slot < 100; slot++) {
    const person = makePerson(5, slot);
    for (const ctx of [
      { vehicle: '버스', destination: '부전시장 정류장', terminal: false, crowdRatio: 0.9, hour: 8, newLine: true },
      { vehicle: '열차', destination: null, terminal: true, crowdRatio: 0.1, hour: 22, newLine: false },
    ]) {
      const lines = talkLines(person, ctx);
      assert.ok(lines.length >= 2 && lines.length <= 4);
      for (const line of lines) {
        assert.ok(/[요!?]$|요\.$/.test(line) || /\.$/.test(line), line);
        assert.ok(line.length <= 45, line);
      }
      if (ctx.destination) assert.ok(lines.includes(`${ctx.destination}에서 내려요.`));
    }
  }
  // 재료 문장도 모두 "~요"로 끝나는 말투
  const all = [...Object.values(file.reasons).flat(), ...Object.values(file.lines).flat()];
  for (const line of all) assert.ok(/요[.!?]$|[!?]$/.test(line), line);
});
