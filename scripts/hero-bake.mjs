// 주인공 그림 굽기(개발용): 아이를 닮은 3D 주인공(Mixamo FBX)을 걸어서 여행하기 지도에서 쓸 그림 묶음으로 굽는다.
//   node scripts/hero-bake.mjs   (npm run hero)
//   - 넣는 것(git에 넣지 않는 assets/hero/, C:\joosan에서 복사): anim/defeated.fbx(뼈대와 메시), hero.png(텍스처),
//     anim/idle.fbx(서 있기), anim/running.fbx(달리기), anim/near-hiphop.fbx(역·터미널 가까이에서 움직이며 추는 춤)
//   - 만드는 것: src/content/hero/walker.webp(방향 × 장면 그림 묶음), src/content/hero/walker.json(칸 크기, 발 위치, 장면 차례)
// 게임에는 3D 코드가 들어가지 않는다. three.js는 이 스크립트에서만 쓴다(개발용 의존성).
// 이 폴더에서 Vite 서버를 잠깐 띄우고, 화면 없는 Chrome·Edge로 scripts/hero-bake.html을 연다.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const job = {
  base: '/assets/hero/anim/defeated.fbx',
  texture: '/assets/hero/hero.png',
  // 칸마다 한 장면. at: 한 장면만 찍을 때 동작의 몇 초를 찍을지
  clips: [
    { name: 'idle', file: '/assets/hero/anim/idle.fbx', frames: 1, at: 0 },
    { name: 'run', file: '/assets/hero/anim/running.fbx', frames: 8 },
    // 역·터미널 가까이에서 움직일 때 추는 춤(사용자가 준 Mixamo "Hip Hop Dancing"). sec: 앞의 몇 초만 장면으로 나눈다
    { name: 'hop', file: '/assets/hero/anim/near-hiphop.fbx', frames: 16, sec: 2 },
  ],
  cell: 112,
  dirs: 8,
  elevation: 35,
  // 랜드마크에 도착했을 때 추는 춤(C:\joosan에서 가져온 Mixamo 춤 일곱 가지). 화면을 보는 방향만, 초당 fps장, 길면 앞의 maxSec초만
  dances: [
    { name: 'hiphop', file: '/assets/hero/anim/dance-hiphop.fbx' },
    { name: 'hiphop2', file: '/assets/hero/anim/dance-hiphop2.fbx' },
    { name: 'hiphop3', file: '/assets/hero/anim/dance-hiphop3.fbx' },
    { name: 'hiphop4', file: '/assets/hero/anim/dance-hiphop4.fbx' },
    { name: 'silly', file: '/assets/hero/anim/dance-silly.fbx' },
    { name: 'silly2', file: '/assets/hero/anim/dance-silly2.fbx' },
    { name: 'chicken', file: '/assets/hero/anim/dance-chicken.fbx' },
  ],
  fps: 8,
  maxSec: 4,
  // 랜드마크 도착 장면에 서 있는 모습(거의 정면, 조금 오른쪽으로 비스듬히)
  // danceCell: 같은 카메라로 정면 춤 묶음도 찍는다(차 안, 동작 고르기)
  portrait: { size: 256, elevation: 6, yaw: 20, clip: 'idle', at: 0, danceCell: 144 },
};
for (const f of [job.base, job.texture, ...job.clips.map((c) => c.file), ...job.dances.map((d) => d.file)]) {
  if (!existsSync(join(ROOT, f))) throw new Error(`${f}가 없어요(C:\\joosan\\assets\\hero에서 복사해요).`);
}

