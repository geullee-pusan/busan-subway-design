// 부모 화면과 우리 집 규칙 테스트(docs/SPEC.md 9장, Phase 6)
// localStorage가 없는 곳(Node)에서도 터지지 않아야 한다. 있는 곳처럼 만들어 두고도 시험한다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rulesFile = JSON.parse(readFileSync(resolve(ROOT, 'src/content/rules.json'), 'utf8'));

/** 브라우저의 localStorage를 흉내 낸다. */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    get size() {
      return map.size;
    },
    keys: () => [...map.keys()],
  };
}

async function loadStorage() {
  // 시험마다 새 모듈을 읽어 저장 칸을 비운다.
  return import(`../src/ui/storage.js?t=${Math.random()}`);
}

test('규칙 값에는 바꿀 수 있는 범위가 있다', () => {
  for (const rule of rulesFile.rules) {
    assert.ok(Number.isFinite(rule.min), `${rule.id}에 min이 없다`);
    assert.ok(Number.isFinite(rule.max), `${rule.id}에 max가 없다`);
    assert.ok(rule.step > 0, `${rule.id}의 step이 0보다 커야 한다`);
    assert.ok(rule.min <= rule.value && rule.value <= rule.max, `${rule.id}의 값이 범위 밖이다`);
    assert.ok(rule.max > rule.min);
    // 한 번 눌러 값이 바뀌어야 한다.
    assert.ok(rule.step <= rule.max - rule.min, `${rule.id}의 step이 범위보다 크다`);
  }
});

test('규칙 카드 문장은 값이 바뀌면 같이 바뀐다', async () => {
  const { ruleCardText } = await import('../src/ui/format.js');
  for (const rule of rulesFile.rules) {
    const now = ruleCardText(rule);
    const other = ruleCardText(rule, rule.max);
    assert.ok(!now.includes('{'), `${rule.id} 카드에 자리표시가 남았다: ${now}`);
    assert.ok(!other.includes('{'), `${rule.id} 카드에 자리표시가 남았다`);
    if (rule.value !== rule.max) {
      assert.notEqual(now, other, `${rule.id} 카드가 값을 따라가지 않는다`);
    }
  }
});

test('규칙 값은 단위에 맞게 쓴다', async () => {
  const { ruleValueText, peopleOutOf } = await import('../src/ui/format.js');
  const find = (id) => rulesFile.rules.find((rule) => rule.id === id);
  assert.equal(ruleValueText(find('costPerKm100M')), '861억 원');
  assert.equal(ruleValueText(find('voiceTooCloseM')), '1km');
  assert.equal(ruleValueText(find('walkSpeedKmh')), '한 시간에 4km');
  assert.equal(ruleValueText(find('walkHill')), '1.5배');
  assert.equal(peopleOutOf(0.4), '10명 중 4명');
  assert.equal(peopleOutOf(0.05), '100명 중 5명');
  assert.equal(peopleOutOf(0.035), '1000명 중 35명');
});

test('숫자 표시 모드를 바꾸면 기본값이 따라 바뀐다', async () => {
  const { countText, moneyText, setNumberMode, getNumberMode } = await import('../src/ui/format.js');
  setNumberMode('기본');
  assert.equal(getNumberMode(), '기본');
  assert.equal(countText(42380), '약 4만 2천 명');
  assert.equal(moneyText(11265), '약 1조 1천억 원');
  setNumberMode('진짜 숫자');
  assert.equal(countText(42380), '42,380명');
  assert.equal(moneyText(11265), '1조 1,265억 원');
  // 모드를 직접 넘기면 그 값만 본다.
  assert.equal(countText(42380, '기본'), '약 4만 2천 명');
  setNumberMode('없는 모드');
  assert.equal(getNumberMode(), '기본', '모르는 값은 기본으로 본다');
});

test('저장 칸이 없어도 기본값이 나온다', async () => {
  const storage = await loadStorage();
  assert.deepEqual(storage.loadRuleSets(), { sets: [], activeName: null });
  assert.equal(storage.activeRuleSet(), null);
  assert.equal(storage.hasPin(), false);
  assert.equal(storage.checkPin('1234'), false);
  assert.equal(storage.savePin('1234'), false);
  assert.doesNotThrow(() => storage.clearAll());
});

