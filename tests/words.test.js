// 화면 문구와 아이 눈높이 검사(docs/SPEC.md 2.3, 3장, Phase 7).
// 아이가 한 주 써 본 뒤 고치는 일은 사람이 해야 하지만, 기계로 볼 수 있는 규칙은 여기서 본다.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (extname(path) === '.js') out.push(path);
  }
  return out;
}

const uiFiles = walk(resolve(ROOT, 'src/ui')).map((path) => ({
  path: path.replace(/\\/g, '/').slice(ROOT.length + 1),
  text: readFileSync(path, 'utf8'),
}));
const contentFiles = ['missions', 'rules', 'words', 'places', 'sources'].map((name) => ({
  path: `src/content/${name}.json`,
  text: readFileSync(resolve(ROOT, `src/content/${name}.json`), 'utf8'),
}));

/** 화면에 나오는 따옴표 안 한글 문장을 모은다. */
function screenTexts(files) {
  const out = [];
  for (const { path, text } of files) {
    for (const line of text.split('\n')) {
      // 설명(주석) 줄은 화면에 나오지 않는다.
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      for (const match of line.matchAll(/'([^'\\]*[가-힣][^'\\]*)'|"([^"\\]*[가-힣][^"\\]*)"|`([^`\\$]*[가-힣][^`\\]*)`/g)) {
        const value = match[1] ?? match[2] ?? match[3];
        if (value) out.push({ path, value });
      }
    }
  }
  return out;
}

// SPEC 3장 "쓰지 않는 말" 표와, 아이에게 어려운 한자어
const HARD_WORDS = [
  ['수요', '타고 싶은 사람'],
  ['역세권', '역까지 걸어서 10분'],
  ['혼잡도', '얼마나 붐비나'],
  ['소요시간', '걸리는 시간'],
  ['첨두', '가장 붐비는 때'],
  ['수송', '실어 나르기'],
  ['도보', '걷기'],
  ['인접', '가까운'],
  ['산출', '셈하기'],
  ['활용', '쓰기'],
];

test('화면 문구에 어려운 낱말이 없다', () => {
  const problems = [];
  for (const { path, value } of screenTexts(uiFiles)) {
    for (const [hard, instead] of HARD_WORDS) {
      if (value.includes(hard)) problems.push(`${path}: "${value}" — "${hard}" 대신 "${instead}"`);
    }
  }
  assert.deepEqual(problems, []);
});

test('과제 카드와 규칙 카드에도 어려운 낱말이 없다', () => {
  const problems = [];
  // 어른에게 보여 주는 설명(note)과 출처 이름은 그대로 둔다.
  for (const mission of read('src/content/missions.json').missions) {
    for (const value of [mission.title, ...mission.situation, mission.question, mission.hint]) {
      for (const [hard, instead] of HARD_WORDS) {
        if (value.includes(hard)) problems.push(`과제 ${mission.number}: "${value}" — "${hard}" 대신 "${instead}"`);
      }
    }
  }
  for (const rule of read('src/content/rules.json').rules) {
    for (const [hard, instead] of HARD_WORDS) {
      if (rule.card.includes(hard)) problems.push(`규칙 ${rule.id}: "${rule.card}" — "${hard}" 대신 "${instead}"`);
    }
  }
  assert.deepEqual(problems, []);
});