const vite = await createServer({ root: ROOT, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await vite.listen();
const DEV = `http://127.0.0.1:${vite.httpServer.address().port}`;
const browserPath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
if (!browserPath) throw new Error('Chrome이나 Edge를 찾지 못했어요.');
const dir = join(tmpdir(), `subway-herobake-${process.pid}`);
const port = 9910 + (process.pid % 40);
const chrome = spawn(browserPath, ['--headless=new', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, `--user-data-dir=${join(dir, 'profile')}`, `${DEV}/scripts/hero-bake.html`], { stdio: 'ignore' });
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
  const ready = () => evaluate(`new Promise((ok) => { const f = () => (typeof window.bake === 'function' ? ok(true) : setTimeout(f, 100)); f(); })`);
  await ready();
  await sleep(2000);
  await ready();
  r = await evaluate(`bake(${JSON.stringify(job)})`);
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
const webp = Buffer.from(r.url.split(',')[1], 'base64');
writeFileSync(join(out, 'walker.webp'), webp);
writeFileSync(join(out, 'walker.json'), JSON.stringify({ _설명: '걸어서 여행하기 주인공 그림 묶음(walker.webp). 줄은 방향(0 = 동쪽에서 시계 방향으로 360/dirs도씩), 칸은 clips의 장면. anchor는 칸 안의 발 위치(px). 만든 곳: scripts/hero-bake.mjs', ...r.meta }, null, 2) + '\n');
if (r.dance) {
  const danceWebp = Buffer.from(r.dance.url.split(',')[1], 'base64');
  writeFileSync(join(out, 'dance.webp'), danceWebp);
  writeFileSync(join(out, 'dance.json'), JSON.stringify({ _설명: '랜드마크에 도착했을 때 추는 춤 그림 묶음(dance.webp). 줄마다 춤 하나, 칸은 1/fps초씩. 화면을 보는 방향만 있다. anchor는 칸 안의 발 위치(px). 만든 곳: scripts/hero-bake.mjs', ...r.dance.meta }, null, 2) + '\n');
  console.log(`src/content/hero/dance.webp ${(danceWebp.length / 1024).toFixed(0)}KB, 춤 ${r.dance.meta.dances.map((d) => `${d.name} ${d.frames}장`).join(', ')}`);
}
if (r.stand) {
  const standWebp = Buffer.from(r.stand.url.split(',')[1], 'base64');
  writeFileSync(join(out, 'stand.webp'), standWebp);
  writeFileSync(join(out, 'stand.json'), JSON.stringify({ _설명: '랜드마크 도착 장면에 서 있는 주인공(stand.webp, 정사각형). box는 그림 안에서 사람이 차지하는 범위(px, bottom이 발끝). 만든 곳: scripts/hero-bake.mjs', ...r.stand.meta }, null, 2) + '\n');
  console.log(`src/content/hero/stand.webp ${(standWebp.length / 1024).toFixed(0)}KB, 사람 범위 ${JSON.stringify(r.stand.meta.box)}`);
  if (r.stand.front) {
    const sheet = Buffer.from(r.stand.front.url.split(',')[1], 'base64');
    const idle = Buffer.from(r.stand.front.idle.split(',')[1], 'base64');
    writeFileSync(join(out, 'front.webp'), sheet);
    writeFileSync(join(out, 'front-idle.webp'), idle);
    writeFileSync(join(out, 'front.json'), JSON.stringify({ _설명: '거의 정면에서 본 주인공의 춤(front.webp, 줄마다 춤 하나, 칸은 1/fps초씩)과 서 있는 모습(front-idle.webp). 차 안과 동작 고르기에서 쓴다. 만든 곳: scripts/hero-bake.mjs', ...r.stand.front.meta }, null, 2) + '\n');
    console.log(`src/content/hero/front.webp ${(sheet.length / 1024).toFixed(0)}KB, front-idle.webp ${(idle.length / 1024).toFixed(0)}KB`);
  }
}
// 확인용 그림(어두운 바탕)
writeFileSync(resolve(ROOT, 'assets/hero/bake-shots.html'), `<body style="margin:0;background:#556"><img src="${r.url}"></body>`);
console.log(`src/content/hero/walker.webp ${(webp.length / 1024).toFixed(0)}KB, 칸 ${r.meta.cols} × ${r.meta.dirs}, 발 위치 ${JSON.stringify(r.meta.anchor)}`);
console.log('확인용: assets/hero/bake-shots.html');
