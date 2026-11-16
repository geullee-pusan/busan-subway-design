// 승객 3D 묶기(개발용): Mixamo 캐릭터(FBX, git에 넣지 않는 assets/passengers/)와 동작(assets/passengers/anim/)을
// 지하철 승강장과 열차 안에 세울 승객 묶음으로 바꾼다.
//   node scripts/passengers-pack.mjs   (npm run passengers)
//   - 캐릭터: 메시를 몸 뼈대에 맞춰 합치고(속눈썹 등은 뺀다), 꼭짓점을 줄이고(meshoptimizer, three에 들어 있음), 질감을 칸마다 512px로 한 장에 모은다
//   - 동작: 뼈 회전만(엉덩이 자리 움직임은 뺀다), 모든 캐릭터가 함께 쓴다
//   - 만드는 것: src/content/passengers/passengers.json, src/content/passengers/<이름>.webp, assets/passengers/pack-shots.html(확인용)
// 게임에는 모델 로더가 들어가지 않는다(src/ui/hero-model.js로 조립한다).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'assets/passengers');
if (!existsSync(DIR)) throw new Error('assets/passengers/에 Mixamo 캐릭터 FBX를 넣어 주세요.');
const people = readdirSync(DIR)
  .filter((f) => f.toLowerCase().endsWith('.fbx'))
  .sort()
  .map((f) => ({ id: basename(f, '.fbx').replace(/[^A-Za-z0-9-]+/g, '-').toLowerCase(), file: `/assets/passengers/${f}`, targetVerts: 9000, skip: ['eyelash', 'eyebrow'] }));
const animDir = join(DIR, 'anim');
const clips = (existsSync(animDir) ? readdirSync(animDir) : [])
  .filter((f) => f.toLowerCase().endsWith('.fbx'))
  .sort()
  .map((f) => ({ name: basename(f, '.fbx').replace(/[^A-Za-z0-9-]+/g, '-').toLowerCase(), file: `/assets/passengers/anim/${f}` }));
if (!people.length) throw new Error('캐릭터 FBX가 없어요.');
const job = { people, clips, fps: 15, maxSec: 8 };
console.log(`캐릭터 ${people.length}명(${people.map((p) => p.id).join(', ')}), 동작 ${clips.length}개(${clips.map((c) => c.name).join(', ')})`);

const vite = await createServer({ root: ROOT, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await vite.listen();
const DEV = `http://127.0.0.1:${vite.httpServer.address().port}`;
const browserPath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
if (!browserPath) throw new Error('Chrome이나 Edge를 찾지 못했어요.');
const dir = join(tmpdir(), `subway-passpack-${process.pid}`);
const port = 9850 + (process.pid % 40);
const chrome = spawn(browserPath, ['--headless=new', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, `--user-data-dir=${join(dir, 'profile')}`, `${DEV}/scripts/passengers-pack.html`], { stdio: 'ignore' });
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
  } catch {
    // 아직 뜨는 중
  }
}
if (!target) throw new Error('브라우저에 연결하지 못했어요.');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok) => ws.addEventListener('open', ok));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  pending.get(m.id)?.(m);
  pending.delete(m.id);
});
const evaluate = (expression) =>
  new Promise((ok, fail) => {
    const n = ++id;
    pending.set(n, (m) => (m.result?.exceptionDetails ? fail(new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 800))) : ok(m.result?.result?.value)));
    ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
let r;
try {
  // Vite가 처음 three를 묶으면 페이지를 한 번 다시 읽는다. 기다렸다가 한 번 더 확인한다.
  const ready = () => evaluate(`new Promise((ok) => { const f = () => (typeof window.packAll === 'function' ? ok(true) : setTimeout(f, 100)); f(); })`);
  await ready();
  await sleep(2000);
  await ready();
  r = await evaluate(`packAll(${JSON.stringify(job)})`);
} finally {
  ws.close();
  chrome.kill();
  await sleep(800);
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    // 브라우저가 아직 파일을 잡고 있으면 임시 폴더는 남겨 둔다
  }
  await vite.close();
}
const out = resolve(ROOT, 'src/content/passengers');
mkdirSync(out, { recursive: true });
const list = r.people.map((p, i) => {
  const id = people[i].id;
  writeFileSync(join(out, `${id}.webp`), Buffer.from(p.texture.split(',')[1], 'base64'));
  return { id, ...p.data };
});
const json = JSON.stringify({ _설명: '승강장·열차 안 승객(Mixamo 캐릭터와 동작). 만든 곳: scripts/passengers-pack.mjs. 질감은 같은 폴더의 <id>.webp', people: list, clips: r.clips });
writeFileSync(join(out, 'passengers.json'), json);
writeFileSync(join(DIR, 'pack-shots.html'), `<body style="margin:0;background:#333;display:flex">${r.shots.map((s) => `<img src="${s}">`).join('')}</body>`);
for (const p of r.people) console.log(JSON.stringify(p.report));
console.log(`src/content/passengers/passengers.json ${(json.length / 1024).toFixed(0)}KB`);
console.log('확인용: assets/passengers/pack-shots.html');
