// src/sim/은 순수 함수만 둔다(CLAUDE.md 절대 규칙). 금지된 코드가 없는지 글자로 검사한다.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SIM = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'sim');

const FORBIDDEN = [
  [/\bMath\s*\.\s*random\b/, 'Math.random'],
  [/\bDate\b/, 'Date(현재 시각)'],
  [/\bperformance\s*\.\s*now\b/, 'performance.now'],
  [/\bcrypto\b/, 'crypto(무작위 값)'],
  [/\b(document|window|navigator)\b/, 'DOM·브라우저 객체'],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, '저장소'],
  [/\b(fetch|XMLHttpRequest)\b/, '네트워크'],
  [/\b(setTimeout|setInterval|requestAnimationFrame)\b/, '타이머'],
];

/** 주석을 지운다. src/sim에는 주소 같은 // 글자가 없다고 본다. */
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

export function findViolations(code) {
  const clean = stripComments(code);
  return FORBIDDEN.filter(([pattern]) => pattern.test(clean)).map(([, name]) => name);
}

test('검사기가 금지된 코드를 찾아낸다', () => {
  assert.deepEqual(findViolations('const x = Math.random();'), ['Math.random']);
  assert.deepEqual(findViolations('const t = Date.now();'), ['Date(현재 시각)']);
  assert.deepEqual(findViolations('document.body'), ['DOM·브라우저 객체']);
  assert.deepEqual(findViolations('// Math.random은 주석이라 괜찮다\nconst a = 1;'), []);
});

test('src/sim/의 모든 파일에 금지된 코드가 없다', () => {
  const files = readdirSync(SIM, { recursive: true }).filter((f) => /\.(js|mjs)$/.test(f));
  assert.ok(files.length > 0, 'src/sim에 파일이 없어요');
  for (const file of files) {
    const found = findViolations(readFileSync(join(SIM, file), 'utf8'));
    assert.deepEqual(found, [], `${file}: ${found.join(', ')}`);
  }
});