test('낱말 카드로 이어 놓은 말은 words.json에 뜻이 있다', () => {
  const words = new Set(read('src/content/words.json').words.map((w) => w.word));
  const used = new Set();
  for (const { text } of uiFiles) {
    for (const match of text.matchAll(/wordWithCard\(\s*'([^']+)'/g)) used.add(match[1]);
  }
  assert.ok(used.size > 0, '낱말 카드를 하나도 쓰지 않았다');
  for (const word of used) assert.ok(words.has(word), `"${word}"의 뜻이 words.json에 없다`);
});

test('낱말 카드의 뜻도 아이 말(~해요/~이에요)로 적는다', () => {
  for (const { word, meaning } of read('src/content/words.json').words) {
    assert.match(meaning, /(요|에요|예요)\.$/, `"${word}"의 뜻이 아이 말이 아니에요: ${meaning}`);
    assert.ok(meaning.length <= 60, `"${word}"의 뜻이 너무 길어요(${meaning.length}자)`);
  }
});

// 부모에게 보여 주는 화면은 어른 말로 적는다. 아이 문장 규칙에서 뺀다.
const ADULT_FILES = ['src/ui/parent-screen.js', 'src/ui/install.js', 'src/ui/rules-screen.js'];
/** 출처 표기는 이용 조건이라 글자를 줄일 수 없다. */
const ATTRIBUTION = /©|CC BY|공공누리|contributors|자료:|가공|경계:|고도:|공공데이터포털|SGIS|SRTM/;

test('아이에게 보여 주는 문장은 한 가지 뜻만 담는다', () => {
  // SPEC 3장: 한 문장에 25자 안팎. 자리표시(${...})는 ○○로 바꿔 길이를 잰다.
  const long = [];
  for (const { path, value } of screenTexts(uiFiles)) {
    if (ADULT_FILES.includes(path)) continue;
    if (ATTRIBUTION.test(value)) continue;
    const plain = value.replace(/\$\{[^}]*\}/g, '○○');
    for (const sentence of plain.split(/(?<=[.?!])\s+/)) {
      const clean = sentence.trim();
      if (clean.length > 45) long.push(`${path}: (${clean.length}자) ${clean}`);
    }
  }
  assert.deepEqual(long, []);
});

test('단추는 48px, 글자는 18px 이상이다', () => {
  const css = readFileSync(resolve(ROOT, 'src/ui/style.css'), 'utf8');
  const problems = [];
  // 글 속에 들어가는 작은 단추는 뺀다. 낱말 카드를 여는 '?' 표시라 글자 크기를 따라간다.
  const inline = ['word-button'];
  // 단추 규칙마다 min-height가 48px 이상인가
  for (const match of css.matchAll(/\.([a-z-]*button[a-z-]*)[^{]*\{([^}]*)\}/g)) {
    const [, name, body] = match;
    if (inline.includes(name)) continue;
    const height = body.match(/min-height:\s*(\d+)px/);
    if (height && Number(height[1]) < 44) problems.push(`.${name}: 단추 높이가 ${height[1]}px이에요`);
    const size = body.match(/font-size:\s*(\d+)px/);
    if (size && Number(size[1]) < 15) problems.push(`.${name}: 글자가 ${size[1]}px이에요`);
  }
  // 기본 글자 크기
  assert.match(css, /font-size:\s*18px/, '기본 글자 크기가 18px이어야 해요');
  assert.deepEqual(problems, []);
});

test('아이에게 보여 주는 글에 TODO가 남아 있지 않다', () => {
  // 어른이 읽는 설명(note)의 TODO(확인 필요)는 그대로 둔다. 확인 못 한 것을 숨기지 않기 위해서다(CLAUDE.md).
  const problems = [];
  for (const rule of read('src/content/rules.json').rules) {
    if (rule.card.includes('TODO')) problems.push(`규칙 ${rule.id}의 카드에 TODO가 있어요`);
  }
  for (const mission of read('src/content/missions.json').missions) {
    for (const value of [mission.title, ...mission.situation, mission.question, mission.hint]) {
      if (value.includes('TODO')) problems.push(`과제 ${mission.number}에 TODO가 있어요`);
    }
  }
  for (const word of read('src/content/words.json').words) {
    if (word.meaning.includes('TODO')) problems.push(`낱말 "${word.word}"에 TODO가 있어요`);
  }
  for (const { path, value } of screenTexts(uiFiles)) {
    if (value.includes('TODO')) problems.push(`${path}: "${value}"`);
  }
  assert.deepEqual(problems, []);
});
