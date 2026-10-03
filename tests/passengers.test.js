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
const createCrowd = (seed, route) => model.createCrowd(file, seed, route);
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

test('승객 무리: 내릴 정류장은 탈 때 정해져 바뀌지 않고, 그 정류장에서 내린다', () => {
  const crowd = createCrowd(99, { startStop: 0, lastStop: 10 });
  const people = Array.from({ length: 8 }, (_, slot) => crowd.personAt(slot));
  for (const p of people) assert.ok(p.alightStop >= 1 && p.alightStop <= 10, String(p.alightStop));
  // 정류장을 하나씩 지나도 아직 안 내린 사람은 같은 사람이고, 내릴 정류장도 같다.
  for (let stop = 1; stop <= 10; stop++) {
    crowd.arrive(stop, 8, 8);
    for (const [slot, p] of people.entries()) {
      const now = crowd.personAt(slot);
      if (p.alightStop > stop) {
        assert.equal(now.id, p.id);
        assert.equal(now.alightStop, p.alightStop);
      } else {
        assert.notEqual(now.id, p.id);
      }
    }
  }
  // 그림 수가 줄면 뒤 자리 사람은 내린다.
  const fewer = createCrowd(5, { startStop: 0, lastStop: 3 });
  const third = fewer.personAt(2).id;
  fewer.arrive(1, 3, 2);
  assert.notEqual(fewer.personAt(2).id, third);
});

test('대사: ~요로 끝나는 짧은 문장, 내릴 역을 말한다', () => {
  for (let slot = 0; slot < 100; slot++) {
    const person = makePerson(5, slot);
    for (const ctx of [
      { vehicle: '버스', destination: '부전시장 정류장', terminal: false, crowdRatio: 0.9, hour: 8, newLine: true },
      { vehicle: '열차', destination: null, terminal: true, crowdRatio: 0.1, hour: 22, newLine: false },
    ]) {
      const lines = talkLines(person, ctx);
      // 가는 까닭은 시간이 바뀌어도 같다.
      if (ctx.destination) {
        const at = lines.indexOf(`${ctx.destination}에서 내려요.`);
        assert.equal(talkLines(person, { ...ctx, hour: ctx.hour + 3 })[at + 1], lines[at + 1]);
      }
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
