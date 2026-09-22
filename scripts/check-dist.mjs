// npm run build 뒤에 도는 검사. 배포물이 한 파일이고, 네트워크를 쓰지 않는지 본다(CLAUDE.md 절대 규칙).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const problems = [];

const files = readdirSync(DIST, { recursive: true });
if (files.length !== 1 || files[0] !== 'index.html') {
  problems.push(`dist에는 index.html 하나만 있어야 해요. 지금: ${files.join(', ')}`);
}

const html = readFileSync(resolve(DIST, 'index.html'), 'utf8');

// 다른 파일을 부르는 태그
if (/<script[^>]*\ssrc=/i.test(html)) problems.push('밖의 스크립트 파일을 불러요(<script src>).');
if (/<link[^>]*\shref=/i.test(html)) problems.push('밖의 파일을 불러요(<link href>).');

// 주소. SVG·XML 이름공간 주소는 글자일 뿐이라 허용한다.
const allowed = ['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink', 'http://www.w3.org/1999/xhtml', 'http://www.w3.org/XML/1998/namespace'];
const urls = [...html.matchAll(/https?:\/\/[^\s"'`)<>]+/g)].map((m) => m[0]).filter((u) => !allowed.some((a) => u.startsWith(a)));
if (urls.length) problems.push(`바깥 주소가 들어 있어요: ${[...new Set(urls)].slice(0, 5).join(', ')}`);

// 네트워크를 쓰는 코드
for (const [pattern, name] of [
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bsendBeacon\b/, 'navigator.sendBeacon'],
  [/\bnew\s+WebSocket\b/, 'WebSocket'],
  [/\bnew\s+EventSource\b/, 'EventSource'],
  [/\bimport\s*\(\s*["'`]https?:/, '바깥 주소 import()'],
]) {
  if (pattern.test(html)) problems.push(`네트워크를 쓰는 코드가 있어요: ${name}`);
}

if (problems.length) {
  console.error('배포물 검사 실패:');
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}
console.log(`배포물 검사 통과: dist/index.html 한 파일, ${(html.length / 1024).toFixed(1)}KB, 바깥 주소·네트워크 코드 없음`);
