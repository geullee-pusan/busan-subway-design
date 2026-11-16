// 3D 주인공 묶기(개발용): 아이를 닮은 주인공(Mixamo FBX)을 기차 3D 객실에서 쓰는 모양으로 바꾼다.
//   node scripts/hero-pack.mjs   (npm run hero-3d)
//   - 넣는 것(git에 넣지 않는 assets/hero/, C:\joosan에서 복사): anim/defeated.fbx(뼈대와 메시), hero.png(텍스처),
//     anim/idle.fbx(서 있기), anim/dance-*.fbx(춤 일곱 가지, 차 안 그림 front.json과 같은 이름)
//   - 만드는 것: src/content/hero/hero3d.json(뼈대·메시·동작), src/content/hero/hero3d.webp(텍스처),
//     assets/hero/pack-shots.html(확인용 그림)
// 게임은 모델 로더 없이 src/ui/hero-model.js로 조립한다. FBXLoader는 이 스크립트에서만 쓴다.
// 이 폴더에서 Vite 서버를 잠깐 띄우고, 화면 없는 Chrome·Edge로 scripts/hero-pack.html을 연다.
// (C:\joosan의 scripts/hero-pack.mjs와 같은 방법이다.)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ANIM = '/assets/hero/anim';
const job = {
  base: `${ANIM}/defeated.fbx`,
  textureFile: '/assets/hero/hero.png',
  clips: [
    { name: 'idle', file: `${ANIM}/idle.fbx` },
    // 앉아 있기(사용자가 준 Mixamo "Sitting Idle", 엉덩이 높이를 남긴다)
    { name: 'sit', file: `${ANIM}/sitting-idle.fbx`, keepHip: true },
    // 서 있다가 앉기(사용자가 준 Mixamo "Stand To Sit"): 앉기 단추를 누르면 이것을 한 번 하고 앉아 있기로 넘어간다
    { name: 'sitdown', file: `${ANIM}/stand-to-sit.fbx`, keepHip: true },
    // 앉았다가 일어서기(사용자가 준 Mixamo "Sit To Stand"): 앉아 있을 때 서 있기를 누르면 이것을 한 번 하고 선다
    { name: 'standup', file: `${ANIM}/sit-to-stand.fbx`, keepHip: true },
    { name: 'hiphop', file: `${ANIM}/dance-hiphop.fbx` },
    { name: 'hiphop2', file: `${ANIM}/dance-hiphop2.fbx` },
    { name: 'hiphop3', file: `${ANIM}/dance-hiphop3.fbx` },
    { name: 'hiphop4', file: `${ANIM}/dance-hiphop4.fbx` },
    { name: 'silly', file: `${ANIM}/dance-silly.fbx` },
    { name: 'silly2', file: `${ANIM}/dance-silly2.fbx` },
    { name: 'chicken', file: `${ANIM}/dance-chicken.fbx` },
  ],
  // 1초 20장면, 춤은 앞의 8초만(파일 크기)
  fps: 20,
  maxSec: 8,
};
for (const f of [job.base, job.textureFile, ...job.clips.map((c) => c.file)]) {
  if (!existsSync(join(ROOT, f))) throw new Error(`${f}가 없어요(C:\\joosan\\assets\\hero에서 복사해요).`);
}

const vite = await createServer({ root: ROOT, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await vite.listen();
const DEV = `http://127.0.0.1:${vite.httpServer.address().port}`;
const browserPath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
if (!browserPath) throw new Error('Chrome이나 Edge를 찾지 못했어요.');
const dir = join(tmpdir(), `subway-heropack-${process.pid}`);
const port = 9950 + (process.pid % 40);
const chrome = spawn(browserPath, ['--headless=new', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, `--user-data-dir=${join(dir, 'profile')}`, `${DEV}/scripts/hero-pack.html`], { stdio: 'ignore' });
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
  const ready = () => evaluate(`new Promise((ok) => { const f = () => (typeof window.pack === 'function' ? ok(true) : setTimeout(f, 100)); f(); })`);
  await ready();
  await sleep(2000);
  await ready();
  r = await evaluate(`pack(${JSON.stringify(job)})`);
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
const out = resolve(ROOT, 'src/content/hero');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'hero3d.json'), r.json);
if (r.texture) writeFileSync(join(out, 'hero3d.webp'), Buffer.from(r.texture.split(',')[1], 'base64'));
writeFileSync(
  resolve(ROOT, 'assets/hero/pack-shots.html'),
  `<body style="margin:0;background:#333">${r.shots.map((s, i) => `${i % 3 === 0 ? '<div style="display:flex">' : ''}<img src="${s}">${i % 3 === 2 ? '</div>' : ''}`).join('')}</body>`,
);
console.log(JSON.stringify(r.report));
console.log(`src/content/hero/hero3d.json ${(r.json.length / 1024).toFixed(0)}KB, hero3d.webp ${r.texture ? ((r.texture.length * 0.75) / 1024).toFixed(0) : 0}KB`);
console.log('확인용: assets/hero/pack-shots.html');
