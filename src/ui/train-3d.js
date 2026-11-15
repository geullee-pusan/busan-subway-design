// 기차 3D 보기(시험판): 기차 밖에서 따라가며 본다.
// 땅은 격자 칸 높이(1km, 거칠다), 선로는 실제 선로 모양(OpenStreetMap), 건물과 나무는 인구와 칸 종류로 지어 놓은 것이다.
// three.js만 쓴다. 파일을 읽어 오는 로더는 쓰지 않는다(네트워크 없음). 그림은 모두 코드로 만든다.
import {
  AnimationMixer,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import { buildTrain } from './train-3d-cars.js';
import { buildCabin } from './train-3d-cabin.js';
import { buildHero } from './hero-model.js';
import { INTERIOR } from './train-interior.js';
import heroData from '../content/hero/hero3d.json';
import heroTextureUrl from '../content/hero/hero3d.webp';
import { cellNoise, distanceFraction, groundAt, pointAt, routeProfile, terrainAt } from '../sim/train-3d-path.js';

/** 높이를 부풀리는 배수(1km 칸 높이는 산을 낮게 만든다) */
const EX = 2.5;
/** 선로 양옆으로 그리는 너비(km) */
const BAND = 3.5;
/** 땅 그물 간격(km) */
const STEP = 0.15;
/** 기차가 다니는 선로: 가는 쪽에서 왼쪽 선로(미터) */
const TRACK_SIDE = 2.3;
/** 레일 윗면 높이(선로 높이에서, 미터) */
const RAIL_TOP = 0.47;
/** 전차선 높이(레일 윗면에서, 미터). 팬터그래프가 닿는다(train-3d-cars.js). */
const WIRE_M = 5.3;
const SKY = 0xcfe6f5;
const TUNNEL_DARK = 0x1d2026;

const TERRAIN_COLOR = {
  sea: 0xc9b98f,
  river: 0x5ba3d0,
  mountain: 0x4e7a3a,
  hill: 0x6e9a48,
  flat: 0x93be62,
  field: 0xa8c870,
};
const WATER_COLOR = 0x4a8fc7;
const CITY_COLOR = new Color(0xb9b6ad);
const CUT_COLOR = new Color(0xa79a7c);

/** 칸 종류마다 작은 굴곡의 크기(미터). 1km 칸 높이로는 산이 밋밋해서 그려 넣는다. */
const BUMP_M = { mountain: 70, hill: 30, flat: 5, field: 8 };
const BUMP_STEP = 0.5;

/** 작은 굴곡(우리가 그려 넣은 것, 같은 자리는 늘 같다). 칸 사이는 부드럽게 잇는다. */
function bumps(grid, x, y) {
  const fx = x / BUMP_STEP;
  const fy = y / BUMP_STEP;
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const sx = fx - i;
  const sy = fy - j;
  const ex = sx * sx * (3 - 2 * sx);
  const ey = sy * sy * (3 - 2 * sy);
  const n = (a, b) => cellNoise(a, b, 9) - 0.5;
  const v = (n(i, j) * (1 - ex) + n(i + 1, j) * ex) * (1 - ey) + (n(i, j + 1) * (1 - ex) + n(i + 1, j + 1) * ex) * ey;
  const people = grid.population[Math.floor(y)]?.[Math.floor(x)] ?? 0;
  const amp = (BUMP_M[terrainAt(grid, x, y)] ?? 0) * (people > 3000 ? 0.2 : 1);
  return v * 2 * amp;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 선로를 따라가는 띠 하나(가로 위치 lateral, 반너비 half, 높이 dy). keep(i)가 거짓인 곳은 비운다. */
function ribbonGeometry(profile, toWorld, { lateral = 0, half = 1, dy = 0, keep = () => true }) {
  const n = profile.s.length;
  const pos = [];
  const index = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let dx = profile.x[b] - profile.x[a];
    let dz = profile.y[b] - profile.y[a];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // 가는 쪽 왼쪽 = (dz, -dx)
    const lx = dz;
    const lz = -dx;
    const [wx, wy, wz] = toWorld(profile.x[i], profile.y[i], profile.track[i]);
    const cx = wx + lx * lateral;
    const cz = wz + lz * lateral;
    pos.push(cx + lx * half, wy + dy, cz + lz * half, cx - lx * half, wy + dy, cz - lz * half);
    if (i > 0 && keep(i - 1) && keep(i)) {
      const p = (i - 1) * 2;
      index.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** 터널 둥근 지붕(반원 관) */
function tunnelGeometry(profile, toWorld, radius = 6.5, segs = 8) {
  const n = profile.s.length;
  const pos = [];
  const index = [];
  const ring = segs + 1;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let dx = profile.x[b] - profile.x[a];
    let dz = profile.y[b] - profile.y[a];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const [wx, wy, wz] = toWorld(profile.x[i], profile.y[i], profile.track[i]);
    for (let k = 0; k <= segs; k++) {
      const ang = (Math.PI * k) / segs;
      const side = Math.cos(ang) * radius;
      pos.push(wx + dz * side, wy + Math.sin(ang) * radius, wz - dx * side);
    }
    if (i > 0 && profile.tunnel[i - 1] && profile.tunnel[i]) {
      for (let k = 0; k < segs; k++) {
        const p = (i - 1) * ring + k;
        index.push(p, p + ring, p + 1, p + 1, p + ring, p + ring + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** 역 이름판(글자를 캔버스에 그린 그림) */
function nameSign(text, accent) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 160);
  g.fillStyle = accent;
  g.fillRect(0, 128, 512, 32);
  g.fillStyle = '#1f2a36';
  g.font = 'bold 84px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 66, 480);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, fog: false }));
  sprite.scale.set(19, 6, 1);
  return sprite;
}

/**
 * 기차 3D 보기를 만든다. 만들 수 없으면 오류를 던진다(부르는 쪽이 창밖 그림으로 돌아간다).
 * @param {object} p
 * @param {object} p.grid 격자
 * @param {object} p.look 열차 모양 색(train-art.js lookOf)
 * @param {number} p.cars 칸 수
 * @param {boolean} p.highSpeed 고속열차(선로를 더 곧게 놓는다)
 * @param {boolean} p.reduceMotion
 * @param {string} p.kind 열차 종류 이름(ITX-마음처럼 같은 앞모습 안에서 칠이 다른 열차를 가른다)
 * @param {number} p.seatCar 탄 칸(호차). 객실 보기에서 이 칸 안에 선다.
 */
export function createTrain3D({ grid, look, cars = 6, highSpeed = false, reduceMotion = false, kind = '', seatCar = 1 }) {
  const el = element('div', 'tr3d');
  const canvas = element('canvas', 'tr3d-canvas');
  canvas.setAttribute('aria-label', '기차 밖에서 본 3D 그림');
  canvas.setAttribute('role', 'img');
  el.append(canvas);
  const overlay = element('div', 'tr3d-overlay');
  const displayBox = element('div', 'tr3d-display');
  const tunnelNote = element('div', 'tr3d-tunnel', '🚇 터널 안이에요');
  tunnelNote.hidden = true;
  overlay.append(displayBox, tunnelNote);
  el.append(overlay);
  el.append(element('div', 'tr3d-credit', '선로 모양 © OpenStreetMap contributors'));

  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  scene.background = new Color(SKY);
  scene.fog = new Fog(SKY, 900, 2900);
  const camera = new PerspectiveCamera(55, 16 / 10, 1, 7000);
  const hemi = new HemisphereLight(0xf4f8ff, 0x6b7a4a, 1.5);
  scene.add(hemi);
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(-0.5, 1, 0.35);
  scene.add(sun);

  const mat = (hex, extra = {}) => new MeshLambertMaterial({ color: hex, ...extra });
  const materials = {
    body: mat(look.body),
    roof: mat(look.roof),
    band: mat(look.band),
    stripe: mat(look.stripe),
    lower: mat(look.lower),
    accent: mat(look.accent),
    under: mat(0x3a3d40),
    light: new MeshBasicMaterial({ color: 0xfff4c8 }),
    tail: new MeshBasicMaterial({ color: 0xe0302a }),
    car: new MeshLambertMaterial({ vertexColors: true }),
  };

  // 기차: 칸 수만큼(많아도 20칸). 칸 크기와 칠은 train-3d-cars.js
  const train = buildTrain(look, cars, {
    material: materials.car,
    headMaterial: materials.light,
    tailMaterial: materials.tail,
    name: kind,
  });
  const carGroups = train.cars.map((c) => c.group);
  for (const g of carGroups) scene.add(g);
  /** 칸마다 머리가 기차 머리에서 떨어진 거리(km) */
  const carOffsets = [];
  let trainLenM = 0;
  for (const c of train.cars) {
    carOffsets.push(trainLenM / 1000);
    trainLenM += c.length + c.gapAfter;
  }
  const trainLenKm = trainLenM / 1000;

  // 객실: 손님이 타는 칸 가운데 호차 차례로 고른다(코가 없는 칸을 먼저). 칸 안에 객실을 짓고 주인공을 세운다.
  const passengerCars = train.cars.map((c, i) => [c, i]).filter(([c]) => c.car.role !== 'power' && c.car.role !== 'loco');
  const plain = passengerCars.filter(([c]) => c.car.nose === null);
  const pool = plain.length ? plain : passengerCars;
  const [cabinCar, cabinIndex] = pool.length ? pool[Math.max(0, seatCar - 1) % pool.length] : [train.cars[0], 0];
  const cabin = buildCabin(cabinCar.car, train.spec, INTERIOR[kind] ?? INTERIOR['종류 모름'], materials.car);
  cabin.group.visible = false;
  cabinCar.inner.add(cabin.group);
  const heroImage = new Image();
  const hero = buildHero(heroData, heroImage);
  heroImage.onload = () => {
    hero.root.traverse((o) => {
      if (o.material?.map) o.material.map.needsUpdate = true;
    });
  };
  heroImage.src = heroTextureUrl;
  hero.root.scale.setScalar(cabin.hero.scale);
  hero.root.position.set(cabin.hero.x, cabin.hero.y, cabin.hero.z);
  hero.root.rotation.y = -Math.PI / 2; // 카메라(뒤쪽)를 본다
  cabin.group.add(hero.root);
  const mixer = new AnimationMixer(hero.root);
  let heroAction = mixer.clipAction(hero.clips.idle);
  heroAction.play();
  let heroDone = () => {};
  mixer.addEventListener('finished', () => {
    // 춤이 끝나면 다시 선다
    const idle = mixer.clipAction(hero.clips.idle);
    idle.reset().play();
    heroAction.crossFadeTo(idle, 0.4, false);
    heroAction = idle;
    heroDone('stand');
  });
  const cabinEye = new Vector3();
  const cabinTarget = new Vector3();

  let world = null; // 지금 구간의 땅, 선로, 건물
  let profile = null;
  /** 지금 구간 땅 높이(세계 좌표 x, z → 미터, 부풀린 값). 카메라가 땅속에 들어가지 않게 쓴다. */
  let surfaceAt = () => -Infinity;
  let origin = [0, 0];
  let frac = (t) => t;
  let startKm = 0;
  let front = 0;
  let mode = 'side'; // 처음에는 옆에서 본다(긴 기차가 한눈에 보인다)
  let outsideMode = 'side'; // 객실에 들어갔다 나오면 돌아갈 밖 보기
  let raf = 0;
  let last = 0;
  const camPos = new Vector3();
  const camLook = new Vector3();
  let snap = true;
  let wasDark = false;

  const toWorld = (x, y, h) => [(x - origin[0]) * 1000, h * EX, (y - origin[1]) * 1000];

  function disposeWorld() {
    if (!world) return;
    scene.remove(world);
    world.traverse((o) => {
      o.geometry?.dispose();
      const m = o.material;
      if (m) for (const one of Array.isArray(m) ? m : [m]) {
        one.map?.dispose();
        one.dispose();
      }
    });
    world = null;
  }

  /** 한 구간의 땅과 선로를 짓는다 */
  function buildWorld(points, fromName, toName) {
    disposeWorld();
    // 고속선은 산을 터널로 곧게 뚫고 가서 오르내림이 더 적다
    profile = routeProfile(grid, points, { smoothKm: highSpeed ? 4 : 2, tunnelM: 20 });
    world = new Group();
    const xs = profile.x;
    const ys = profile.y;
    origin = [xs[0], ys[0]];
    const minX = Math.min(...xs) - BAND;
    const maxX = Math.max(...xs) + BAND;
    const minY = Math.min(...ys) - BAND;
    const maxY = Math.max(...ys) + BAND;
    const nx = Math.ceil((maxX - minX) / STEP) + 1;
    const ny = Math.ceil((maxY - minY) / STEP) + 1;
    const N = nx * ny;
    const dist = new Float32Array(N).fill(1e9);
    const nearTrack = new Float32Array(N);
    const nearTunnel = new Uint8Array(N);
    const reach = Math.ceil(BAND / STEP) + 1;
    for (let i = 0; i < xs.length; i++) {
      const ci = Math.round((xs[i] - minX) / STEP);
      const ri = Math.round((ys[i] - minY) / STEP);
      for (let r = Math.max(0, ri - reach); r <= Math.min(ny - 1, ri + reach); r++) {
        const vy = minY + r * STEP;
        for (let c = Math.max(0, ci - reach); c <= Math.min(nx - 1, ci + reach); c++) {
          const vx = minX + c * STEP;
          const d = Math.hypot(vx - xs[i], vy - ys[i]);
          const k = r * nx + c;
          if (d < dist[k]) {
            dist[k] = d;
            nearTrack[k] = profile.track[i];
            nearTunnel[k] = profile.tunnel[i] ? 1 : 0;
          }
        }
      }
    }
    // 땅 높이: 선로 가까이는 선로 높이로 깎거나 메운다(터널 위는 산 그대로, 높은 다리 밑은 그대로).
    const height = new Float32Array(N);
    const keep = new Int32Array(N).fill(-1);
    const pos = [];
    const col = [];
    const tmp = new Color();
    for (let r = 0; r < ny; r++) {
      for (let c = 0; c < nx; c++) {
        const k = r * nx + c;
        const vx = minX + c * STEP;
        const vy = minY + r * STEP;
        const g = groundAt(grid, vx, vy) + bumps(grid, vx, vy);
        let h = g;
        const dm = dist[k] * 1000;
        const target = nearTrack[k] - 1;
        let cut = 0;
        if (!nearTunnel[k] && dm < 380) {
          const w = dm < 70 ? 0 : (dm - 70) / 310;
          const ease = w * w * (3 - 2 * w);
          if (g > target) {
            h = target + (g - target) * ease;
            cut = 1 - ease;
          } else if (target - g < 6) {
            h = target + (g - target) * ease;
          }
        }
        // 바다 높이(0)보다 낮은 곳은 물이다
        const wet = h <= 0.3;
        if (wet) h = 0;
        height[k] = h;
        if (dist[k] > BAND + STEP) continue;
        keep[k] = pos.length / 3;
        pos.push((vx - origin[0]) * 1000, h * EX, (vy - origin[1]) * 1000);
        const type = terrainAt(grid, vx, vy);
        tmp.setHex(wet ? WATER_COLOR : (TERRAIN_COLOR[type] ?? TERRAIN_COLOR.flat));
        const people = grid.population[Math.floor(vy)]?.[Math.floor(vx)] ?? 0;
        if (!wet && type !== 'sea' && type !== 'river' && people > 1500) tmp.lerp(CITY_COLOR, Math.min(0.75, people / 20000));
        if (cut > 0.3) tmp.lerp(CUT_COLOR, cut * 0.6);
        const shade = 0.92 + cellNoise(c, r, 7) * 0.16;
        col.push(tmp.r * shade, tmp.g * shade, tmp.b * shade);
      }
    }
    const index = [];
    for (let r = 0; r < ny - 1; r++) {
      for (let c = 0; c < nx - 1; c++) {
        const a = keep[r * nx + c];
        const b = keep[r * nx + c + 1];
        const d = keep[(r + 1) * nx + c];
        const e = keep[(r + 1) * nx + c + 1];
        if (a < 0 || b < 0 || d < 0 || e < 0) continue;
        index.push(a, d, b, b, d, e);
      }
    }
    const ground = new BufferGeometry();
    ground.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    ground.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
    ground.setIndex(index);
    ground.computeVertexNormals();
    world.add(new Mesh(ground, new MeshLambertMaterial({ vertexColors: true, flatShading: true })));

    /** 그물 위 땅 높이(미터, 부풀린 값) */
    const meshHeight = (x, y) => {
      const fc = (x - minX) / STEP;
      const fr = (y - minY) / STEP;
      const c0 = Math.max(0, Math.min(nx - 2, Math.floor(fc)));
      const r0 = Math.max(0, Math.min(ny - 2, Math.floor(fr)));
      const tx = Math.max(0, Math.min(1, fc - c0));
      const ty = Math.max(0, Math.min(1, fr - r0));
      const h = (height[r0 * nx + c0] * (1 - tx) + height[r0 * nx + c0 + 1] * tx) * (1 - ty) + (height[(r0 + 1) * nx + c0] * (1 - tx) + height[(r0 + 1) * nx + c0 + 1] * tx) * ty;
      return h * EX;
    };
    surfaceAt = (wx, wz) => meshHeight(wx / 1000 + origin[0], wz / 1000 + origin[1]);
    const distAt = (x, y) => dist[Math.max(0, Math.min(ny - 1, Math.round((y - minY) / STEP))) * nx + Math.max(0, Math.min(nx - 1, Math.round((x - minX) / STEP)))];

    // 선로: 바닥(다리 위에서는 다리판), 자갈, 레일 두 줄씩 두 선로
    const notTunnelEnd = () => true;
    world.add(new Mesh(ribbonGeometry(profile, toWorld, { half: 6, dy: -0.4, keep: notTunnelEnd }), mat(0x9a948a)));
    for (const side of [TRACK_SIDE, -TRACK_SIDE]) {
      world.add(new Mesh(ribbonGeometry(profile, toWorld, { lateral: side, half: 1.6, dy: 0.15 }), mat(0x857c70)));
      for (const r of [0.72, -0.72]) world.add(new Mesh(ribbonGeometry(profile, toWorld, { lateral: side + r, half: 0.1, dy: 0.45 }), mat(0x55504a)));
    }
    // 터널: 둥근 벽과 50m마다 등
    if (profile.tunnel.some(Boolean)) {
      world.add(new Mesh(tunnelGeometry(profile, toWorld), new MeshLambertMaterial({ color: 0x77726a, emissive: 0x2c2a26, side: DoubleSide })));
      const spots = [];
      for (let i = 0; i < profile.s.length; i++) if (profile.tunnel[i] && spots.length < 4000) spots.push(i);
      const lamps = new InstancedMesh(new BoxGeometry(1.2, 0.25, 0.5), new MeshBasicMaterial({ color: 0xffd27a }), spots.length * 2);
      const dummy = new Object3D();
      spots.forEach((i, j) => {
        const p = pointAt(profile, profile.s[i]);
        const [wx, wy, wz] = toWorld(p.x, p.y, p.h);
        for (const [m, side] of [[0, 5.2], [1, -5.2]]) {
          dummy.position.set(wx + p.dy * side, wy + 3.8, wz - p.dx * side);
          dummy.rotation.set(0, Math.atan2(-p.dy, p.dx), 0);
          dummy.updateMatrix();
          lamps.setMatrixAt(j * 2 + m, dummy.matrix);
        }
      });
      world.add(lamps);
    }
    // 다리 기둥(100m마다)과 전철 기둥(50m마다)
    const dummy = new Object3D();
    const pillarSpots = [];
    const poleSpots = [];
    for (let i = 0; i < profile.s.length; i += 1) {
      if (profile.bridge[i] && i % 2 === 0) pillarSpots.push(i);
      if (look.power === 'electric' && !profile.tunnel[i]) poleSpots.push(i);
    }
    if (pillarSpots.length) {
      const pillars = new InstancedMesh(new BoxGeometry(2.4, 1, 5), mat(0xb4b0a8), pillarSpots.length);
      pillarSpots.forEach((i, j) => {
        const [wx, wy, wz] = toWorld(profile.x[i], profile.y[i], profile.track[i]);
        const groundY = Math.min(wy - 1, meshHeight(profile.x[i], profile.y[i]));
        const h = Math.max(1, wy - 0.6 - groundY);
        const p = pointAt(profile, profile.s[i]);
        dummy.position.set(wx, groundY + h / 2, wz);
        dummy.rotation.set(0, Math.atan2(-p.dy, p.dx), 0);
        dummy.scale.set(1, h, 1);
        dummy.updateMatrix();
        pillars.setMatrixAt(j, dummy.matrix);
      });
      world.add(pillars);
    }
    if (poleSpots.length) {
      const poles = new InstancedMesh(new BoxGeometry(0.35, 7.5, 0.35), mat(0x8a8f94), poleSpots.length * 2);
      const arms = new InstancedMesh(new BoxGeometry(0.25, 0.3, 13), mat(0x8a8f94), poleSpots.length);
      poleSpots.forEach((i, j) => {
        const p = pointAt(profile, profile.s[i]);
        const [wx, wy, wz] = toWorld(p.x, p.y, p.h);
        const yaw = Math.atan2(-p.dy, p.dx);
        for (const [m, side] of [[0, 6.3], [1, -6.3]]) {
          dummy.position.set(wx + p.dy * side, wy + 3.75, wz - p.dx * side);
          dummy.rotation.set(0, yaw, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          poles.setMatrixAt(j * 2 + m, dummy.matrix);
        }
        dummy.position.set(wx, wy + 7.2, wz);
        dummy.updateMatrix();
        arms.setMatrixAt(j, dummy.matrix);
      });
      world.add(poles, arms);
      // 전차선(팬터그래프가 닿는 줄)과 그 위 조가선: 기둥 사이를 선로마다 잇는다
      const spans = [];
      for (let k = 0; k + 1 < poleSpots.length; k++) {
        if (profile.s[poleSpots[k + 1]] - profile.s[poleSpots[k]] < 0.06) spans.push([poleSpots[k], poleSpots[k + 1]]);
      }
      const wires = new InstancedMesh(new BoxGeometry(1, 0.05, 0.05), mat(0x3b3f44), spans.length * 4);
      let w = 0;
      for (const [i0, i1] of spans) {
        const p0 = pointAt(profile, profile.s[i0]);
        const p1 = pointAt(profile, profile.s[i1]);
        for (const side of [TRACK_SIDE, -TRACK_SIDE]) {
          const [x0, y0, z0] = toWorld(p0.x, p0.y, p0.h);
          const [x1, y1, z1] = toWorld(p1.x, p1.y, p1.h);
          const a = [x0 + p0.dy * side, z0 - p0.dx * side];
          const b = [x1 + p1.dy * side, z1 - p1.dx * side];
          const run = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (const lift of [RAIL_TOP + WIRE_M, 6.95]) {
            dummy.position.set((a[0] + b[0]) / 2, (y0 + y1) / 2 + lift, (a[1] + b[1]) / 2);
            dummy.rotation.order = 'YZX';
            dummy.rotation.set(0, Math.atan2(-(b[1] - a[1]), b[0] - a[0]), Math.atan2(y1 - y0, run));
            dummy.scale.set(Math.hypot(run, y1 - y0), 1, 1);
            dummy.updateMatrix();
            wires.setMatrixAt(w++, dummy.matrix);
          }
        }
      }
      dummy.rotation.order = 'XYZ';
      world.add(wires);
    }

    // 건물(사람이 많이 사는 칸일수록 많이, 아주 많으면 높은 아파트)과 나무(산과 언덕)
    const buildings = [];
    const trees = [];
    for (let row = Math.floor(minY); row <= Math.ceil(maxY); row++) {
      for (let colI = Math.floor(minX); colI <= Math.ceil(maxX); colI++) {
        if (distAt(colI + 0.5, row + 0.5) > BAND - 0.2) continue;
        const type = grid.terrain[row]?.[colI];
        if (!type || type === 'sea' || type === 'river') continue;
        const people = grid.population[row]?.[colI] ?? 0;
        // 한 칸(1km)을 12×12 작은 땅으로 나누어, 사람이 많을수록 더 많은 땅에 건물을 세운다
        const houses = people >= 120 ? Math.min(144, Math.ceil(people / 160)) : cellNoise(colI, row, 1) < people / 240 ? 1 : 0;
        const order = Array.from({ length: 144 }, (_, k) => k).sort((p, q) => cellNoise(colI, row, p + 500) - cellNoise(colI, row, q + 500));
        for (let j = 0; j < houses && buildings.length < 16000; j++) {
          const k = order[j];
          const x = colI + ((k % 12) + 0.25 + cellNoise(colI, row, k * 3 + 11) * 0.5) / 12;
          const y = row + (Math.floor(k / 12) + 0.25 + cellNoise(colI, row, k * 3 + 12) * 0.5) / 12;
          if (distAt(x, y) * 1000 < 45 || meshHeight(x, y) <= 0.5) continue;
          const n = cellNoise(colI, row, k * 3 + 13);
          // 아주 붐비는 곳은 아파트가 많고, 덜 붐비는 곳은 낮은 집이 많다. 선로 가까이(150m)에는 높은 건물을 두지 않는다(보는 눈을 가린다).
          const tall = n < Math.min(0.8, people / 25000) && distAt(x, y) * 1000 > 150;
          buildings.push({ x, y, tall, n });
        }
        const treeCount = type === 'mountain' ? 70 : type === 'hill' ? 35 : people < 1500 ? 6 : 0;
        for (let k = 0; k < treeCount && trees.length < 14000; k++) {
          const x = colI + cellNoise(colI, row, k * 2 + 101);
          const y = row + cellNoise(colI, row, k * 2 + 102);
          if (distAt(x, y) * 1000 < 35 || distAt(x, y) > BAND || meshHeight(x, y) <= 0.5) continue;
          trees.push({ x, y, n: cellNoise(colI, row, k + 301) });
        }
      }
    }
    if (buildings.length) {
      const geometry = new BoxGeometry(1, 1, 1);
      geometry.translate(0, 0.5, 0);
      const mesh = new InstancedMesh(geometry, new MeshLambertMaterial({ color: 0xffffff }), buildings.length);
      const colors = [0xf4f0e8, 0xe8e2d6, 0xfbf8f2, 0xe9dcc4, 0xdde4ea, 0xd8a68a];
      buildings.forEach((b, j) => {
        const [wx, , wz] = toWorld(b.x, b.y, 0);
        const base = meshHeight(b.x, b.y);
        if (b.tall) dummy.scale.set(30 + b.n * 22, 36 + ((b.n * 7) % 1) * 40, 13);
        else dummy.scale.set(10 + b.n * 10, 5 + ((b.n * 5) % 1) * 7, 9 + b.n * 7);
        dummy.position.set(wx, base - 0.5, wz);
        dummy.rotation.set(0, (Math.floor(b.n * 4) * Math.PI) / 2 + b.n * 0.4, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(j, dummy.matrix);
        mesh.setColorAt(j, new Color(colors[Math.floor(b.n * 97) % colors.length]));
      });
      world.add(mesh);
    }
    if (trees.length) {
      const geometry = new ConeGeometry(6, 1, 6);
      geometry.translate(0, 0.5, 0);
      const mesh = new InstancedMesh(geometry, new MeshLambertMaterial({ color: 0xffffff, flatShading: true }), trees.length);
      const greens = [0x2f6b2f, 0x3d7a34, 0x4a8a3a, 0x2c5e33];
      trees.forEach((t, j) => {
        const [wx, , wz] = toWorld(t.x, t.y, 0);
        dummy.position.set(wx, meshHeight(t.x, t.y) - 0.5, wz);
        dummy.rotation.set(0, t.n * 6, 0);
        const s = 0.8 + t.n * 0.6;
        dummy.scale.set(s, 14 + t.n * 12, s);
        dummy.updateMatrix();
        mesh.setMatrixAt(j, dummy.matrix);
        mesh.setColorAt(j, new Color(greens[Math.floor(t.n * 53) % greens.length]));
      });
      world.add(mesh);
    }

    // 역: 앞 역과 다음 역에 승강장, 지붕, 역 건물, 이름판
    const platformKm = trainLenKm + 0.03;
    startKm = Math.min(trainLenKm + 0.01, profile.lengthKm * 0.3);
    const station = (centerKm, name) => {
      const p = pointAt(profile, centerKm);
      const [wx, wy, wz] = toWorld(p.x, p.y, p.h);
      const yaw = Math.atan2(-p.dy, p.dx);
      const g = new Group();
      g.position.set(wx, wy, wz);
      g.rotation.y = yaw;
      const plat = new Mesh(new BoxGeometry(platformKm * 1000, 1.1, 4.5), mat(0xc9c4ba));
      plat.position.set(0, 0.55, TRACK_SIDE + 4.4);
      const plat2 = plat.clone();
      plat2.position.z = -(TRACK_SIDE + 4.4);
      const roof = new Mesh(new BoxGeometry(platformKm * 600, 0.4, 5.5), mat(0x7b8794));
      roof.position.set(0, 4.8, TRACK_SIDE + 4.4);
      const roof2 = roof.clone();
      roof2.position.z = -(TRACK_SIDE + 4.4);
      // 역 건물은 가는 쪽 오른편 땅 위에 선다(선로가 높은 다리 위에 있어도)
      const off = (TRACK_SIDE + 30) / 1000;
      const base = Math.min(0, meshHeight(p.x - p.dy * off, p.y + p.dx * off) - wy);
      const house = new Mesh(new BoxGeometry(40, 9, 14), mat(0xe8e2d4));
      house.position.set(0, base + 4.5, TRACK_SIDE + 30);
      const houseRoof = new Mesh(new BoxGeometry(42, 1, 15), materials.accent);
      houseRoof.position.set(0, base + 9.4, TRACK_SIDE + 30);
      const sign = nameSign(`${name}역`, look.accent);
      sign.position.set(0, base + 17, TRACK_SIDE + 30);
      g.add(plat, plat2, roof, roof2, house, houseRoof, sign);
      world.add(g);
    };
    station(startKm - trainLenKm / 2, fromName);
    station(profile.lengthKm - trainLenKm / 2, toName);

    scene.add(world);
    snap = true;
  }

  /** 선로 위 km 지점(왼쪽 선로)의 세계 좌표 */
  function trackPoint(km, lift = 0, sideways = 0) {
    const p = pointAt(profile, km);
    const [wx, wy, wz] = toWorld(p.x, p.y, p.h);
    const lateral = TRACK_SIDE + sideways;
    return { v: new Vector3(wx + p.dy * lateral, wy + lift, wz - p.dx * lateral), p };
  }

  function placeTrain() {
    let inTunnel = false;
    for (let i = 0; i < carGroups.length; i++) {
      const head = front - carOffsets[i];
      const a = trackPoint(head);
      const b = trackPoint(head - train.cars[i].length / 1000);
      const car = carGroups[i];
      // 칸 안 높이 0은 레일 윗면이다
      car.position.set((a.v.x + b.v.x) / 2, (a.v.y + b.v.y) / 2 + RAIL_TOP, (a.v.z + b.v.z) / 2);
      // 오르막·내리막에서는 차도 기운다(먼저 기울이고 그다음 방향을 돌린다)
      const run = Math.hypot(a.v.x - b.v.x, a.v.z - b.v.z) || 1;
      car.rotation.order = 'YZX';
      car.rotation.set(0, Math.atan2(-(a.v.z - b.v.z), a.v.x - b.v.x), Math.atan2(a.v.y - b.v.y, run));
      if (i === 0) inTunnel = a.p.tunnel;
    }
    tunnelNote.hidden = !inTunnel;
  }

  function cameraGoal(inTunnel) {
    // 터널 안: 기차 앞에서 다가오는 기차를 본다(하늘에서 볼 때는 산만 보인다)
    if (inTunnel && mode !== 'sky' && mode !== 'cabin') return { pos: trackPoint(front + 0.02, 3.4, -1.8).v, look: trackPoint(front - 0.025, 2.6).v };
    if (mode === 'side') {
      // 기차 머리(코)와 첫 칸이 화면에 들어오게
      const at = trackPoint(front - 0.017);
      return { pos: trackPoint(front - 0.017, 5, 30).v, look: at.v.clone().setY(at.v.y + 2.5) };
    }
    if (mode === 'sky') return { pos: trackPoint(front - 0.4, 280, 90).v, look: trackPoint(front + 0.1).v };
    return { pos: trackPoint(front - 0.1, 24, 14).v, look: trackPoint(front + 0.14, 2).v };
  }

  function resize() {
    const w = el.clientWidth || 640;
    const h = Math.round(Math.min(560, Math.max(260, w * 0.62)));
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      canvas.style.height = `${h}px`;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!profile || !el.isConnected || el.offsetParent === null) return;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0);
    last = now;
    resize();
    placeTrain();
    const inTunnel = !tunnelNote.hidden;
    const dark = inTunnel && mode !== 'sky';
    if (dark !== wasDark) {
      // 터널에 들어가고 나올 때는 카메라를 바로 옮긴다(산을 뚫고 지나가는 모습이 보이지 않게)
      snap = true;
      wasDark = dark;
      scene.background.setHex(dark ? TUNNEL_DARK : SKY);
      scene.fog.color.setHex(dark ? TUNNEL_DARK : SKY);
    }
    if (mode === 'cabin') {
      // 객실: 칸과 함께 움직이는 아이 눈높이 카메라(부드럽게 따라가지 않는다)
      mixer.update(reduceMotion ? 0 : dt); // 움직임 줄이기: 서 있는 자세로 멈춘다
      cabinCar.group.updateMatrixWorld(true);
      cabinEye.fromArray(cabin.eye);
      cabinTarget.fromArray(cabin.target);
      cabinCar.inner.localToWorld(cabinEye);
      cabinCar.inner.localToWorld(cabinTarget);
      camera.position.copy(cabinEye);
      camera.lookAt(cabinTarget);
      scene.fog.near = dark ? 40 : 900;
      scene.fog.far = dark ? 420 : 2900;
      renderer.render(scene, camera);
      return;
    }
    const goal = cameraGoal(inTunnel);
    scene.fog.near = dark ? 40 : mode === 'sky' ? 1200 : 900;
    scene.fog.far = dark ? 420 : mode === 'sky' ? 3600 : 2900;
    // 기차 머리에서 얼마나 떨어져 있는지만 부드럽게 바꾼다(그림이 늦게 그려져도 기차를 놓치지 않는다)
    const anchor = trackPoint(front).v;
    goal.pos.sub(anchor);
    goal.look.sub(anchor);
    if (snap || reduceMotion) {
      camPos.copy(goal.pos);
      camLook.copy(goal.look);
      snap = false;
    } else {
      const k = 1 - Math.exp(-dt * 3);
      camPos.lerp(goal.pos, k);
      camLook.lerp(goal.look, k);
    }
    camera.position.copy(camPos).add(anchor);
    // 땅속(산비탈 안)으로 들어가지 않게 땅 위로 올린다. 터널 안에서는 올리지 않는다.
    const floor = dark ? -Infinity : surfaceAt(camera.position.x, camera.position.z) + 6;
    if (camera.position.y < floor) camera.position.y = floor;
    camera.lookAt(camLook.clone().add(anchor));
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  // 보는 곳 단추
  const camRow = element('div', 'tr3d-cams');
  camRow.setAttribute('role', 'group');
  camRow.setAttribute('aria-label', '3D에서 보는 곳');
  const camButtons = [
    ['side', '옆에서'],
    ['chase', '뒤에서'],
    ['sky', '하늘에서'],
  ].map(([id, label]) => {
    const b = element('button', 'button', label);
    b.type = 'button';
    b.addEventListener('click', () => {
      mode = id;
      outsideMode = id;
      snap = reduceMotion;
      mark();
    });
    b.dataset.mode = id;
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
  el.append(element('p', 'panel-note', '3D 시험판이에요. 땅 높이는 1km 칸마다 잰 값이라 거칠어요. 산은 2.5배 높게 그렸어요.'));
  el.append(element('p', 'panel-note', '건물과 나무, 산의 작은 굴곡은 우리가 지어 놓은 거예요. 사는 사람 수와 땅 모양을 보고 정했어요.'));

  const api = {
    el,
    /**
     * 한 구간을 정한다(역에 섰을 때 다음 역까지).
     * @param {{points: Array<[number, number]>, speedAt: (t: number) => number, fromName: string, toName: string}} route
     */
    setRoute({ points, speedAt, fromName, toName }) {
      buildWorld(points, fromName, toName);
      frac = distanceFraction(speedAt);
      front = startKm;
    },
    /** 구간 안에서 흐른 시간 비율(0~1) */
    setProgress(t) {
      if (!profile) return;
      front = startKm + (profile.lengthKm - startKm) * frac(t);
    },
    setDisplay(lines) {
      displayBox.replaceChildren(...lines.map((line) => element('div', null, line)));
      cabin.setDisplay(lines);
    },
    /**
     * 'cabin'(객실 안, 아이 눈높이) 또는 'outside'(밖에서 따라가며 보기)
     * @param {'cabin'|'outside'} view
     */
    setView(view) {
      const inCabin = view === 'cabin';
      if (inCabin && mode !== 'cabin') outsideMode = mode;
      mode = inCabin ? 'cabin' : outsideMode;
      cabin.group.visible = inCabin;
      cabinCar.body.visible = !inCabin; // 칸 바깥 껍데기가 창을 가리지 않게
      camera.fov = inCabin ? 58 : 55;
      camera.near = inCabin ? 0.1 : 1;
      camera.updateProjectionMatrix();
      camRow.style.display = inCabin ? 'none' : '';
      // 객실 천장처럼 아래를 보는 면이 풀빛 땅 색을 받지 않게, 객실 안에서는 아래쪽 빛을 밝게
      hemi.groundColor.setHex(inCabin ? 0xd9d5cc : 0x6b7a4a);
      displayBox.hidden = inCabin; // 객실 안에는 안내판이 있다
      canvas.setAttribute('aria-label', inCabin ? '기차 객실 안 3D 그림' : '기차 밖에서 본 3D 그림');
      snap = true;
      mark();
    },
    /** 주인공 동작: 'stand'(서 있기) 또는 춤 이름. 춤은 한 번 춘 뒤 다시 선다. */
    playHero(id) {
      const clip = id === 'stand' ? hero.clips.idle : hero.clips[id];
      if (!clip) return;
      const next = mixer.clipAction(clip);
      next.reset();
      if (id === 'stand' || reduceMotion) next.setLoop(LoopRepeat, Infinity);
      else {
        next.setLoop(LoopOnce, 1);
        next.clampWhenFinished = true;
      }
      next.play();
      if (heroAction !== next) heroAction.crossFadeTo(next, 0.3, false);
      heroAction = next;
    },
    /** 춤이 끝나 다시 섰을 때 알려 준다(동작 단추 표시를 맞추려고) */
    onHero(fn) {
      heroDone = fn;
    },
    destroy() {
      cancelAnimationFrame(raf);
      disposeWorld();
      mixer.stopAllAction();
      hero.dispose();
      cabin.dispose();
      train.dispose();
      scene.traverse((o) => o.geometry?.dispose());
      for (const m of Object.values(materials)) m.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
  // 개발할 때만: 그림을 살펴보려고 진행 정도를 손으로 정한다(배포물에는 들어가지 않는다)
  if (import.meta.env?.DEV) el.devApi = api;
  return api;
}