test('우리 집 규칙을 저장하고, 고르고, 지운다', async () => {
  globalThis.localStorage = fakeStorage();
  try {
    const storage = await loadStorage();
    storage.saveRuleSet('느린 걸음', { walkSpeedKmh: 3 });
    assert.equal(storage.activeRuleSet().name, '느린 걸음');
    assert.deepEqual(storage.activeRuleSet().values, { walkSpeedKmh: 3 });

    storage.saveRuleSet('빠른 버스', { busSpeedCityKmh: 30 });
    assert.equal(storage.loadRuleSets().sets.length, 2);
    assert.equal(storage.activeRuleSet().name, '빠른 버스');

    // 같은 이름으로 저장하면 덮어쓴다.
    storage.saveRuleSet('빠른 버스', { busSpeedCityKmh: 35 });
    assert.equal(storage.loadRuleSets().sets.length, 2);
    assert.equal(storage.activeRuleSet().values.busSpeedCityKmh, 35);

    // 기본 규칙으로 돌아가기
    storage.useRuleSet(null);
    assert.equal(storage.activeRuleSet(), null);
    assert.equal(storage.loadRuleSets().sets.length, 2, '묶음은 그대로 남는다');

    storage.useRuleSet('느린 걸음');
    assert.equal(storage.activeRuleSet().name, '느린 걸음');

    storage.deleteRuleSet('느린 걸음');
    assert.equal(storage.activeRuleSet(), null, '쓰던 묶음을 지우면 기본으로 돌아간다');
    assert.equal(storage.loadRuleSets().sets.length, 1);
  } finally {
    delete globalThis.localStorage;
  }
});

test('부모 화면 잠금은 네 자리 숫자만 받는다', async () => {
  globalThis.localStorage = fakeStorage();
  try {
    const storage = await loadStorage();
    assert.equal(storage.savePin('12'), false);
    assert.equal(storage.savePin('abcd'), false);
    assert.equal(storage.hasPin(), false);
    assert.equal(storage.savePin('1234'), true);
    assert.equal(storage.hasPin(), true);
    assert.equal(storage.checkPin('1234'), true);
    assert.equal(storage.checkPin('4321'), false);
  } finally {
    delete globalThis.localStorage;
  }
});

test('저장한 것 모두 지우기는 설정, 설계, 규칙, 잠금을 함께 지운다', async () => {
  globalThis.localStorage = fakeStorage();
  try {
    const storage = await loadStorage();
    storage.saveSettings({ runsPerDay: 3, numberMode: '진짜 숫자' });
    storage.saveDesign('가', { title: '연습' });
    storage.saveRuleSet('느린 걸음', { walkSpeedKmh: 3 });
    storage.savePin('1234');
    assert.ok(globalThis.localStorage.size >= 4);

    storage.clearAll();
    assert.equal(globalThis.localStorage.size, 0);
    assert.equal(storage.hasPin(), false);
    assert.equal(storage.activeRuleSet(), null);
    assert.deepEqual(storage.loadDesigns(), { 가: null, 나: null });
    assert.equal(storage.loadSettings().runsPerDay, null);
  } finally {
    delete globalThis.localStorage;
  }
});

test('저장 칸이 고장 나도 화면은 그대로 뜬다', async () => {
  globalThis.localStorage = {
    getItem: () => {
      throw new Error('막힘');
    },
    setItem: () => {
      throw new Error('막힘');
    },
    removeItem: () => {
      throw new Error('막힘');
    },
  };
  try {
    const storage = await loadStorage();
    assert.deepEqual(storage.loadRuleSets(), { sets: [], activeName: null });
    assert.equal(storage.hasPin(), false);
    assert.equal(storage.savePin('1234'), false);
    assert.equal(storage.loadSettings().runsPerDay, null);
    assert.doesNotThrow(() => storage.clearAll());
  } finally {
    delete globalThis.localStorage;
  }
});
