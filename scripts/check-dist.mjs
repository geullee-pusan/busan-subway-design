// npm run build 뒤에 도는 검사(CLAUDE.md 절대 규칙).
//  - 게임은 dist/index.html 한 파일이다. 그 안에 자료와 코드가 다 들어 있다.
//  - 곁들이 파일은 홈 화면 설치에 필요한 것(manifest, sw.js, 아이콘)뿐이다.
//  - 어디에도 바깥 주소나 사용 추적이 없다.
// 검사하면서 sw.js에 이번 판의 번호(index.html의 해시)를 박는다.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const problems = [];

/** 게임 파일 하나와, 홈 화면 설치에 필요한 곁들이 파일들 */
const APP = 'index.html';
const EXTRAS = ['manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

const files = readdirSync(DIST, { recursive: true }).map((f) => String(f).replace(/\\/g, '/'));
const expected = new Set([APP, ...EXTRAS]);
const extra = files.filter((f) => !expected.has(f));
const missing = [...expected].filter((f) => !files.includes(f));
if (extra.length) problems.push(`쓰지 않기로 한 파일이 있어요: ${extra.join(', ')}`);
if (missing.length) problems.push(`있어야 할 파일이 없어요: ${missing.join(', ')}`);

const html = readFileSync(resolve(DIST, APP), 'utf8');

// 게임 코드와 자료는 index.html 안에 다 있어야 한다. 곁들이 파일만 밖에서 부른다.
const scriptSrc = [...html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi)].map((m) => m[1]);
if (scriptSrc.length) problems.push(`밖의 스크립트 파일을 불러요: ${scriptSrc.join(', ')}`);
const linkHref = [...html.matchAll(/<link[^>]*\shref=["']([^"']+)["']/gi)].map((m) => m[1]);
const allowedLinks = new Set(['./manifest.webmanifest', './icon-192.png', './apple-touch-icon.png']);
const badLinks = linkHref.filter((href) => !allowedLinks.has(href));
if (badLinks.length) problems.push(`허락하지 않은 파일을 불러요: ${badLinks.join(', ')}`);

// 주소. SVG·XML 이름공간 주소는 글자일 뿐이라 허용한다.
const allowed = ['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink', 'http://www.w3.org/1999/xhtml', 'http://www.w3.org/XML/1998/namespace'];
for (const name of [APP, 'sw.js', 'manifest.webmanifest']) {
  if (!files.includes(name)) continue;
  const text = readFileSync(resolve(DIST, name), 'utf8');
  const urls = [...text.matchAll(/https?:\/\/[^\s"'`)<>]+/g)].map((m) => m[0]).filter((u) => !allowed.some((a) => u.startsWith(a)));
  if (urls.length) problems.push(`${name}에 바깥 주소가 있어요: ${[...new Set(urls)].slice(0, 5).join(', ')}`);
}

// 네트워크를 쓰는 코드. 서비스 워커도 fetch를 쓰지 않는다(깔 때 caches.addAll만 쓴다).
const network = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bsendBeacon\b/, 'navigator.sendBeacon'],
  [/\bnew\s+WebSocket\b/, 'WebSocket'],
  [/\bnew\s+EventSource\b/, 'EventSource'],
  [/\bimport\s*\(\s*["'`]https?:/, '바깥 주소 import()'],
];
for (const name of [APP, 'sw.js']) {
  if (!files.includes(name)) continue;
  const text = readFileSync(resolve(DIST, name), 'utf8');
  for (const [pattern, label] of network) {
    if (pattern.test(text)) problems.push(`${name}에 네트워크를 쓰는 코드가 있어요: ${label}`);
  }
}

// 이번 판의 번호를 서비스 워커에 박는다. index.html이 바뀌면 번호도 바뀐다.
const version = createHash('sha256').update(html).digest('hex').slice(0, 12);
if (files.includes('sw.js')) {
  const sw = readFileSync(resolve(DIST, 'sw.js'), 'utf8');
  if (!sw.includes('__VERSION__')) problems.push('sw.js에 판 번호를 박을 자리(__VERSION__)가 없어요.');
  else writeFileSync(resolve(DIST, 'sw.js'), sw.replace('__VERSION__', version));
}

if (problems.length) {
  console.error('배포물 검사 실패:');
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}
const extraSize = EXTRAS.reduce((sum, f) => sum + readFileSync(resolve(DIST, f)).length, 0);
console.log(
  `배포물 검사 통과: 게임 ${APP} 한 파일 ${(html.length / 1024).toFixed(1)}KB` +
    ` + 설치용 파일 ${EXTRAS.length}개 ${(extraSize / 1024).toFixed(1)}KB, 바깥 주소·네트워크 코드 없음 (판 ${version})`,
);
