// 화면 문구와 아이 눈높이 검사(docs/SPEC.md 2.3, 3장, Phase 7).
// 아이가 한 주 써 본 뒤 고치는 일은 사람이 해야 하지만, 기계로 볼 수 있는 규칙은 여기서 본다.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const CSS = readFileSync(resolve(ROOT, 'src/ui/style.css'), 'utf8');

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

// --- 글자 크기와 단추 크기 ---

/** 뿌리 글자가 가장 작을 때(18px). rem은 이 값으로 셈한다. */
const MIN_ROOT_PX = 18;

/** CSS 길이를 가장 작은 화면에서의 px로 바꾼다. 모르는 단위면 null. */
function minPx(value) {
  const match = value.match(/^([\d.]+)(px|rem)$/);
  if (!match) return null;
  return match[2] === 'rem' ? Number(match[1]) * MIN_ROOT_PX : Number(match[1]);
}

/** :root { … } 블록과 그 뒤 나머지 */
const rootStart = CSS.indexOf(':root {');
const rootEnd = CSS.indexOf('}', rootStart);
const ROOT_BLOCK = CSS.slice(rootStart, rootEnd);
const AFTER_ROOT = CSS.slice(rootEnd + 1);

test('뿌리 글자 크기는 화면에 맞춰 바뀌어도 18px 아래로 내려가지 않는다', () => {
  const clamp = ROOT_BLOCK.match(/--base-font:\s*clamp\(\s*(\d+)px\s*,[^,]+,\s*(\d+)px\s*\)/);
  assert.ok(clamp, '뿌리 글자 크기가 clamp(가장 작은 값, …, 가장 큰 값)이어야 해요');
  assert.ok(Number(clamp[1]) >= 18, `가장 작은 글자가 ${clamp[1]}px이에요. 18px 이상이어야 해요(SPEC 3장)`);
  assert.ok(Number(clamp[2]) > Number(clamp[1]), '큰 화면에서는 글자가 커져야 해요');
  assert.match(ROOT_BLOCK, /font-size:\s*calc\(var\(--base-font\)\s*\*\s*var\(--text-scale\)\)/);
});

test('부모가 고르는 글자 배율은 글자를 줄이지 않는다', async () => {
  const { TEXT_SCALES } = await import('../src/ui/storage.js');
  assert.ok(TEXT_SCALES.length >= 2);
  assert.equal(TEXT_SCALES[0].value, 1, '첫째 칸은 자동 크기 그대로(1배)여야 해요');
  for (const { label, value } of TEXT_SCALES) assert.ok(value >= 1, `"${label}"이 ${value}배라 글자가 작아져요`);
});

test('다른 글자 크기는 rem으로 적어 뿌리 글자를 따라 커진다', () => {
  const pxFonts = [...AFTER_ROOT.matchAll(/font-size:\s*\d+(?:\.\d+)?px/g)].map((m) => m[0]);
  assert.deepEqual(pxFonts, [], '글자 크기를 px로 적으면 자동으로 커지지 않아요');
});

test('단추는 가장 작은 화면에서도 48px, 단추 글자는 18px 이상이다(SPEC 3장)', () => {
  const problems = [];
  // 글 속에 들어가는 작은 단추는 뺀다. 낱말 카드를 여는 '?' 표시라 글자 크기를 따라간다.
  const inline = ['word-button'];
  let checked = 0;
  for (const match of AFTER_ROOT.matchAll(/\.([a-z-]*(?:button|toggle)[a-z-]*)[^{]*\{([^}]*)\}/g)) {
    const [, name, rule] = match;
    if (inline.includes(name)) continue;
    const height = rule.match(/min-height:\s*([\d.]+(?:px|rem))/);
    if (height) {
      checked += 1;
      const px = minPx(height[1]);
      if (px !== null && px < 47.9) problems.push(`.${name}: 단추 높이가 가장 작을 때 ${px.toFixed(1)}px이에요`);
    }
    const size = rule.match(/font-size:\s*([\d.]+(?:px|rem))/);
    if (size) {
      const px = minPx(size[1]);
      if (px !== null && px < 17.9) problems.push(`.${name}: 글자가 가장 작을 때 ${px.toFixed(1)}px이에요`);
    }
  }
  // 검사가 비어 있으면 통과해 버린다. 적어도 여러 단추를 읽었는지 본다.
  assert.ok(checked >= 5, `단추 높이를 ${checked}곳밖에 못 읽었어요`);
  assert.deepEqual(problems, []);
});

// --- 안내 숨기기 ---

test('안내 숨기기는 사용법 안내(.guide)만 숨긴다', () => {
  assert.match(CSS, /\.hide-guides \.guide\s*\{[^}]*display:\s*none/);
});

test('숨길 수 있는 안내에 정직 문구·출처·규칙 표시가 섞이지 않는다', () => {
  // SPEC 2.2: 모델이 줄인 부분은 숨기지 않는다. SPEC 9.1: 어떤 규칙으로 돌렸는지 늘 보인다.
  const MUST_STAY = /자료|우리 계산|규칙으로 돌|출처|OpenStreetMap|구하지 못|어림한 값이에요|기다리는 시간|점선은/;
  const problems = [];
  let tagged = 0;
  for (const { path, text } of uiFiles) {
    for (const line of text.split('\n')) {
      // 'guide'를 클래스로 단 줄만 본다(단추·CSS 이름은 뺀다).
      if (!/'[^']*\bguide\b[^']*'/.test(line)) continue;
      if (/guideToggle|guide-toggle|hide-guides/.test(line)) continue;
      tagged += 1;
      for (const [, sentence] of line.matchAll(/'([^']*[가-힣][^']*)'/g)) {
        if (MUST_STAY.test(sentence)) problems.push(`${path}: "${sentence}"는 숨기면 안 돼요`);
      }
    }
  }
  assert.deepEqual(problems, []);
  // 숨길 것이 있어야 단추가 쓸모 있다.
  assert.ok(tagged >= 8, `숨길 수 있는 안내가 ${tagged}곳뿐이에요`);
});

test('OSM 표기는 숨길 수 있는 곳에 들어가지 않는다', () => {
  // CLAUDE.md: OSM 자료를 쓰면 화면에 늘 표시한다. 접히는 범례 안에도 두지 않는다.
  const furniture = uiFiles.find((f) => f.path === 'src/ui/map-furniture.js').text;
  const body = furniture.slice(furniture.indexOf('export function legendBox'), furniture.indexOf('export function mapCorners'));
  assert.ok(!body.includes('OpenStreetMap'), 'OSM 표기가 접히는 범례 안에 있어요');
  for (const file of ['src/ui/explore.js', 'src/ui/design-screen.js', 'src/ui/history-screen.js', 'src/ui/running-screen.js']) {
    const text = uiFiles.find((f) => f.path === file).text;
    assert.match(text, /'credit', '© OpenStreetMap contributors'/, `${file}에 OSM 표기가 없어요`);
  }
});

// --- 남은 TODO ---

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
