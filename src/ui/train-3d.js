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
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { buildTrain } from './train-3d-cars.js';
import { boxPoint, buildStation, stationData } from './train-3d-station.js';
import { railStationById } from '../data.js';
import { Parts } from './train-3d-cars.js';
import { buildCabin } from './train-3d-cabin.js';
import { buildHero } from './hero-model.js';
import { INTERIOR } from './train-interior.js';
import heroData from '../content/hero/hero3d.json';
import heroTextureUrl from '../content/hero/hero3d.webp';
import { cellNoise, distanceFraction, extendBack, extendForward, groundAt, headOf, joinPoints, pointAt, routeProfile, tailOf, terrainAt } from '../sim/train-3d-path.js';

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
/** 이 구간 앞에 붙이는 앞 구간 선로(km): 역에 들어오는 기차가 달려올 길 */
const LEAD_KM = 1.2;
/** 이 구간 뒤에 붙이는 다음 구간 선로(km): 다음 역에서 기차 앞쪽 절반이 설 자리 */
const TRAIL_KM = 0.6;
/** 승강장 높이(선로 높이에서, 미터) */
const PLATFORM_TOP = 1.1;
/** 승강장에서 보는 아이 눈높이(승강장 바닥에서, 미터) */
const PLATFORM_EYE = 1.1;
/** 들어오는 기차: 카메라 너머 이만큼(km) 뒤에서 나타나, 이 빠르기(m/s)로 달려오다 마지막 BRAKE_M에서 브레이크를 건다 */
const ARRIVE_BEYOND_KM = 0.3;
const ARRIVE_SPEED = 30;
const BRAKE_M = 130;
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
function tunnelGeometry(profile, toWorld, radius = 6.5, segs = 8, skip = () => false) {
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
    if (i > 0 && profile.tunnel[i - 1] && profile.tunnel[i] && !skip(i)) {
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

/**
 * 역에 들어오는 기차가 sec초 동안 간 거리(미터). ARRIVE_SPEED로 달리다 마지막 BRAKE_M에서 고르게 느려져 distM에서 선다.
 */
function arrivalDistance(distM, sec) {
  const brake = Math.min(distM, BRAKE_M);
  const decel = (ARRIVE_SPEED * ARRIVE_SPEED) / (2 * BRAKE_M);
  const vb = Math.sqrt(2 * decel * brake);
  const cruise = (distM - brake) / ARRIVE_SPEED;
  if (sec <= cruise) return sec * ARRIVE_SPEED;
  const t = Math.min(sec - cruise, vb / decel);
  return Math.min(distM, distM - brake + vb * t - (decel * t * t) / 2);
}


/** 대합실 출발 안내판(어두운 판에 줄마다 시각, 열차, 번호, 가는 곳) */
function drawDepartureBoard(canvas, title, rows, highlight) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = '#101317';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffb347';
  g.font = 'bold 38px sans-serif';
  g.textBaseline = 'middle';
  g.fillText(title, 24, 34);
  const rowH = (H - 70) / 6;
  rows.slice(0, 6).forEach((r, i) => {
    const y = 70 + rowH * i + rowH / 2;
    if (i === highlight) {
      g.fillStyle = '#2f4a2a';
      g.fillRect(8, y - rowH / 2 + 3, W - 16, rowH - 6);
    }
    g.fillStyle = i === highlight ? '#c8ff9c' : '#ffd27a';
    g.font = 'bold 34px sans-serif';
    g.fillText(r.time, 24, y);
    g.fillText(r.kind, 150, y, 260);
    g.fillText(String(r.no), 430, y);
    g.fillText(r.to, 560, y, 280);
    if (r.note) g.fillText(r.note, 860, y, 150);
  });
}

/**
 * 대합실 안(역 건물 안쪽): 바닥, 천장 등, 기둥, 개찰구, 출발 안내판, 의자, 승차권 발매기.
 * @param {{o: object, base: number, top: number, vSide: number}} hall 역 건물(둘러싼 직사각형)
 * @returns {{group: Group, eye: Vector3, look: Vector3, hero: Vector3, heroYaw: number, board: HTMLCanvasElement, texture: CanvasTexture, dispose: () => void}}
 */
function buildConcourse(hall, materials, accent) {
  const { o, base, top, vSide } = hall;
  const parts = new Parts();
  const glow = new Parts();
  const floor = base + 0.08;
  const ceil = Math.min(top - 0.4, floor + 7.5);
  // 대합실 방: 출입구 쪽 벽에 붙여 둔다(건물이 아주 넓으면 그 한쪽만 방으로 쓰고 안쪽 벽으로 막는다)
  const A = Math.max(6, Math.min(28, o.A - 1));
  const B = Math.max(4, Math.min(10, o.B - 1));
  const roomCenter = vSide * (o.B - 1 - B);
  /** 방 안의 점(u: 긴 축, v: 방 가운데에서 출입구 쪽이 +vSide) */
  const at = (u, v) => boxPoint(o, u, roomCenter + v);
  const yaw = Math.atan2(-o.uz, o.ux);
  const put = (u, v, y0, y1, l, w, color, into = parts) => {
    const [x, z] = at(u, v);
    const g = new BoxGeometry(l, y1 - y0, w);
    g.rotateY(yaw);
    g.translate(x, (y0 + y1) / 2, z);
    into.add(g, color);
  };
  put(0, 0, floor - 0.1, floor, A * 2, B * 2, '#cfd3d6'); // 바닥(반들반들한 돌)
  for (let u = -A + 2; u < A - 1; u += 4) put(u, 0, floor + 0.001, floor + 0.004, 0.06, B * 2, '#bfc4c8'); // 바닥 줄눈
  put(0, 0, ceil, ceil + 0.15, A * 2, B * 2, '#eef0f1'); // 천장
  // 안쪽 벽(건물 벽이 아닌 쪽)
  if (o.B - 1 - B > 0.5) put(0, -vSide * B, floor, ceil, A * 2, 0.25, '#e8e5de');
  if (o.A - 1 - A > 0.5) for (const su of [-A, A]) put(su, 0, floor, ceil, 0.25, B * 2, '#e8e5de');
  for (let u = -A + 2; u < A - 1; u += 4) for (let v = -B + 2; v < B - 1; v += 4) put(u, v, ceil - 0.03, ceil, 1.6, 0.4, '#ffffff', glow);
  for (let u = -A + 4.5; u < A - 3; u += 9) for (const v of [-B * 0.45, B * 0.45]) put(u, v, floor, ceil, 0.7, 0.7, '#e2e4e6'); // 기둥
  // 개찰구: 선로 쪽 벽 앞
  const gv = -vSide * (B - 3.2);
  const gates = Math.max(4, Math.min(10, Math.floor(A * 0.6)));
  for (let k = 0; k <= gates; k++) {
    const u = (k - gates / 2) * 1.3;
    put(u, gv, floor, floor + 1.05, 0.28, 1.3, '#cfd4d8');
    put(u, gv - vSide * 0.66, floor + 0.85, floor + 1.06, 0.3, 0.02, '#2d8a4e');
    if (k < gates) put(u + 0.65, gv, floor + 0.55, floor + 0.95, 0.5, 0.03, '#9fc3dd');
  }
  put(-gates * 0.65 - 1.6, gv, floor, floor + 1.05, 2.6, 1.3, '#cfd4d8');
  put(gates * 0.65 + 1.6, gv, floor, floor + 1.05, 2.6, 1.3, '#cfd4d8');
  // 출발 안내판(개찰구 위)
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 380;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const boardMat = new MeshBasicMaterial({ map: texture });
  const boardGeo = new PlaneGeometry(8, 3);
  const board = new Mesh(boardGeo, boardMat);
  const bp = at(0, gv - vSide * 0.4);
  board.position.set(bp[0], floor + 3.7, bp[1]);
  board.rotation.y = yaw + (vSide > 0 ? 0 : Math.PI); // 출입구 쪽을 본다
  put(0, gv - vSide * 0.5, floor + 2.1, floor + 5.3, 8.4, 0.15, '#2a2d31');
  // 의자: 출입구 쪽, 파란 의자 줄
  if (B > 6) {
    for (const v of [vSide * (B * 0.25), vSide * (B * 0.25 + 1.6)]) {
      for (let u = -A * 0.5; u < A * 0.5 - 1; u += 0.62) {
        if (Math.abs(u) < 2.2) continue; // 가운데 길
        put(u, v, floor + 0.42, floor + 0.48, 0.5, 0.5, '#2f5fa8');
        put(u, v + vSide * 0.23, floor + 0.48, floor + 0.95, 0.5, 0.06, '#2f5fa8');
      }
      put(0, v, floor, floor + 0.42, A - 1, 0.35, '#5d6670');
    }
  }
  // 승차권 발매기: 한쪽 벽
  for (let k = 0; k < 3; k++) put(-A + 0.6, -vSide * (B * 0.2) + k * 1.1 * vSide, floor, floor + 1.7, 0.7, 0.9, k % 2 ? '#3a6fb2' : '#2f5fa8');
  // 위쪽 이름 띠(역 꾸밈 색)
  put(0, gv - vSide * 0.45, floor + 5.6, floor + 5.9, A * 1.6, 0.1, accent);
  const group = new Group();
  group.add(new Mesh(parts.geometry(), materials.car), new Mesh(glow.geometry(), materials.glowV), board);
  const e = at(0, vSide * (B - 2.2));
  const l = at(0, gv);
  const h = at(0.7, vSide * (B - 5.6));
  return {
    group,
    eye: new Vector3(e[0], floor + 1.1, e[1]),
    look: new Vector3(l[0], floor + 3.1, l[1]),
    hero: new Vector3(h[0], floor, h[1]),
    heroYaw: Math.atan2(-o.uz * vSide, o.ux * vSide), // 출입구 쪽(카메라)을 본다
    canvas,
    texture,
    dispose() {
      boardGeo.dispose();
      boardMat.dispose();
      texture.dispose();
    },
  };
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
  el.append(element('div', 'tr3d-credit', '선로·역 모양 © OpenStreetMap contributors'));

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
    glowV: new MeshBasicMaterial({ vertexColors: true }),
    carDouble: new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }),
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
  /** 지금 기차가 선(또는 설) 역의 승강장 */
  const stopHere = () => (Math.abs(front - startKm) <= Math.abs(front - endStopKm) ? stops.from : stops.to);
  /** 기차가 서 있을 때 탈 칸 뒤쪽 문의 자리(km) */
  const boardingDoorKm = () => startKm - carOffsets[cabinIndex] - (cabinCar.length - 1.4) / 1000;
  /** 들어오는 기차의 처음 머리 자리(km): 카메라(탈 문 옆) 너머에서 나타난다 */
  const arriveFromKm = () => Math.max(trainLenKm, boardingDoorKm() - ARRIVE_BEYOND_KM);
  const cabinEye = new Vector3();
  const cabinTarget = new Vector3();

  let world = null; // 지금 구간의 땅, 선로, 건물
  let profile = null;
  /** 지금 구간 땅 높이(세계 좌표 x, z → 미터, 부풀린 값). 카메라가 땅속에 들어가지 않게 쓴다. */
  let surfaceAt = () => -Infinity;
  let origin = [0, 0];
  let frac = (t) => t;
  let startKm = 0;
  let endStopKm = 0; // 다음 역에 섰을 때 기차 머리 자리
  let segStartKm = 0; // 이 구간 첫 역 지점
  let segEndKm = 0; // 다음 역 지점
  /** 서는 승강장: from(이 역), to(다음 역). side 1 = 가는 쪽 왼편 */
  let stops = { from: { side: 1, edge: 2.15, width: 4.5 }, to: { side: 1, edge: 2.15, width: 4.5 } };
  const facadeMaterials = new Map(); // 역 건물 외벽 재질(무늬마다 하나, 구간이 바뀌어도 함께 쓴다)
  let hallFrom = null; // 이 역 건물(대합실 자리)
  let lastDebug = null; // 개발할 때만: 역 맞추기 숫자
  let overTops = { from: [0, 0], to: [0, 0] }; // 선상역사 높이와 왼편 너비(밖에서 보기 역 장면 카메라)
  let concourse = null; // 대합실 안(buildConcourse)
  let boardRows = { title: '', rows: [], highlight: -1 };
  const ensureConcourse = () => {
    if (concourse || !hallFrom || !world) return concourse;
    concourse = buildConcourse(hallFrom, materials, look.accent);
    world.add(concourse.group);
    drawDepartureBoard(concourse.canvas, boardRows.title, boardRows.rows, boardRows.highlight);
    concourse.texture.needsUpdate = true;
    return concourse;
  };
  let front = 0;
  let mode = 'side'; // 처음에는 옆에서 본다(긴 기차가 한눈에 보인다)
  let outsideMode = 'side'; // 객실에 들어갔다 나오면 돌아갈 밖 보기
  let currentRoute = null; // 지금 지어 둔 구간(같은 구간이면 다시 짓지 않는다)
  let approach = null; // 역에 들어오는 중: {from, to, start, ms, done}
  let doorAmount = 0; // 승강장 쪽 문이 열린 정도(0~1)
  let doorTarget = 0;
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
  function buildWorld(points, route, leadKm, segKm) {
    const { fromName, toName, fromId = null, toId = null } = route;
    segStartKm = leadKm;
    segEndKm = leadKm + segKm;
    // 고속선은 산을 터널로 곧게 뚫고 가서 오르내림이 더 적다
    profile = routeProfile(grid, points, { smoothKm: highSpeed ? 4 : 2, tunnelM: 20 });
    // 실제 역 자리(선로 길은 역에서 수백 m 떨어진 꼭짓점에서 시작할 수 있다): 선로 위에서 역과 가장 가까운 점
    const stationKm = (id, k0) => {
      const g = stationData(id)?.origin ?? (railStationById.get(id) ? [railStationById.get(id).x, railStationById.get(id).y] : null);
      if (!g) return k0;
      let best = k0;
      let bd = Infinity;
      for (let i = 0; i < profile.s.length; i++) {
        if (Math.abs(profile.s[i] - k0) > 1.1) continue;
        const d = Math.hypot(profile.x[i] - g[0], profile.y[i] - g[1]);
        if (d < bd) {
          bd = d;
          best = profile.s[i];
        }
      }
      return best;
    };
    const fromK = stationKm(fromId, segStartKm);
    const toK = Math.min(stationKm(toId, segEndKm), profile.lengthKm - 0.25);
    // 역 안 선로 자료가 있는 역 둘레에서는 기본 두 번째 선로를 숨기고 실제 선로를 그린다(train-3d-station.js)
    const yardFrom = (stationData(fromId)?.tracks?.length ?? 0) >= 2;
    const yardTo = (stationData(toId)?.tracks?.length ?? 0) >= 2;
    const inYard = (k) => (yardFrom && Math.abs(k - fromK) < 0.35) || (yardTo && Math.abs(k - toK) < 0.35);
    const inStation = (k) => Math.abs(k - fromK) < trainLenKm / 2 + 0.08 || Math.abs(k - toK) < trainLenKm / 2 + 0.08;
    disposeWorld();
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
      const keep = side > 0 ? () => true : (i) => !inYard(profile.s[i]);
      world.add(new Mesh(ribbonGeometry(profile, toWorld, { lateral: side, half: 1.6, dy: 0.15, keep }), mat(0x857c70)));
      for (const r of [0.72, -0.72]) world.add(new Mesh(ribbonGeometry(profile, toWorld, { lateral: side + r, half: 0.1, dy: 0.45, keep }), mat(0x55504a)));
    }
    // 터널: 둥근 벽과 50m마다 등
    if (profile.tunnel.some(Boolean)) {
      // 지하역 안(큰 방)에는 둥근 터널 벽을 그리지 않는다
      const undergroundAt = (k) => pointAt(profile, k).tunnel;
      const skipArch = (i) => (undergroundAt(fromK) && Math.abs(profile.s[i] - fromK) < trainLenKm / 2 + 0.03) || (undergroundAt(toK) && Math.abs(profile.s[i] - toK) < trainLenKm / 2 + 0.03);
      world.add(new Mesh(tunnelGeometry(profile, toWorld, 6.5, 8, skipArch), new MeshLambertMaterial({ color: 0x77726a, emissive: 0x2c2a26, side: DoubleSide })));
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
        // 역(승강장) 안에는 기둥을 세우지 않는다(승강장 위에 서지 않게)
        const shown = inStation(profile.s[i]) ? 0 : 1;
        for (const [m, side] of [[0, 6.3], [1, -6.3]]) {
          dummy.position.set(wx + p.dy * side, wy + 3.75, wz - p.dx * side);
          dummy.rotation.set(0, yaw, 0);
          dummy.scale.set(shown, shown, shown);
          dummy.updateMatrix();
          poles.setMatrixAt(j * 2 + m, dummy.matrix);
        }
        dummy.position.set(wx, wy + 7.2, wz);
        dummy.updateMatrix();
        arms.setMatrixAt(j, dummy.matrix);
        dummy.scale.set(1, 1, 1);
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
          if (side < 0 && inYard(profile.s[i0])) continue;
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

    // 역: 앞 역과 다음 역(역 지점을 가운데로 기차가 선다). 실제 역사·승강장 자료가 있으면 그대로(train-3d-station.js)
    const stationCtx = { profile, toWorld, origin, meshHeight, look, materials, trainLenKm, TRACK_SIDE, PLATFORM_TOP, textures: facadeMaterials };
    const fromStation = buildStation({ ...stationCtx, id: fromId, name: fromName, centerKm: segStartKm, secondTrackHidden: yardFrom });
    const toStation = buildStation({ ...stationCtx, id: toId, name: toName, centerKm: segEndKm, secondTrackHidden: yardTo });
    world.add(fromStation.group, toStation.group);
    // 기차 가운데가 서는 승강장 가운데에 오게(실제 승강장이 역 지점에서 앞뒤로 떨어져 있을 수 있다)
    startKm = segStartKm + fromStation.stopShiftKm + trainLenKm / 2;
    endStopKm = segEndKm + toStation.stopShiftKm + trainLenKm / 2;
    stops = { from: fromStation.stop, to: toStation.stop };
    overTops = { from: [fromStation.overTop, fromStation.overSpan], to: [toStation.overTop, toStation.overSpan] };
    lastDebug = { from: fromStation.debug, to: toStation.debug };
    hallFrom = fromStation.hall;
    concourse = null; // 대합실은 처음 볼 때 짓는다

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
    if (inTunnel && mode !== 'sky' && mode !== 'cabin' && mode !== 'platform') return { pos: trackPoint(front + 0.02, 3.4, -1.8).v, look: trackPoint(front - 0.025, 2.6).v };
    if (mode === 'side') {
      // 기차 머리(코)와 첫 칸이 화면에 들어오게
      const at = trackPoint(front - 0.017);
      const run = { pos: trackPoint(front - 0.017, 5, 30).v, look: at.v.clone().setY(at.v.y + 2.5) };
      // 역에 서 있거나 가까우면 조금 물러나 높이 올라가서 승강장 지붕, 건너는 다리, 역 건물까지 보이게
      const fromStop = Math.min(Math.abs(front - startKm), Math.abs(endStopKm - front));
      const w = Math.max(0, 1 - fromStop / 0.25);
      if (w <= 0) return run;
      const atFrom = Math.abs(front - startKm) < Math.abs(endStopKm - front);
      const stopCenter = (atFrom ? startKm : endStopKm) - trainLenKm / 2;
      // 역 가운데 조금 앞에서 비스듬히 뒤를 본다. 선로 위에 걸친 역사가 있으면 그보다 높이.
      const [over, span] = atFrom ? overTops.from : overTops.to;
      // 선상역사가 있으면 건물 옆 바깥에서 건물 높이쯤으로 선로를 본다(선로 위 유리 띠와 그 아래 기차)
      const shot =
        over > 0
          ? { pos: trackPoint(stopCenter + 0.06, over * 0.75, Math.max(36, span + 28)).v, look: trackPoint(stopCenter - 0.01, over * 0.45, 0).v }
          : { pos: trackPoint(stopCenter + 0.05, 9, 36).v, look: trackPoint(stopCenter - 0.01, 4.5, -8).v };
      return { pos: run.pos.lerp(shot.pos, w), look: run.look.lerp(shot.look, w) };
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
    // 역에 들어오는 기차: 달려오다 브레이크를 걸어 선다(arrivalDistance)
    if (approach) {
      if (!approach.start) approach.start = now;
      const sec = reduceMotion ? Infinity : (now - approach.start) / 1000;
      const gone = arrivalDistance(approach.distM, sec);
      front = approach.from + gone / 1000;
      if (gone >= approach.distM - 1e-6) {
        front = startKm;
        const done = approach.done;
        approach = null;
        done();
      }
    }
    // 문: 0.9초에 걸쳐 열고 닫는다
    if (doorAmount !== doorTarget) {
      const stepAmt = reduceMotion ? 1 : dt / 0.9;
      doorAmount = doorTarget > doorAmount ? Math.min(doorTarget, doorAmount + stepAmt) : Math.max(doorTarget, doorAmount - stepAmt);
      train.setDoors(doorAmount, -stopHere().side);
    }
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
    if (mode === 'concourse') {
      // 대합실: 출입구 쪽 아이 눈높이에서 개찰구와 출발 안내판을 본다
      mixer.update(reduceMotion ? 0 : dt);
      const c = ensureConcourse();
      if (c) {
        camera.position.copy(c.eye);
        camera.lookAt(c.look);
        hero.root.position.copy(c.hero);
        hero.root.rotation.set(0, c.heroYaw, 0);
      }
      scene.fog.near = 900;
      scene.fog.far = 2900;
      renderer.render(scene, camera);
      return;
    }
    if (mode === 'platform') {
      // 승강장: 아이 눈높이에서 기차가 들어오는 쪽을 본다. 주인공은 안전선 뒤에 서 있다.
      mixer.update(reduceMotion ? 0 : dt);
      // 탈 칸의 문 옆에 서서 기차가 들어오는 쪽을 비스듬히 본다
      const top = PLATFORM_TOP + PLATFORM_EYE;
      const door = boardingDoorKm();
      const st = stops.from;
      camera.position.copy(trackPoint(door + 0.007, top, st.side * (st.edge + Math.min(3.2, st.width * 0.35))).v);
      camera.lookAt(trackPoint(door - 0.035, PLATFORM_TOP + 1.2, 0).v);
      const spot = trackPoint(door + 0.0025, PLATFORM_TOP, st.side * (st.edge + 1.0));
      hero.root.position.copy(spot.v);
      // 선로 쪽을 보되 카메라 쪽으로 조금 돌아선다
      const { dx, dy } = spot.p;
      const toTrack = [-dy * st.side, dx * st.side];
      const toCam = [dx, dy];
      const fx = 0.6 * toTrack[0] + 0.8 * toCam[0];
      const fz = 0.6 * toTrack[1] + 0.8 * toCam[1];
      hero.root.rotation.set(0, Math.atan2(fx, fz), 0);
      scene.fog.near = 900;
      scene.fog.far = 2900;
      renderer.render(scene, camera);
      return;
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
  el.append(element('p', 'panel-note', '역 건물과 승강장은 실제 자리와 모양을 따랐어요. 높이와 겉모습은 사진을 보고 어림했어요.'));

  const api = {
    el,
    /**
     * 한 구간을 정한다(역에 섰을 때 다음 역까지).
     * @param {{points: Array<[number, number]>, speedAt: (t: number) => number, fromName: string, toName: string}} route
     */
    setRoute(route) {
      if (route === currentRoute) return;
      currentRoute = route;
      const { points, speedAt, lead = null, trail = null } = route;
      // 앞 구간 선로를 붙인다(역에 들어오는 기차가 달려올 길). 앞 구간을 모르면 첫 방향으로 곧게 늘인다.
      const leadPts = lead === 'extend' ? extendBack(points, LEAD_KM) : Array.isArray(lead) && lead.length >= 2 ? tailOf(lead, LEAD_KM) : null;
      const lengthOf = (pts) => pts.slice(1).reduce((sum, q, k) => sum + Math.hypot(q[0] - pts[k][0], q[1] - pts[k][1]), 0);
      let lead2 = leadPts;
      // 앞 구간이 짧으면 그 앞을 곧게 늘여 들어오는 기차가 다 들어갈 만큼 둔다
      if (lead2 && lengthOf(lead2) < LEAD_KM - 0.01) lead2 = joinPoints(extendBack(lead2, LEAD_KM - lengthOf(lead2)), lead2);
      const leadKm = lead2 ? lengthOf(lead2) : 0;
      // 뒤에도 다음 구간 선로(없으면 곧게)를 붙인다: 다음 역에서 기차가 역 지점을 가운데로 선다
      const trailPts = Array.isArray(trail) && trail.length >= 2 ? headOf(trail, TRAIL_KM) : extendForward(points, TRAIL_KM);
      let tail2 = trailPts;
      if (lengthOf(tail2) < TRAIL_KM - 0.01) tail2 = joinPoints(tail2, extendForward(tail2, TRAIL_KM - lengthOf(tail2)));
      let all = lead2 ? joinPoints(lead2, points) : points;
      all = joinPoints(all, tail2);
      buildWorld(all, route, leadKm, lengthOf(points));
      frac = distanceFraction(speedAt);
      front = startKm;
      approach = null;
      train.setDoors(doorAmount, -stops.from.side); // 승강장 쪽이 바뀌었을 수 있다
      for (const g of carGroups) g.visible = true;
    },
    /** 구간 안에서 흐른 시간 비율(0~1) */
    setProgress(t) {
      if (!profile) return;
      if (approach) return;
      front = startKm + (endStopKm - startKm) * frac(t);
    },
    /**
     * 승강장에서 기차를 기다린다. 처음 떠나는 역이면 기차가 이미 서 있고, 아니면 아직 안 보인다.
     * @param {boolean} waiting 기차가 이미 승강장에 서 있는지
     */
    waitAtPlatform(waiting) {
      approach = null;
      front = waiting ? startKm : arriveFromKm();
      for (const g of carGroups) g.visible = waiting;
    },
    /** 기차가 들어와 선다. 다 서면 끝나는 약속을 돌려준다. */
    arrive() {
      if (carGroups[0].visible && Math.abs(front - startKm) < 1e-6) return Promise.resolve();
      for (const g of carGroups) g.visible = true;
      const from = arriveFromKm();
      return new Promise((done) => {
        approach = { from, distM: (startKm - from) * 1000, start: 0, done };
      });
    },
    /** 승강장 쪽(가는 쪽 왼편) 문을 열거나 닫는다 */
    setDoors(open) {
      doorTarget = open ? 1 : 0;
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
      const inHall = view === 'concourse';
      const onPlatform = view === 'platform' || inHall; // 승강장·대합실은 화면 구성이 같다(카메라만 다르다)
      mode = inCabin ? 'cabin' : inHall ? 'concourse' : view === 'platform' ? 'platform' : outsideMode;
      cabin.group.visible = inCabin;
      cabinCar.body.visible = !inCabin; // 칸 바깥 껍데기가 창을 가리지 않게
      for (const d of cabinCar.doors) d.mesh.visible = !inCabin;
      // 주인공: 객실에서는 복도에, 승강장에서는 승강장 위에(위치는 그릴 때마다 정한다)
      if (inCabin) {
        cabin.group.add(hero.root);
        hero.root.position.set(cabin.hero.x, cabin.hero.y, cabin.hero.z);
        hero.root.rotation.set(0, -Math.PI / 2, 0);
      } else if (onPlatform) scene.add(hero.root);
      else hero.root.removeFromParent();
      camera.fov = inCabin || onPlatform ? 58 : 55;
      camera.near = inCabin || onPlatform ? 0.1 : 1;
      camera.updateProjectionMatrix();
      camRow.style.display = inCabin || onPlatform ? 'none' : '';
      // 객실 천장처럼 아래를 보는 면이 풀빛 땅 색을 받지 않게, 객실 안에서는 아래쪽 빛을 밝게
      hemi.groundColor.setHex(inCabin || onPlatform ? 0xd9d5cc : 0x6b7a4a);
      displayBox.hidden = inCabin || onPlatform; // 객실 안에는 안내판이 있다
      canvas.setAttribute('aria-label', inCabin ? '기차 객실 안 3D 그림' : inHall ? '역 대합실 3D 그림' : onPlatform ? '기차가 들어오는 승강장 3D 그림' : '기차 밖에서 본 3D 그림');
      snap = true;
      mark();
    },
    /**
     * 대합실 출발 안내판의 줄
     * @param {string} title
     * @param {Array<{time: string, kind: string, no: (string|number), to: string, note?: string}>} rows
     * @param {number} highlight 내 기차 줄(없으면 -1)
     */
    setConcourseBoard(title, rows, highlight) {
      boardRows = { title, rows, highlight };
      if (concourse) {
        drawDepartureBoard(concourse.canvas, title, rows, highlight);
        concourse.texture.needsUpdate = true;
      }
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
  if (import.meta.env?.DEV) {
    el.devApi = api;
    el.dev3d = { scene, camera, trackPoint: (...x) => trackPoint(...x), hero: hero.root, get world() { return world; }, get startKm() { return startKm; }, get stops() { return stops; }, get hall() { return hallFrom; }, get debug() { return lastDebug; } };
  }
  return api;
}
