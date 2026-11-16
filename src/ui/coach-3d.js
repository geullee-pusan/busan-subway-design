// 고속·시외버스 3D 보기: 터미널 승차홈 → 고속도로 → 휴게소 → 도착 터미널.
// 고속도로 길은 걸어서 여행하기의 OpenStreetMap 도로(data/build/roads.json)에서 두 터미널 사이 차 길을 찾은 것이다.
// 차로 수, 방음벽, 표지판, 승차홈, 휴게소 모양은 우리가 지은 것이다(땅 높이와 인구는 격자 칸).
// 버스 칠은 회사별 칠(coach-looks.js, 출처는 data/facts.json coachLooks)이다. 회사 이름, 로고, 상징 무늬는 넣지 않는다.
import {
  AmbientLight,
  AnimationMixer,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { roadsData } from '../data.js';
import { decodeRoads, indexRoads, MADE_ROAD, nearestRoad, taxiRoute } from '../sim/roads.js';
import { cellNoise, groundAt } from '../sim/train-3d-path.js';
import { Parts } from './train-3d-cars.js';
import { facadeTexture, Mesher } from './train-3d-station.js';
import { along, busMesh, lengthOf } from './bus-3d.js';
import { buildHero } from './hero-model.js';
import heroData from '../content/hero/hero3d.json';
import heroTextureUrl from '../content/hero/hero3d.webp';

const SKY = 0xcfe6f5;
/** 아이 눈높이(미터) */
const EYE = 1.1;
/** 한쪽 차로 수, 차로 폭, 중앙분리대 폭, 갓길(미터). 우리가 정한 값. */
const LANES = 2;
const LANE_W = 3.6;
const MEDIAN = 2;
const SHOULDER = 2.5;
/** 버스가 달리는 차로(가운데에서 오른쪽으로, 바깥 차로) */
const BUS_LANE = MEDIAN / 2 + LANE_W * 1.5;
/** 한 번 달리는 장면에서 가는 거리(km) */
const DRIVE_KM = 0.34;

let roadCache = null;
function roadsNow() {
  if (!roadCache) {
    const roads = decodeRoads(roadsData);
    roadCache = { roads, index: indexRoads(roads, (e) => e.cls !== MADE_ROAD) };
  }
  return roadCache;
}

/** 두 터미널 사이 차 길(격자 km 점들). 못 찾으면 곧은 줄. 겹친 점은 뺀다. */
export function coachPath(a, b) {
  const { roads, index } = roadsNow();
  const ok = (e) => e.cls !== MADE_ROAD;
  const na = nearestRoad(roads, index, a, 0.5, ok);
  const nb = nearestRoad(roads, index, b, 0.5, ok);
  const r = na && nb ? taxiRoute(roads, na, nb) : null;
  const raw = r?.points?.length >= 2 ? r.points.map((p) => [p[0], p[1]]) : [[a.x, a.y], [b.x, b.y]];
  const pts = raw.filter((p, i) => i === 0 || Math.hypot(p[0] - raw[i - 1][0], p[1] - raw[i - 1][1]) > 0.002);
  return pts.length >= 2 ? pts : [[a.x, a.y], [a.x + 1, a.y]];
}

/** 글자판(바탕색, 글자색) */
function boardTexture(lines, { bg = '#1f6b3a', fg = '#ffffff', width = 512, height = 192 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, width, height);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(8, 8, width - 16, height - 16);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = Math.round((height * 0.7) / lines.length);
  g.font = `bold ${size}px sans-serif`;
  lines.forEach((t, i) => g.fillText(t, width / 2, (height * (i + 0.5)) / lines.length + 4, width - 40));
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * 고속·시외버스 안: 높은 바닥, 커튼 창, 좌석은 버스 종류마다(일반 2+2, 우등·프리미엄 2+1). 좌석 배치는 우리가 어림한 것이다.
 */
function coachCabin(body, grade, material) {
  const { L, W, H, floor, wb, wt } = body;
  const parts = new Parts();
  const glow = new Parts();
  const x0 = -L / 2 + 0.2;
  const x1 = L / 2 - 0.2;
  const len = x1 - x0;
  const mid = (x0 + x1) / 2;
  const iw = W / 2 - 0.08;
  const wall = '#ddd6c8';
  parts.box(len, 0.08, iw * 2, mid, floor - 0.04, 0, '#5f5a55');
  parts.box(len, 0.06, iw * 2, mid, H - 0.3, 0, '#efece6');
  for (const s of [-1, 1]) {
    parts.box(len, wb - floor, 0.05, mid, (floor + wb) / 2, s * iw, wall);
    parts.box(len, H - 0.3 - wt, 0.05, mid, (wt + H - 0.3) / 2, s * iw, wall);
    for (let x = x0 + 0.7; x < x1; x += 1.55) {
      parts.box(0.12, wt - wb, 0.08, x, (wb + wt) / 2, s * iw, wall);
      parts.box(0.3, wt - wb - 0.1, 0.04, x + 0.2, (wb + wt) / 2 + 0.05, s * (iw - 0.05), '#7b2e3a'); // 커튼
    }
    // 짐 선반과 독서등
    parts.box(len - 1.5, 0.08, 0.45, mid - 0.4, wt + 0.05, s * (iw - 0.25), '#c9c3b8');
    glow.box(len - 1.5, 0.02, 0.06, mid - 0.4, wt, s * (iw - 0.48), '#fff4d8');
  }
  const premium = grade.includes('프리미엄');
  const wide = premium || grade.includes('우등');
  const seat = premium ? '#5b4636' : wide ? '#3a3f5c' : '#3f5f8f';
  // 2+1: 문 반대(왼편, -z)에 두 자리, 오른편에 한 자리. 2+2: 양쪽 두 자리.
  const pitch = premium ? 1.15 : wide ? 1.0 : 0.82;
  const seatW = wide ? 0.6 : 0.46;
  const leftZ = wide ? [-iw + 0.32, -iw + 0.32 + seatW + 0.04] : [-iw + 0.26, -iw + 0.74];
  const rightZ = wide ? [iw - 0.34] : [iw - 0.26, iw - 0.74];
  const aisleZ = wide ? (leftZ[1] + seatW / 2 + rightZ[0] - seatW / 2) / 2 : 0;
  for (let x = x0 + 0.7; x < x1 - 2.6; x += pitch) {
    for (const z of [...leftZ, ...(x > body.doors[0] - 1.6 ? [] : rightZ)]) {
      parts.box(0.5, 0.12, seatW, x, floor + 0.45, z, seat);
      parts.box(0.12, 0.7, seatW, x - 0.25, floor + 0.85, z, seat);
      parts.box(0.1, 0.16, seatW * 0.8, x - 0.25, floor + 1.25, z, '#efeae0'); // 머리 덮개
      if (premium) parts.box(0.9, 0.9, 0.05, x - 0.1, floor + 0.75, z + Math.sign(z) * (seatW / 2 + 0.03), '#3d2f25'); // 칸막이
    }
  }
  // 운전석, 앞 유리 아래 계기판
  parts.box(0.6, 1.0, 0.7, x1 - 0.7, floor + 0.5, -iw + 0.45, '#2f3338');
  parts.box(0.4, 0.5, iw * 2, x1 - 0.15, floor + 0.7, 0, '#3a3d42');
  const group = new Group();
  group.add(new Mesh(parts.geometry(), material), new Mesh(glow.geometry(), new MeshBasicMaterial({ vertexColors: true })));
  return {
    group,
    // 좌석 위로 창밖이 보이게 조금 높게(자리에서 일어선 아이 눈높이)
    eye: new Vector3(x0 + len * 0.18, floor + EYE + 0.45, aisleZ),
    look: new Vector3(x1 + 3, floor + 1.3, aisleZ - 0.2),
    hero: { x: x0 + len * 0.25 + 2.2, y: floor, z: aisleZ },
    dispose() {
      group.traverse((o) => {
        o.geometry?.dispose();
        if (o.material && o.material !== material) o.material.dispose();
      });
    },
  };
}

/**
 * 고속·시외버스 3D 보기를 만든다. 만들 수 없으면 오류를 던진다(부르는 쪽이 그림으로 돌아간다).
 * @param {{grid: object, look: object, from: {x: number, y: number, name: string}, to: {x: number, y: number, name: string},
 *   grade: string, others?: object[], bay?: number, reduceMotion?: boolean}} p
 *   look: 탈 버스 칠, others: 승차홈과 휴게소에 서 있는 다른 버스 칠들, bay: 승차홈 번호
 */
export function createCoach3D({ grid, look, from, to, grade, others = [], bay = 3, reduceMotion = false }) {
  const el = document.createElement('div');
  el.className = 'tr3d';
  const canvas = document.createElement('canvas');
  canvas.className = 'tr3d-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '고속버스 3D 그림');
  el.append(canvas);
  const credit = document.createElement('div');
  credit.className = 'tr3d-credit';
  credit.textContent = '도로 모양 © OpenStreetMap contributors';
  el.append(credit);

  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  scene.background = new Color(SKY);
  scene.fog = new Fog(SKY, 300, 1400);
  const camera = new PerspectiveCamera(58, 16 / 10, 0.05, 3000);
  const hemi = new HemisphereLight(0xf4f8ff, 0xb9b3a6, 1.4);
  scene.add(hemi, new AmbientLight(0xffffff, 0.25));
  const sun = new DirectionalLight(0xffffff, 1.9);
  sun.position.set(-0.4, 1, 0.3);
  scene.add(sun);
  const material = new MeshLambertMaterial({ vertexColors: true });
  const glowMat = new MeshBasicMaterial({ vertexColors: true });
  const facadeMats = new Map();
  const textures = [];

  const destText = to.name.replace(/(종합|고속|시외|공용)?(버스)?터미널$|버스 ?정류장$/, '').trim() || to.name;
  const bus = busMesh({ ...look, vehicle: 'express' }, destText, material);
  scene.add(bus.group);
  const cabin = coachCabin(bus.body, grade, material);
  cabin.group.visible = false;
  bus.group.add(cabin.group);
  const L = bus.body.L;

  // 주인공
  const heroImage = new Image();
  const hero = buildHero(heroData, heroImage);
  heroImage.onload = () => hero.root.traverse((o) => o.material?.map && (o.material.map.needsUpdate = true));
  heroImage.src = heroTextureUrl;
  hero.root.scale.setScalar(1.25);
  const mixer = new AnimationMixer(hero.root);
  let heroAction = mixer.clipAction(hero.clips.idle);
  heroAction.play();
  let heroDone = () => {};
  mixer.addEventListener('finished', () => {
    const idle = mixer.clipAction(hero.clips.idle);
    idle.reset().play();
    heroAction.crossFadeTo(idle, 0.4, false);
    heroAction = idle;
    heroDone('stand');
  });

  // 다른 버스(승차홈·휴게소에 서 있는 차): 칠마다 한 번만 짓는다
  const parked = [];
  const parkedMesh = (i) => {
    const lk = others.length ? others[i % others.length] : look;
    const m = busMesh({ ...lk, vehicle: 'express' }, ['서울', '대구', '광주', '부산', '대전', '울산'][i % 6], material);
    parked.push(m);
    return m.group;
  };

  const path = coachPath(from, to);
  const pathKm = lengthOf(path);
  let origin = [from.x, from.y];
  const W = (x, y) => [(x - origin[0]) * 1000, (y - origin[1]) * 1000];
  const groundY = (x, y) => Math.max(0, groundAt(grid, x, y));
  const hW = (wx, wz) => groundY(wx / 1000 + origin[0], wz / 1000 + origin[1]);

  let world = null;
  let place = 'terminal'; // 'terminal' | 'road' | 'rest'
  let mode = 'stop';
  let outsideMode = 'front';
  let doorAmount = 0;
  let doorTarget = 0;
  let drive = null; // {from, to, start, ms, done}
  let posKm = 0; // 길 위 버스 머리 자리(달리는 장면), 또는 장면 안 x(미터, 터미널·휴게소)
  let base = 0; // 터미널·휴게소 땅 높이
  let heroSpot = null;
  let viewSpot = null;
  let traffic = [];
  let raf = 0;
  let last = 0;

  function disposeWorld() {
    if (!world) return;
    scene.remove(world);
    world.traverse((o) => {
      if (parked.some((p) => p.group === o)) return;
      o.geometry?.dispose();
      const m = o.material;
      if (m && m !== material && m !== glowMat && ![...facadeMats.values()].includes(m)) {
        m.map?.dispose();
        m.dispose();
      }
    });
    for (const p of parked) p.dispose();
    parked.length = 0;
    world = null;
    traffic = [];
  }

  function facadeMat(style) {
    if (!facadeMats.has(style)) facadeMats.set(style, new MeshLambertMaterial({ map: facadeTexture(style), vertexColors: true, side: DoubleSide }));
    return facadeMats.get(style);
  }

  /** 네모 건물 하나(유리·창 무늬). x, z 가운데, 폭 w(x쪽), 깊이 d, 높이 h */
  function building(mesher, x, z, w, d, h, y0, tint) {
    const c = new Color(tint);
    const ring = [
      [x - w / 2, z - d / 2],
      [x + w / 2, z - d / 2],
      [x + w / 2, z + d / 2],
      [x - w / 2, z + d / 2],
    ];
    let run = 0;
    for (let i = 0; i < 4; i++) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % 4];
      const len = Math.hypot(bx - ax, bz - az);
      mesher.quad([ax, y0, az], [bx, y0, bz], [bx, y0 + h, bz], [ax, y0 + h, az], c, [[run / 3, 0], [(run + len) / 3, 0], [(run + len) / 3, h / 4], [run / 3, h / 4]]);
      run += len;
    }
  }

  /**
   * 터미널 승차홈(또는 휴게소): 버스는 +x로 달려 z=0 차로에 서고, 문 쪽(+z)이 승차홈이다.
   * 장면 땅은 평평하게 둔다(터미널 자리 땅 높이).
   */
  function buildTerminal(at, { rest = false, name = '' } = {}) {
    disposeWorld();
    world = new Group();
    place = rest ? 'rest' : 'terminal';
    origin = [at.x, at.y];
    base = groundY(at.x, at.y);
    const parts = new Parts();
    const glow = new Parts();
    // 바닥: 아스팔트 마당과 둘레 땅
    parts.box(600, 0.2, 600, 0, base - 0.12, 0, '#a9b28f');
    parts.box(rest ? 160 : 140, 0.1, rest ? 90 : 46, rest ? 0 : -10, base, rest ? 10 : -6, '#5b5e63');
    if (!rest) {
      // 승차홈: 긴 보도, 지붕, 기둥, 승차홈 번호판
      parts.box(110, 0.2, 7, 0, base + 0.1, 6.1, '#c9c4b8');
      parts.box(110, 0.22, 0.25, 0, base + 0.11, 2.65, '#f2c230'); // 노란 안전선 쪽 연석
      parts.box(112, 0.3, 9, 0, base + 5.2, 5.3, '#8e979e'); // 지붕
      for (let x = -52; x <= 52; x += 13) parts.box(0.35, 5, 0.35, x, base + 2.6, 8.8, '#6d757b');
      // 대합실 건물(유리)
      const m = new Mesher();
      building(m, 0, 22, 110, 26, 12, base, '#d7dde2');
      world.add(new Mesh(m.geometry(), facadeMat('curtain')));
      parts.box(112, 0.4, 28, 0, base + 12.2, 22, '#7f878d');
      // 이름판
      const nameTex = boardTexture([name], { bg: '#24323f', width: 1024, height: 128 });
      textures.push(nameTex);
      const nb = new Mesh(new PlaneGeometry(40, 5), new MeshBasicMaterial({ map: nameTex }));
      nb.position.set(0, base + 9.5, 8.95);
      nb.rotation.y = Math.PI;
      world.add(nb);
      // 홈마다 번호판, 다른 버스
      for (let i = 0; i < 7; i++) {
        const n = bay - 3 + i;
        if (n < 1) continue;
        const x = (i - 3) * 15;
        const tex = boardTexture([`${n}번 승차홈`], { bg: '#24323f', width: 384, height: 128 });
        textures.push(tex);
        // 앞뒤 두 장(어느 쪽에서 봐도 글자가 바로 보인다)
        const b = new Mesh(new PlaneGeometry(2.4, 0.8), new MeshBasicMaterial({ map: tex }));
        b.position.set(x + 3, base + 4.4, 3.22);
        const back = b.clone();
        back.position.z = 3.18;
        back.rotation.y = Math.PI;
        world.add(b, back);
        // 선 자리 흰 줄
        parts.box(14, 0.02, 0.15, x, base + 0.06, -1.6, '#f2f2ee');
        if (i !== 3 && i !== 4 && cellNoise(i, n, 5) > 0.2) {
          const g = parkedMesh(i);
          g.position.set(x + 5.3 - L / 2, base, 0);
          world.add(g);
        }
      }
    } else {
      // 휴게소: 건물, 줄 그은 주차 자리, 서 있는 버스들, 나무
      const m = new Mesher();
      building(m, 0, 52, 70, 18, 7, base, '#efe6d6');
      world.add(new Mesh(m.geometry(), facadeMat('punched')));
      const roofG = new BoxGeometry(76, 0.6, 24);
      roofG.translate(0, base + 7.5, 52);
      parts.add(roofG, '#5b6b7c');
      const restTex = boardTexture(['휴게소'], { bg: '#1f6b3a', width: 512, height: 160 });
      textures.push(restTex);
      const rb = new Mesh(new PlaneGeometry(10, 3), new MeshBasicMaterial({ map: restTex }));
      rb.position.set(0, base + 9.6, 40.2);
      rb.rotation.y = Math.PI;
      world.add(rb);
      parts.box(70, 0.2, 6, 0, base + 0.1, 40, '#c9c4b8');
      for (let i = 0; i < 9; i++) {
        const x = -60 + i * 6;
        parts.box(0.15, 0.02, 13, x, base + 0.06, 22, '#f2f2ee');
        if (i % 3 !== 1) {
          const g = parkedMesh(i);
          g.position.set(x + 3, base, 22);
          g.rotation.y = -Math.PI / 2;
          world.add(g);
        }
      }
      for (let i = 0; i < 18; i++) {
        const g = new ConeGeometry(2.2, 6, 7);
        g.translate(-80 + i * 9.5, base + 3, 64 + cellNoise(i, 2, 3) * 8);
        parts.add(g, '#4f8a45');
      }
    }
    // 들어오는 차로 표시
    for (let x = -130; x < 60; x += 9) parts.box(4, 0.02, 0.15, x, base + 0.06, -3.4, '#f2f2ee');
    world.add(new Mesh(parts.geometry(), material), new Mesh(glow.geometry(), glowMat));
    scene.add(world);
    heroSpot = rest ? { x: 1, z: 9.5, face: 0.4 } : { x: 3.8, z: 4.4, face: Math.PI };
    viewSpot = rest ? { x: 7, z: 7.5 } : { x: 9.5, z: 6.2 };
  }

  /** 고속도로: 길 위 km 지점 둘레를 짓는다(앞 1.3km, 뒤 0.3km) */
  function buildRoad(km) {
    disposeWorld();
    world = new Group();
    place = 'road';
    const a = along(path, km);
    origin = [a.x, a.y];
    const k0 = Math.max(0, km - 0.3);
    const k1 = Math.min(pathKm, km + 1.3);
    const parts = new Parts();
    const glow = new Parts();
    const STEP = 0.02; // 20m마다 단면
    const samples = [];
    for (let k = k0; k <= k1 + 1e-9; k += STEP) {
      const p = along(path, k);
      const q = along(path, Math.min(pathKm, k + 0.01));
      let dx = q.x - p.x;
      let dy = q.y - p.y;
      const n = Math.hypot(dx, dy);
      if (n < 1e-6) {
        dx = p.dx;
        dy = p.dy;
      } else {
        dx /= n;
        dy /= n;
      }
      const [x, z] = W(p.x, p.y);
      samples.push({ k, gx: p.x, gy: p.y, x, z, ux: dx, uz: dy, rx: -dy, rz: dx, y: groundY(p.x, p.y) });
    }
    // 길 높이: 땅을 따라가되 부드럽게(앞뒤 5개 평균)
    for (let i = 0; i < samples.length; i++) {
      let s = 0;
      let c = 0;
      for (let j = Math.max(0, i - 5); j <= Math.min(samples.length - 1, i + 5); j++) {
        s += samples[j].y;
        c++;
      }
      samples[i].ry = s / c + 0.3;
    }
    // 땅: 길 양옆 -320~320m 단면 띠
    const offs = [];
    for (let o = -320; o <= 320; o += 20) offs.push(o);
    const pos = [];
    const col = [];
    const idx = [];
    const c = new Color();
    const half = MEDIAN / 2 + LANES * LANE_W + SHOULDER;
    samples.forEach((s, i) => {
      for (const o of offs) {
        const wx = s.x + s.rx * o;
        const wz = s.z + s.rz * o;
        const gx = wx / 1000 + origin[0];
        const gy = wz / 1000 + origin[1];
        // 길 가까이는 길 높이로 둑을 쌓거나 깎는다
        const near = Math.max(0, Math.min(1, (Math.abs(o) - half - 10) / 140));
        const y = s.ry - 0.4 + (groundY(gx, gy) - (s.ry - 0.4)) * near;
        pos.push(wx, y, wz);
        const terrain = grid.terrain[Math.floor(gy)]?.[Math.floor(gx)];
        const people = grid.population[Math.floor(gy)]?.[Math.floor(gx)] ?? 0;
        c.set(terrain === 'sea' ? '#7fa7c9' : terrain === 'river' ? '#8db3cf' : terrain === 'mountain' ? '#6f9a5c' : people > 3000 ? '#b3ada3' : people > 300 ? '#a9bb8e' : '#98b874');
        col.push(c.r, c.g, c.b);
      }
      if (i > 0) {
        const n = offs.length;
        for (let j = 1; j < n; j++) {
          const a0 = (i - 1) * n + j - 1;
          idx.push(a0, a0 + 1, a0 + n, a0 + 1, a0 + n + 1, a0 + n);
        }
      }
    });
    const gGeo = new BufferGeometry();
    gGeo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    gGeo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
    gGeo.setIndex(idx);
    gGeo.computeVertexNormals();
    world.add(new Mesh(gGeo, material));

    // 길: 20m 토막마다 판, 중앙분리대, 가드레일, 차선
    const plate = (s, t, o, w, h, dy, color) => {
      const ax = s.x + s.rx * o;
      const az = s.z + s.rz * o;
      const bx = t.x + t.rx * o;
      const bz = t.z + t.rz * o;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.05) return;
      const g = new BoxGeometry(Math.hypot(len, t.ry - s.ry) + 0.1, h, w);
      g.rotateZ(Math.atan2(t.ry - s.ry, len));
      g.rotateY(Math.atan2(-(bz - az), bx - ax));
      g.translate((ax + bx) / 2, (s.ry + t.ry) / 2 + dy, (az + bz) / 2);
      parts.add(g, color);
    };
    for (let i = 1; i < samples.length; i++) {
      const s = samples[i - 1];
      const t = samples[i];
      plate(s, t, 0, half * 2, 0.3, -0.15, '#55585d');
      plate(s, t, 0, 0.6, 0.85, 0.42, '#c9c9c4'); // 중앙분리대(콘크리트)
      for (const side of [-1, 1]) {
        plate(s, t, side * (half - 0.3), 0.12, 0.35, 0.65, '#b9bfc4'); // 가드레일
        plate(s, t, side * (MEDIAN / 2 + LANES * LANE_W + 0.15), 0.15, 0.02, 0.01, '#f2f2ee'); // 바깥 실선
        plate(s, t, side * (MEDIAN / 2 + 0.25), 0.15, 0.02, 0.01, '#e8b92a'); // 안쪽 노란 실선
        if (i % 2 === 0) {
          // 차로 점선(10m 칠, 10m 비움)
          for (let l = 1; l < LANES; l++) plate(s, t, side * (MEDIAN / 2 + l * LANE_W), 0.15, 0.02, 0.01, '#f2f2ee');
        }
      }
      // 사람이 많은 곳은 방음벽(투명한 청록 판과 기둥)
      const people = grid.population[Math.floor(t.gy)]?.[Math.floor(t.gx)] ?? 0;
      if (people > 2500) {
        for (const side of [-1, 1]) {
          plate(s, t, side * (half + 1.2), 0.15, 4, 2, '#7fb3ad');
          const g = new BoxGeometry(0.25, 4.6, 0.25);
          g.translate(t.x + t.rx * side * (half + 1.2), t.ry + 2.2, t.z + t.rz * side * (half + 1.2));
          parts.add(g, '#5d6a70');
        }
      }
    }
    // 녹색 안내 표지판(문 모양 기둥): 1km마다
    for (const s of samples) {
      const k = s.k;
      if (Math.abs(k - Math.round(k)) > STEP / 2 || k < 0.05) continue;
      const left = Math.max(1, Math.round(pathKm - k));
      const tex = boardTexture([`${destText}`, `${left}km`], { width: 512, height: 256 });
      textures.push(tex);
      const sign = new Mesh(new PlaneGeometry(9, 4.5), new MeshBasicMaterial({ map: tex, side: DoubleSide }));
      const ox = s.x + s.rx * (MEDIAN / 2 + LANE_W);
      const oz = s.z + s.rz * (MEDIAN / 2 + LANE_W);
      sign.position.set(ox, s.ry + 7.5, oz);
      // 판의 앞면이 다가오는 차(-진행 방향)를 본다
      sign.rotation.y = Math.atan2(-s.ux, -s.uz);
      world.add(sign);
      for (const o of [MEDIAN / 2 - 0.2, half + 0.4]) {
        const g = new BoxGeometry(0.4, 9.5, 0.4);
        g.translate(s.x + s.rx * o, s.ry + 4.7, s.z + s.rz * o);
        parts.add(g, '#9aa1a6');
      }
      const beam = new BoxGeometry(0.4, 0.5, half - MEDIAN / 2 + 0.6);
      beam.rotateY(Math.atan2(-s.uz, s.ux));
      beam.translate(s.x + s.rx * (half / 2 + MEDIAN / 4), s.ry + 9.4, s.z + s.rz * (half / 2 + MEDIAN / 4));
      parts.add(beam, '#9aa1a6');
    }
    // 길가: 산(원뿔), 나무, 마을과 도시의 건물
    const facades = new Map();
    for (let i = 0; i < samples.length; i += 2) {
      const s = samples[i];
      for (const side of [-1, 1]) {
        for (let r = 0; r < 3; r++) {
          const o = side * (half + 18 + r * 70 + cellNoise(i, r, side + 3) * 40);
          const wx = s.x + s.rx * o;
          const wz = s.z + s.rz * o;
          const gx = wx / 1000 + origin[0];
          const gy = wz / 1000 + origin[1];
          const terrain = grid.terrain[Math.floor(gy)]?.[Math.floor(gx)];
          const people = grid.population[Math.floor(gy)]?.[Math.floor(gx)] ?? 0;
          const y = hW(wx, wz);
          const n = cellNoise(Math.round(s.k * 50), r * 2 + (side > 0 ? 1 : 0), 17);
          if (terrain === 'sea' || terrain === 'river') continue;
          if (terrain === 'mountain' || terrain === 'hill') {
            if (r === 0 || n > 0.55) continue;
            const h = terrain === 'mountain' ? 60 + n * 90 : 25 + n * 35;
            const g = new ConeGeometry(h * 1.4, h, 8);
            g.translate(wx + side * 60, y + h / 2 - 2, wz);
            parts.add(g, terrain === 'mountain' ? '#5d8a4e' : '#76a05f');
          } else if (people > 1500 && r > 0 && n < Math.min(0.8, people / 12000)) {
            const floors = people > 10000 ? 6 + Math.floor(n * 20) : 2 + Math.floor(n * 5);
            const style = floors >= 10 ? 'band' : n > 0.4 ? 'punched' : 'brick';
            if (!facades.has(style)) facades.set(style, new Mesher());
            building(facades.get(style), wx, wz, 14 + n * 12, 12 + n * 8, floors * 3.2, y, ['#ece8de', '#e3ddd2', '#d9dde0', '#efe6d6'][Math.floor(n * 4)]);
          } else if (n < 0.6) {
            const g = new ConeGeometry(2 + n * 2, 5 + n * 4, 7);
            g.translate(wx, y + 3, wz);
            parts.add(g, '#4f8a45');
          }
        }
      }
    }
    for (const [style, m] of facades) world.add(new Mesh(m.geometry(), facadeMat(style)));
    world.add(new Mesh(parts.geometry(), material), new Mesh(glow.geometry(), glowMat));
    // 다른 차들(같은 쪽, 맞은편). 색은 우리가 정한 것.
    const carColors = ['#e9e9e6', '#2b2d30', '#9aa3ab', '#b8322a', '#2f4f7f', '#d7d1c4'];
    for (let i = 0; i < 9; i++) {
      const p = new Parts();
      const big = i % 4 === 3;
      const color = carColors[i % carColors.length];
      if (big) {
        p.box(9, 3.2, 2.4, 0, 1.9, 0, '#d9dcdf');
        p.box(2, 2.4, 2.4, 5.6, 1.5, 0, color);
      } else {
        p.box(4.4, 0.8, 1.8, 0, 0.75, 0, color);
        p.box(2.4, 0.6, 1.6, -0.2, 1.45, 0, '#33414d');
      }
      for (const ax of big ? [-3, 3, 5.6] : [-1.4, 1.4]) for (const z of [-0.9, 0.9]) p.box(0.7, 0.7, 0.25, ax, 0.35, z, '#222');
      const m = new Mesh(p.geometry(), material);
      world.add(m);
      const same = i < 6;
      traffic.push({
        mesh: m,
        same,
        lane: same ? MEDIAN / 2 + LANE_W * (i % 2 ? 0.5 : 1.5) : -(MEDIAN / 2 + LANE_W * (i % 2 ? 0.5 : 1.5)),
        off: (same ? -0.25 : 0) + cellNoise(i, 3, 9) * 1.2,
        speed: same ? (i % 2 ? 0.006 : -0.004) : -0.05,
      });
    }
    scene.add(world);
  }

  /** 길 위 km 지점의 세계 자리와 방향(차로 off 미터만큼 오른쪽) */
  function roadPose(km, off) {
    const a = along(path, km);
    const b = along(path, Math.min(pathKm, km + 0.008));
    let ux = b.x - a.x;
    let uy = b.y - a.y;
    const n = Math.hypot(ux, uy);
    if (n < 1e-7) {
      ux = a.dx;
      uy = a.dy;
    } else {
      ux /= n;
      uy /= n;
    }
    const [x, z] = W(a.x, a.y);
    // 길 높이(땅 높이 평균, buildRoad와 같은 방법)
    let s = 0;
    for (let j = -5; j <= 5; j++) {
      const p = along(path, Math.max(0, Math.min(pathKm, km + j * 0.02)));
      s += groundY(p.x, p.y);
    }
    return { x: x - uy * off, z: z + ux * off, y: s / 11 + 0.3, ux, uz: uy };
  }

  function placeBus() {
    if (place === 'road') {
      const p = roadPose(Math.max(0, posKm - L / 2000), BUS_LANE);
      const f = roadPose(Math.min(pathKm, posKm), BUS_LANE);
      const r = roadPose(Math.max(0, posKm - L / 1000), BUS_LANE);
      bus.group.position.set(p.x, p.y, p.z);
      bus.group.rotation.set(0, Math.atan2(-p.uz, p.ux), Math.atan2(f.y - r.y, L));
    } else if (place === 'rest') {
      // 휴게소: 버스는 마당을 지나 주차 자리 앞에 선다(+x로)
      bus.group.position.set(posKm - L / 2, base, 6 - 3.2);
      bus.group.rotation.set(0, 0, 0);
    } else {
      bus.group.position.set(posKm - L / 2, base, 0);
      bus.group.rotation.set(0, 0, 0);
    }
  }

  function resize() {
    const w = el.clientWidth || 640;
    const h = Math.round(Math.min(560, Math.max(260, w * 0.62)));
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      canvas.style.height = `${h}px`;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  const lookAt = new Vector3();
  /** 고속도로 장면에서 카메라 아래 땅 높이(길 둘레는 깎아 낸 높이와 같게 어림) */
  const groundUnder = (wx, wz) => Math.min(hW(wx, wz), bus.group.position.y + 1);
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!world || !el.isConnected || el.offsetParent === null) return;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0);
    last = now;
    resize();
    mixer.update(reduceMotion ? 0 : dt);
    if (drive) {
      if (!drive.start) drive.start = now;
      const u = drive.ms > 0 ? Math.min(1, (now - drive.start) / drive.ms) : 1;
      const e = drive.ease === 'in' ? u * u : drive.ease === 'none' ? u : u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
      const e2 = drive.ease === 'out' ? 1 - (1 - u) * (1 - u) : e;
      posKm = drive.from + (drive.to - drive.from) * e2;
      if (u >= 1) {
        const done = drive.done;
        drive = null;
        done();
      }
    }
    if (doorAmount !== doorTarget) {
      const s = reduceMotion ? 1 : dt / 0.8;
      doorAmount = doorTarget > doorAmount ? Math.min(doorTarget, doorAmount + s) : Math.max(doorTarget, doorAmount - s);
      for (const d of bus.doors) d.mesh.position.set(d.base[0] - 0.95 * Math.max(0, doorAmount - 0.25) * 1.3, d.base[1], d.base[2] + 0.12 * Math.min(1, doorAmount * 4));
    }
    placeBus();
    // 다른 차들: 버스 둘레에서 움직인다
    if (place === 'road') {
      for (const t of traffic) {
        t.off += t.speed * dt * (reduceMotion ? 0 : 1);
        if (t.off > 0.6) t.off -= 1.1;
        if (t.off < -0.5) t.off += 1.1;
        const km = Math.max(0, Math.min(pathKm, posKm + t.off));
        const p = roadPose(km, t.lane);
        t.mesh.position.set(p.x, p.y, p.z);
        t.mesh.rotation.set(0, Math.atan2(-p.uz, p.ux) + (t.same ? 0 : Math.PI), 0);
      }
    }
    const bp = bus.group.position;
    const ux = Math.cos(-bus.group.rotation.y);
    const uz = Math.sin(-bus.group.rotation.y);
    const rx = -uz;
    const rz = ux;
    if (mode === 'cabin') {
      bus.group.updateMatrixWorld(true);
      camera.position.copy(cabin.eye).applyMatrix4(bus.group.matrixWorld);
      camera.lookAt(lookAt.copy(cabin.look).applyMatrix4(bus.group.matrixWorld));
    } else if (mode === 'stop' && place !== 'road' && viewSpot) {
      // 승차홈(또는 휴게소 보도)에서 아이 눈높이로 버스가 오는 쪽을 본다
      camera.position.set(viewSpot.x, base + 0.2 + EYE, viewSpot.z);
      if (place === 'rest') camera.lookAt(-14, base + 3, 30);
      else camera.lookAt(-40, base + 1.7, -2);
    } else if (mode === 'front') {
      // 앞에서: 버스 머리보다 조금 앞에서 비스듬히 머리를 본다(고속도로는 바깥 갓길 쪽, 터미널은 차로 쪽)
      const sd = place === 'road' ? 7 : -6;
      const cx = bp.x + ux * 17 + rx * sd;
      const cz = bp.z + uz * 17 + rz * sd;
      camera.position.set(cx, place === 'road' ? Math.max(bp.y + 2.6, groundUnder(cx, cz) + 2) : bp.y + 2.6, cz);
      camera.lookAt(bp.x + ux * 2, bp.y + 1.7, bp.z + uz * 2);
    } else if (mode === 'chase') {
      const cx = bp.x - ux * 18 + rx * 3;
      const cz = bp.z - uz * 18 + rz * 3;
      camera.position.set(cx, place === 'road' ? Math.max(bp.y + 6.5, groundUnder(cx, cz) + 3) : bp.y + 6.5, cz);
      camera.lookAt(bp.x + ux * 12, bp.y + 1.5, bp.z + uz * 12);
    } else if (mode === 'sky') {
      camera.position.set(bp.x - ux * 40 + rx * 35, bp.y + 70, bp.z - uz * 40 + rz * 35);
      camera.lookAt(bp.x + ux * 30, bp.y, bp.z + uz * 30);
    } else {
      // 옆에서: 문 쪽(오른편) 바깥에서
      // 터미널·휴게소에서는 승차홈 지붕과 건물이 문 쪽을 가려서 반대쪽에서 본다
      const side = place === 'road' ? 16 : -16;
      const cx = bp.x + rx * side + ux * 2;
      const cz = bp.z + rz * side + uz * 2;
      camera.position.set(cx, place === 'road' ? Math.max(bp.y + 2.8, groundUnder(cx, cz) + 2) : bp.y + 2.8, cz);
      camera.lookAt(bp.x + ux * 1, bp.y + 1.8, bp.z + uz * 1);
    }
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  // 보는 곳 단추(밖에서 볼 때)
  const camRow = document.createElement('div');
  camRow.className = 'tr3d-cams';
  camRow.setAttribute('role', 'group');
  camRow.setAttribute('aria-label', '3D에서 보는 곳');
  const camButtons = [
    ['front', '앞에서'],
    ['side', '옆에서'],
    ['chase', '뒤에서'],
    ['sky', '하늘에서'],
  ].map(([id, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'button';
    b.textContent = label;
    b.dataset.mode = id;
    b.addEventListener('click', () => {
      mode = id;
      outsideMode = id;
      mark();
    });
    camRow.append(b);
    return b;
  });
  const mark = () => {
    for (const b of camButtons) {
      b.className = b.dataset.mode === mode ? 'button is-on' : 'button';
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    }
  };
  mark();
  el.append(camRow);

  function heroOnGround() {
    if (!heroSpot) return;
    scene.add(hero.root);
    hero.root.position.set(heroSpot.x, base + 0.2, heroSpot.z);
    hero.root.rotation.set(0, heroSpot.face, 0);
  }

  const run = (spec) =>
    new Promise((done) => {
      drive = { start: 0, ...spec, ms: reduceMotion ? 0 : spec.ms, done };
    });

  const api = {
    el,
    /** 길이(km) */
    pathKm,
    /** 터미널 승차홈: 버스가 아직 오지 않았다. to: true면 도착 터미널 */
    atTerminal(end = false) {
      const t = end ? to : from;
      buildTerminal(t, { name: t.name });
      bus.group.visible = false;
      posKm = -120;
      if (!end) heroOnGround();
      else hero.root.removeFromParent();
    },
    /** 승차홈에 버스가 들어와 선다(앞문이 기다리는 사람 앞) */
    pullIn(ms = 7000) {
      bus.group.visible = true;
      return run({ from: -120, to: 5.3, ms });
    },
    /** 휴게소 */
    atRest() {
      const p = along(path, pathKm / 2);
      buildTerminal({ x: p.x, y: p.y }, { rest: true });
      bus.group.visible = true;
      posKm = -100;
      hero.root.removeFromParent();
    },
    /** 휴게소 주차 자리 앞에 선다 */
    parkAtRest(ms = 6000) {
      return run({ from: -100, to: 6, ms }).then(() => heroOnGround());
    },
    /** 고속도로: 전체 길의 at(0~1) 지점부터 조금 달린다 */
    cruise(at, ms = 7000) {
      const km = Math.max(Math.min(1.5, pathKm * 0.1), Math.min(pathKm - DRIVE_KM - 0.2, pathKm * at));
      buildRoad(km);
      bus.group.visible = true;
      if (mode === 'stop') {
        mode = outsideMode;
        mark();
      }
      return run({ from: km, to: km + DRIVE_KM, ms, ease: 'none' });
    },
    setDoors(open) {
      doorTarget = open ? 1 : 0;
    },
    /** 'stop'(승차홈·휴게소에서 아이 눈높이), 'cabin'(버스 안), 'outside'(밖에서) */
    setView(view) {
      mode = view === 'outside' ? outsideMode : view;
      const inCabin = mode === 'cabin';
      cabin.group.visible = inCabin;
      bus.group.children[0].visible = !inCabin;
      for (const d of bus.doors) d.mesh.visible = !inCabin;
      camRow.style.display = view === 'outside' ? '' : 'none';
      if (inCabin) {
        bus.group.add(hero.root);
        hero.root.position.set(cabin.hero.x, cabin.hero.y, cabin.hero.z);
        hero.root.rotation.set(0, -Math.PI / 2, 0);
      } else if (heroSpot && place !== 'road' && hero.root.parent === bus.group) heroOnGround();
      else if (hero.root.parent === bus.group) hero.root.removeFromParent();
      hemi.groundColor.setHex(inCabin ? 0xd9d5cc : 0xb9b3a6);
      camera.fov = inCabin || view === 'stop' ? 62 : 55;
      camera.updateProjectionMatrix();
      canvas.setAttribute('aria-label', inCabin ? '고속버스 안 3D 그림' : view === 'stop' ? '승차홈 3D 그림' : '고속버스를 밖에서 본 3D 그림');
      mark();
    },
    playHero(id) {
      const clip = hero.clips[id] ?? hero.clips.idle;
      const next = mixer.clipAction(clip);
      next.reset();
      if (id === 'stand' || clip === hero.clips.idle) next.setLoop(LoopRepeat, Infinity);
      else {
        next.setLoop(LoopOnce, 1);
        next.clampWhenFinished = true;
      }
      next.play();
      if (heroAction !== next) heroAction.crossFadeTo(next, 0.3, false);
      heroAction = next;
    },
    onHero(fn) {
      heroDone = fn;
    },
    destroy() {
      cancelAnimationFrame(raf);
      el.remove();
      disposeWorld();
      mixer.stopAllAction();
      hero.dispose();
      bus.dispose();
      cabin.dispose();
      material.dispose();
      glowMat.dispose();
      for (const t of textures) t.dispose();
      for (const m of facadeMats.values()) {
        m.map?.dispose();
        m.dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
  if (import.meta.env?.DEV) el.devApi = { ...api, world: () => world, scene, camera, path };
  return api;
}
