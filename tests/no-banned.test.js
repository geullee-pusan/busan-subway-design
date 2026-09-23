// SPEC 2.1절(중독 방지)과 CLAUDE.md 절대 규칙을 코드 전체에서 검사한다.
// 넣지 않기로 한 것: 점수, 별, 배지, 등급, 순위표, 연속 접속 보상, 알림, 제한 시간, 카운트다운,
// 자동으로 이어지는 다음 판, 광고, 외부 링크, 결제, 사용 추적.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (['.js', '.json', '.css', '.html'].includes(extname(path))) out.push(path);
  }
  return out;
}

const files = [...walk(resolve(ROOT, 'src')), resolve(ROOT, 'index.html')];
const sources = files.map((path) => ({ path: path.replace(ROOT + '\\', '').replace(ROOT + '/', ''), text: readFileSync(path, 'utf8') }));

/** 뜻이 다른데 글자만 같은 곳은 검사에서 뺀다. */
const ALLOW = [
  // 이용허락범위 제한 없음 같은 말
  /이용허락범위 제한/,
];

function findWord(text, pattern) {
  const lines = text.split('\n');
  const hits = [];
  lines.forEach((line, index) => {
    if (!pattern.test(line)) return;
    if (ALLOW.some((allow) => allow.test(line))) return;
    hits.push(`${index + 1}줄: ${line.trim().slice(0, 80)}`);
  });
  return hits;
}

const BANNED = [
  [/점수|스코어|\bscore\b/i, '점수'],
  [/배지|\bbadge\b/i, '배지'],
  [/순위표|리더보드|leaderboard|랭킹|ranking/i, '순위표'],
  [/등급|레벨업|levelUp/i, '등급'],
  [/연속 접속|출석 체크|streak/i, '연속 접속 보상'],
  [/알림|푸시|Notification|PushManager/i, '알림'],
  [/제한 시간|카운트다운|countdown/i, '제한 시간과 카운트다운'],
  [/광고|advert|adsense/i, '광고'],
  [/결제|payment|checkout/i, '결제'],
  [/사용 추적|analytics|gtag|fbq|mixpanel|amplitude/i, '사용 추적'],
];

test('SPEC 2.1절에서 넣지 않기로 한 것이 코드에 없다', () => {
  const problems = [];
  for (const { path, text } of sources) {
    for (const [pattern, name] of BANNED) {
      for (const hit of findWord(text, pattern)) problems.push(`${name} → ${path} ${hit}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('네트워크를 쓰는 코드와 바깥 링크가 없다', () => {
  const problems = [];
  const patterns = [
    [/\bfetch\s*\(/, 'fetch()'],
    [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
    [/\bnew\s+WebSocket\b/, 'WebSocket'],
    [/\bnew\s+EventSource\b/, 'EventSource'],
    [/sendBeacon/, 'sendBeacon'],
    [/href\s*=\s*["']https?:/i, '바깥 링크'],
    [/window\.open\s*\(/, 'window.open'],
  ];
  for (const { path, text } of sources) {
    for (const [pattern, name] of patterns) {
      for (const hit of findWord(text, pattern)) problems.push(`${name} → ${path} ${hit}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('스스로 이어지는 판이 없다(setInterval을 쓰지 않는다)', () => {
  const problems = [];
  for (const { path, text } of sources) {
    for (const hit of findWord(text, /setInterval\s*\(/)) problems.push(`${path} ${hit}`);
  }
  assert.deepEqual(problems, []);
});

test('localStorage는 storage.js에서만 쓰고, 늘 try/catch로 감싼다', () => {
  const users = sources.filter((s) => /localStorage/.test(s.text));
  assert.deepEqual(
    users.map((s) => s.path.replace(/\\/g, '/')),
    ['src/ui/storage.js'],
  );
  const text = users[0].text;
  // localStorage를 쓰는 줄마다 그 앞에 try가 있어야 한다.
  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    if (!/localStorage/.test(line)) continue;
    if (/^\s*(\/\/|\*)/.test(line)) continue; // 설명(주석)은 넘어간다
    const before = lines.slice(Math.max(0, index - 6), index).join('\n');
    assert.ok(/try\s*{/.test(before), `${index + 1}줄이 try 안에 있지 않아요: ${line.trim()}`);
  }
});

test('저장된 값이 없어도 기본값이 나온다', async () => {
  // localStorage가 없는 곳(Node)에서도 불러오기가 터지지 않아야 한다.
  const { loadSettings, runsLeft } = await import('../src/ui/storage.js');
  const settings = loadSettings();
  assert.equal(settings.runsPerDay, null);
  assert.equal(runsLeft(settings), null);
  assert.equal(runsLeft({ runsPerDay: 3, runsUsed: 1 }), 2);
  assert.equal(runsLeft({ runsPerDay: 3, runsUsed: 5 }), 0);
});
