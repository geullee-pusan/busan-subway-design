// 지하철 3D 보기: 부산 도시철도 1~4호선과 부산김해경전철. 승강장(아이 눈높이, 안전문), 열차 안, 밖에서(옆·뒤·하늘).
// 칸 치수와 칸 수, 출입문 수는 부산교통공사 전동차 제원(data/facts.json subwayCars)이다. 부산김해경전철은 제원 자료가 없어 어림이다.
// 칠은 부산교통공사 전동차 종이 접기 모형 그림(2011)과 사용자가 보내 준 열차 사진을 보고 특징만 따라 그렸다(로고·글씨는 넣지 않는다).
// 역 사이 길은 두 역 자리를 부드럽게 이은 것이고, 땅속(주소에 "지하")이면 터널, 아니면 고가로 그린다. 터널·고가·역 모양은 우리가 지은 것이다.
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
import { cellNoise, groundAt } from '../sim/train-3d-path.js';
import { Parts } from './train-3d-cars.js';
import { facadeTexture, Mesher } from './train-3d-station.js';
import { along, lengthOf } from './bus-3d.js';
import { buildHero } from './hero-model.js';
import heroData from '../content/hero/hero3d.json';
import heroTextureUrl from '../content/hero/hero3d.webp';

const SKY = 0xcfe6f5;
const TUNNEL = 0x1c1f22;
const EYE = 1.1;
/** 승강장 안전문까지(선로 가운데에서, 미터) */
const EDGE = 1.75;

/**
 * 노선별 차량. L·W·H(미터)와 칸 수, 한쪽 출입문 수는 부산교통공사 제원(1~4호선).
 * 칠: 바탕(body), 앞판(front), 띠(band, band2), 창 둘레(win).
 */
export const SUBWAY_CARS = {
  1: { L: 17.5, W: 2.75, H: 3.67, cars: 8, doors: 3, body: '#C9CDD2', front: '#1F2327', band: '#F07A1A', band2: null, frontBand: '#F07A1A', lower: '#B9BEC3', seat: '#3F6FB3', rubber: false },
  // 1호선은 새 차가 두 가지(빨강에 가까운 주황 띠와 주황 띠)라서 편성마다 고른다
  '1b': { L: 17.5, W: 2.75, H: 3.67, cars: 8, doors: 3, body: '#CDD0D4', front: '#1F2327', band: '#E8451E', band2: null, frontBand: '#E8451E', lower: '#C2C5C9', seat: '#3F6FB3', rubber: false },
  2: { L: 17.5, W: 2.75, H: 3.64, cars: 6, doors: 4, body: '#C5C9CE', front: '#2A2E33', band: '#4DB848', band2: '#2E8B3E', frontBand: '#4DB848', lower: '#B8BCC1', seat: '#3E8E4A', rubber: false },
  3: { L: 17.5, W: 2.75, H: 3.6, cars: 4, doors: 4, body: '#D3CFC6', front: '#D8D5CE', band: '#C8743A', band2: '#F2C230', frontBand: '#C8743A', lower: '#BDB8AE', seat: '#B5652E', rubber: false },
  4: { L: 9.14, W: 2.4, H: 3.5, cars: 6, doors: 2, body: '#F2F3F5', front: '#1E2125', band: '#4A7FDB', band2: '#A9C4F0', frontBand: '#3F78D9', lower: '#3A3F45', seat: '#3F6FB3', rubber: true, panel: true },
  // 부산김해경전철: 길이·폭·높이와 2칸(Mc-Mc)은 사용자가 붙여 준 제원(data/facts.json subwayCars.BGL, 나무위키로 보임), 한쪽 문 수는 어림
  BGL: { L: 14.0, W: 2.65, H: 3.4, cars: 2, doors: 2, thirdRail: true, body: '#F1F2F2', front: '#1E2125', band: '#E8401C', band2: null, frontBand: '#E8401C', lower: '#6B7076', seat: '#C8402A', rubber: false, rim: true },
  // 동해선(코레일 광역전철): 길이·폭·높이와 4칸(Tc-M'-M'-Tc)은 사용자가 붙여 준 제원(data/facts.json subwayCars.DH), 한쪽 문 수는 어림. 은색 차체, 파란 앞 테두리
  DH: { L: 19.5, W: 3.12, H: 3.75, cars: 4, doors: 4, body: '#C9CDD2', front: '#F2F3F4', band: '#1F4FB5', band2: null, frontBand: '#1F4FB5', lower: '#B9BEC3', seat: '#3F6FB3', rubber: false, rim: true },
};

/**
 * 땅속 역 승강장 모양(사용자가 보내 준 승강장 사진을 보고 정함): 1호선은 어두운 천장과 대리석 빛 바닥, 문 앞 점자 블록.
 * 2호선(그리고 나머지)은 밝은 천장, 회색 타일 바닥, 승강장을 따라 이어진 점자 블록, 둥근 타일 기둥.
 */
const STATION_LOOK = {
  1: { ceil: '#34383b', floor: '#d8cdb8', pillar: '#e2e0da', round: false, tactileLine: false },
  // 3호선: 밝은 천장, 연회색 타일, 문 앞 점자 블록, 안전문 위 초록 줄, 선로 건너편 짙은 초록 벽
  3: { ceil: '#eceeee', floor: '#d9dbdc', pillar: '#e6e6e2', round: false, tactileLine: false, psdStripe: '#3BAA4A', wall: '#2F6B4A' },
  // 4호선: 밝은 천장, 회색 대리석 바닥, 짙은 회색 안전문 위 틀(파란 노선 줄), 문 앞 점자 블록
  4: { ceil: '#e6e8ea', floor: '#aeb2b6', pillar: '#e6e6e2', round: false, tactileLine: false, psdHeader: '#2b2f33' },
  // 부산김해경전철(고가역): 천장까지 닿는 높은 유리 안전문, 회색 위 틀, 회색 타일 바닥, 철골 아치 지붕
  BGL: { ceil: '#e6e8ea', floor: '#b7babd', pillar: '#c9ccd0', round: false, tactileLine: false, psdHeader: '#5b6066', psdFull: true, arch: true },
  // 동해선(땅 위 역): 회색 타일 바닥, 둥근 흰 기둥, 밝은 철골 지붕, 회색 안전문 틀에 남색 줄, 돌 의자
  DH: { ceil: '#e6e8ea', floor: '#a8abae', pillar: '#eeeeec', round: true, tactileLine: false, psdHeader: '#b9bdc1', psdStripe: '#1F3F8F', roof: '#d9dcdc', benches: true },
  default: { ceil: '#e9ebeb', floor: '#c9cbcc', pillar: '#e3d6c4', round: true, tactileLine: true },
};

/** 이 노선을 3D로 보여 줄 수 있는지 */
export const hasSubway3D = (lineId) => Boolean(SUBWAY_CARS[lineId]);

/** 글자판 */
function boardTexture(lines, { bg = '#1F3342', fg = '#ffffff', bar = null, width = 512, height = 128 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, width, height);
  if (bar) {
    g.fillStyle = bar;
    g.fillRect(0, height - 18, width, 18);
  }
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = Math.round(((height - (bar ? 18 : 0)) * 0.7) / lines.length);
  g.font = `bold ${size}px sans-serif`;
  lines.forEach((t, i) => g.fillText(t, width / 2, ((height - (bar ? 18 : 0)) * (i + 0.5)) / lines.length + 3, width - 30));
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** 전동차 한 칸(+x가 앞, +z가 승강장 쪽). head: 앞이 운전실, tail: 뒤가 운전실 */
function carMesh(spec, material, { head = false, tail = false } = {}) {
  const { L, W, H } = spec;
  const parts = new Parts();
  const GLASS = '#1a232c';
  const x0 = -L / 2;
  const x1 = L / 2;
  const floor = spec.rubber ? 0.95 : 1.1;
  const wb = floor + 0.85; // 창 아래
  const wt = floor + 1.95; // 창 위
  // 몸통
  parts.box(L, H - 0.55, W, 0, 0.55 + (H - 0.55) / 2, 0, spec.body);
  parts.box(L, 0.45, W - 0.3, 0, 0.55 + 0.2, 0, spec.lower); // 아래 치마
  parts.box(L - 0.4, 0.12, W - 0.2, 0, H + 0.05, 0, '#9EA4AA'); // 지붕
  parts.box(2.6, 0.32, 1.6, 0, H + 0.25, 0, '#B9BEC3'); // 냉방기
  // 문 자리(한쪽 doors개, 칸을 고르게 나눈다)
  const doorXs = [];
  for (let i = 0; i < spec.doors; i++) doorXs.push(x0 + (L * (i + 0.5)) / spec.doors);
  for (const side of [-1, 1]) {
    const z = side * (W / 2 + 0.01);
    // 띠
    if (spec.panel) {
      // 4호선: 창 둘레 파란 판, 그 아래 연한 파랑
      parts.box(L - 1.2, wt - wb + 0.3, 0.03, 0, (wb + wt) / 2, z + side * 0.005, spec.band);
      parts.box(L - 1.2, wb - floor + 0.2, 0.03, 0, (floor + wb) / 2 - 0.05, z + side * 0.005, spec.band2);
    } else {
      parts.box(L, 0.22, 0.03, 0, wb - 0.15, z + side * 0.005, spec.band);
      if (spec.band2) parts.box(L, 0.08, 0.03, 0, wb - 0.34, z + side * 0.005, spec.band2);
      if (spec.rim) parts.box(L, 0.1, 0.03, 0, H - 0.1, z + side * 0.005, spec.band);
    }
    // 창(문 사이)
    for (let i = 0; i <= spec.doors; i++) {
      const a = i === 0 ? x0 + 0.6 : doorXs[i - 1] + 0.75;
      const b = i === spec.doors ? x1 - 0.6 : doorXs[i] - 0.75;
      if (b - a < 0.6) continue;
      parts.box(b - a - 0.2, wt - wb - 0.1, 0.04, (a + b) / 2, (wb + wt) / 2, z + side * 0.01, GLASS);
    }
    // 반대쪽 문은 닫힌 모양
    if (side < 0) for (const dx of doorXs) parts.box(1.3, wt - floor + 0.05, 0.04, dx, (floor + wt + 0.05) / 2, z - 0.02, '#8C9399');
  }
  // 운전실 앞모습
  const cab = (sx) => {
    const fx = sx > 0 ? x1 : x0;
    parts.box(0.08, H - 0.55, W, fx + sx * 0.04, 0.55 + (H - 0.55) / 2, 0, spec.front);
    parts.box(0.06, 1.1, W - 0.5, fx + sx * 0.09, floor + 1.45, 0, GLASS); // 앞 유리
    parts.box(0.06, spec.panel ? 0.5 : 0.42, W, fx + sx * 0.1, floor + 0.65, 0, spec.frontBand); // 앞 띠
    if (spec.rim) for (const s of [-1, 1]) parts.box(0.09, H - 0.7, 0.18, fx + sx * 0.08, 0.55 + (H - 0.7) / 2, s * (W / 2 - 0.09), spec.band); // 빨간 테두리
    if (spec.panel) parts.box(0.09, 0.45, W, fx + sx * 0.08, 0.75, 0, spec.band); // 파란 앞 범퍼
    for (const s of [-1, 1]) parts.box(0.05, 0.16, 0.3, fx + sx * 0.14, floor + 0.62, s * (W / 2 - 0.45), sx > 0 ? '#f6f2d8' : '#c8302a');
    parts.box(0.06, 0.25, 0.9, fx + sx * 0.1, H - 0.35, 0, '#111316'); // 행선 표시
  };
  if (head) cab(1);
  if (tail) cab(-1);
  // 바퀴(쇠바퀴 또는 고무바퀴)
  for (const ax of [x0 + L * 0.18, x1 - L * 0.18]) {
    for (const d of spec.rubber ? [0] : [-0.9, 0.9]) {
      for (const s of [-1, 1]) {
        const r = spec.rubber ? 0.48 : 0.42;
        const g = new CylinderGeometry(r, r, spec.rubber ? 0.3 : 0.12, 14);
        g.rotateX(Math.PI / 2);
        g.translate(ax + d, r, s * (spec.rubber ? W / 2 - 0.35 : 0.72));
        parts.add(g, spec.rubber ? '#25272a' : '#4a4f55');
      }
    }
    parts.box(2.6, 0.3, W - 0.4, ax, 0.62, 0, '#30343a'); // 대차
  }
  const group = new Group();
  group.add(new Mesh(parts.geometry(), material));
  // 승강장 쪽 문짝(따로 움직인다): 두 짝 미닫이
  const doors = [];
  const doorMat = new MeshLambertMaterial({ color: spec.body });
  for (const dx of doorXs) {
    for (const s of [-1, 1]) {
      const m = new Mesh(new BoxGeometry(0.65, wt - floor + 0.05, 0.05), doorMat);
      const base = [dx + s * 0.33, (floor + wt + 0.05) / 2, W / 2 + 0.03];
      m.position.set(...base);
      group.add(m);
      doors.push({ mesh: m, base, s });
    }
  }
  return { group, doors, doorXs, floor, wb, wt, doorMat };
}

/** 열차 안: 긴 의자, 노란 손잡이 기둥, 손잡이, 천장 등, 문 위 안내 화면. 칸 하나 */
function carCabin(spec, car, material) {
  const { L, W, H } = spec;
  const { floor, wt, doorXs } = car;
  const parts = new Parts();
  const glow = new Parts();
  const iw = W / 2 - 0.08;
  parts.box(L - 0.3, 0.06, iw * 2, 0, floor - 0.03, 0, '#7d8186');
  parts.box(L - 0.3, 0.05, iw * 2, 0, H - 0.25, 0, '#eef0f1');
  for (const s of [-1, 1]) {
    glow.box(L - 1, 0.02, 0.22, 0, H - 0.28, s * 0.55, '#fffdf2');
    parts.box(L - 0.3, 0.04, 0.04, 0, H - 0.55, s * 0.55, '#c9ccd0');
    for (let x = -L / 2 + 0.6; x < L / 2 - 0.5; x += 0.45) {
      parts.box(0.02, 0.16, 0.02, x, H - 0.65, s * 0.55, '#d9dcdf');
      parts.box(0.03, 0.1, 0.1, x, H - 0.78, s * 0.55, '#f2c230');
    }
    // 벽: 창 아래, 창 위, 문 사이 기둥
    parts.box(L - 0.3, car.wb - floor, 0.05, 0, (floor + car.wb) / 2, s * iw, '#e6e8e6');
    parts.box(L - 0.3, H - 0.25 - wt, 0.05, 0, (wt + H - 0.25) / 2, s * iw, '#e6e8e6');
    // 긴 의자(문 사이)
    for (let i = 0; i <= doorXs.length; i++) {
      const a = i === 0 ? -L / 2 + 0.5 : doorXs[i - 1] + 0.75;
      const b = i === doorXs.length ? L / 2 - 0.5 : doorXs[i] - 0.75;
      if (b - a < 0.8) continue;
      parts.box(b - a, 0.1, 0.45, (a + b) / 2, floor + 0.45, s * (iw - 0.25), spec.seat);
      parts.box(b - a, 0.45, 0.08, (a + b) / 2, floor + 0.75, s * (iw - 0.04), spec.seat);
      // 의자 끝 기둥
      for (const x of [a, b]) {
        const g = new CylinderGeometry(0.025, 0.025, H - 0.25 - floor, 8);
        g.translate(x, (floor + H - 0.25) / 2, s * (iw - 0.5));
        parts.add(g, '#f2c230');
      }
    }
    // 문 위 안내 화면(노선 색 테두리)
    for (const dx of doorXs) {
      glow.box(0.7, 0.18, 0.03, dx, wt + 0.15, s * (iw - 0.03), '#ffb347');
      parts.box(0.8, 0.26, 0.04, dx, wt + 0.15, s * (iw - 0.01), spec.band);
    }
  }
  // 칸 끝 벽(통로 문)
  for (const ex of [-L / 2 + 0.12, L / 2 - 0.12]) {
    parts.box(0.06, H - 0.3 - floor, iw * 2, ex, (floor + H - 0.3) / 2, 0, '#d9dcdd');
    parts.box(0.07, 1.8, 0.8, ex, floor + 0.95, 0, '#8C9399');
  }
  const group = new Group();
  group.add(new Mesh(parts.geometry(), material), new Mesh(glow.geometry(), new MeshBasicMaterial({ vertexColors: true })));
  return {
    group,
    eye: new Vector3(-L * 0.3, floor + EYE + 0.25, 0.15),
    look: new Vector3(L / 2, floor + 1.05, 0.0),
    hero: { x: -L * 0.3 + 2.2, y: floor, z: 0.05 },
    dispose() {
      group.traverse((o) => {
        o.geometry?.dispose();
        if (o.material && o.material !== material) o.material.dispose();
      });
    },
  };
}

/**
 * 지하철 3D 보기를 만든다. 만들 수 없으면 오류를 던진다(부르는 쪽이 그림으로 돌아간다).
 * @param {{grid: object, lineId: string, color: string, stops: Array<{id: string, name: string, x: number, y: number, under: boolean}>,
 *   variant?: number, reduceMotion?: boolean}} p stops: 탈 노선의 역들(가는 차례), x·y는 격자 km
 */
export function createSubway3D({ grid, lineId, color = '#1F3342', stops, variant = 0, reduceMotion = false }) {
  const spec = SUBWAY_CARS[lineId === '1' && variant % 2 ? '1b' : lineId];
  const look = STATION_LOOK[lineId] ?? STATION_LOOK.default;
  if (!spec) throw new Error(`3D 차량이 없는 노선: ${lineId}`);
  const el = document.createElement('div');
  el.className = 'tr3d';
  const canvas = document.createElement('canvas');
  canvas.className = 'tr3d-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '지하철 3D 그림');
  el.append(canvas);
  const overlay = document.createElement('div');
  overlay.className = 'tr3d-overlay';
  const displayBox = document.createElement('div');
  displayBox.className = 'tr3d-display';
  overlay.append(displayBox);
  el.append(overlay);

  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  scene.background = new Color(SKY);
  scene.fog = new Fog(SKY, 250, 1100);
  const camera = new PerspectiveCamera(58, 16 / 10, 0.05, 2500);
  const hemi = new HemisphereLight(0xf4f8ff, 0xb9b3a6, 1.4);
  scene.add(hemi, new AmbientLight(0xffffff, 0.3));
  const sun = new DirectionalLight(0xffffff, 1.7);
  sun.position.set(-0.4, 1, 0.3);
  scene.add(sun);
  const material = new MeshLambertMaterial({ vertexColors: true });
  const glowMat = new MeshBasicMaterial({ vertexColors: true });
  const glassMat = new MeshLambertMaterial({ color: 0x9fc3d6, transparent: true, opacity: 0.35, side: DoubleSide });
  const facadeMats = new Map();
  const textures = [];

  // 열차: 칸 N개
  const N = spec.cars;
  const GAP = 0.6;
  const trainLen = N * spec.L + (N - 1) * GAP;
  const cars = [];
  for (let i = 0; i < N; i++) {
    const c = carMesh(spec, material, { head: i === 0, tail: i === N - 1 });
    scene.add(c.group);
    cars.push(c);
  }
  const cabinIndex = Math.floor(N / 2);
  const cabin = carCabin(spec, cars[cabinIndex], material);
  cabin.group.visible = false;
  cars[cabinIndex].group.add(cabin.group);

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

  let origin = [stops[0].x, stops[0].y];
  const W = (x, y) => [(x - origin[0]) * 1000, (y - origin[1]) * 1000];
  const groundY = (x, y) => Math.max(0, groundAt(grid, x, y));

  let world = null;
  let ceiling = null;
  let seg = 0;
  let path = null; // 지금 구간 길(격자 km): 앞 역 앞 0.3km ~ 다음 역 뒤 0.25km
  let pathKm = 0;
  let kmA = 0; // 앞 역 자리
  let kmB = 0; // 다음 역 자리
  let samples = []; // 10m마다 {k, x, z, y, ux, uz, under}
  let posKm = 0; // 열차 머리 자리
  let drive = null;
  let mode = 'platform';
  let outsideMode = 'side';
  let doorAmount = 0;
  let doorTarget = 0;
  let psd = []; // 안전문 짝 {mesh, base, s}
  let platformAt = 0; // 승강장 장면의 역(구간 안 km)
  let raf = 0;
  let last = 0;

  /** 역 k 둘레를 부드럽게 이은 길: k-1(없으면 늘임), k, k+1, k+2 */
  function pathFor(k) {
    const P = (i) => [stops[i].x, stops[i].y];
    const a = P(k);
    const b = P(Math.min(stops.length - 1, k + 1));
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1;
    const before = k > 0 ? P(k - 1) : [a[0] - (dx / d) * 0.6, a[1] - (dy / d) * 0.6];
    const after = k + 2 < stops.length ? P(k + 2) : [b[0] + (dx / d) * 0.6, b[1] + (dy / d) * 0.6];
    // 카트멀-롬 곡선으로 before~after 사이를 촘촘히(역 사이 부드럽게)
    const ctrl = [before, a, b, after];
    const ext = [[before[0] * 2 - a[0], before[1] * 2 - a[1]], ...ctrl, [after[0] * 2 - b[0], after[1] * 2 - b[1]]];
    const pts = [];
    for (let s = 1; s < ext.length - 2; s++) {
      const [p0, p1, p2, p3] = [ext[s - 1], ext[s], ext[s + 1], ext[s + 2]];
      for (let t = 0; t < 1; t += 0.05) {
        const t2 = t * t;
        const t3 = t2 * t;
        const f = (q) => 0.5 * (2 * p1[q] + (-p0[q] + p2[q]) * t + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * t2 + (-p0[q] + 3 * p1[q] - 3 * p2[q] + p3[q]) * t3);
        pts.push([f(0), f(1)]);
      }
    }
    pts.push(after);
    // 앞 역에서 0.3km 앞부터, 다음 역에서 0.25km 뒤까지만 쓴다
    const total = lengthOf(pts);
    const kmOf = (p) => {
      let best = 0;
      let bestD = Infinity;
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const seg2 = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        for (let t = 0; t <= 1; t += 0.1) {
          const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t;
          const y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
          const dd = Math.hypot(x - p[0], y - p[1]);
          if (dd < bestD) {
            bestD = dd;
            best = acc + seg2 * t;
          }
        }
        acc += seg2;
      }
      return best;
    };
    const ka = kmOf(a);
    const kb = kmOf(b);
    const from = Math.max(0, ka - 0.3);
    const to = Math.min(total, Math.max(kb + 0.25, ka + 0.3));
    const out = [];
    for (let k2 = from; k2 <= to + 1e-9; k2 += 0.01) {
      const q = along(pts, k2);
      out.push([q.x, q.y]);
    }
    return { pts: out, kmA: ka - from, kmB: kb - from };
  }

  function disposeWorld() {
    if (!world) return;
    scene.remove(world);
    world.traverse((o) => {
      o.geometry?.dispose();
      const m = o.material;
      if (m && m !== material && m !== glowMat && m !== glassMat && ![...facadeMats.values()].includes(m)) {
        m.map?.dispose();
        m.dispose();
      }
    });
    world = null;
    ceiling = null;
    psd = [];
  }

  function facadeMat(style) {
    if (!facadeMats.has(style)) facadeMats.set(style, new MeshLambertMaterial({ map: facadeTexture(style), vertexColors: true, side: DoubleSide }));
    return facadeMats.get(style);
  }

  /** 구간 k(역 k → k+1)의 터널·고가·역·땅을 짓는다 */
  function buildWorld(k) {
    disposeWorld();
    seg = k;
    world = new Group();
    const P = pathFor(k);
    path = P.pts;
    pathKm = lengthOf(path);
    kmA = P.kmA;
    kmB = P.kmB;
    origin = [...path[0]];
    const A = stops[k];
    const B = stops[Math.min(stops.length - 1, k + 1)];
    // 10m마다 단면. 땅속 정도(0~1): 두 역이 다르면 가운데에서 300m에 걸쳐 바뀐다
    const mid = (kmA + kmB) / 2;
    samples = [];
    for (let km = 0; km <= pathKm + 1e-9; km += 0.01) {
      const p = along(path, km);
      const q = along(path, Math.min(pathKm, km + 0.01));
      let ux = q.x - p.x;
      let uz = q.y - p.y;
      const n = Math.hypot(ux, uz);
      if (n < 1e-9) {
        ux = p.dx;
        uz = p.dy;
      } else {
        ux /= n;
        uz /= n;
      }
      const t = Math.max(0, Math.min(1, (km - mid + 0.15) / 0.3));
      const under = (A.under ? 1 : 0) * (1 - t) + (B.under ? 1 : 0) * t;
      const [x, z] = W(p.x, p.y);
      samples.push({ k: km, gx: p.x, gy: p.y, x, z, ux, uz, rx: -uz, rz: ux, g: groundY(p.x, p.y), under });
    }
    // 선로 높이: 땅을 부드럽게 따라가며 땅속이면 12m 아래, 땅 위면 9m 위(고가)
    for (let i = 0; i < samples.length; i++) {
      let s = 0;
      let c = 0;
      for (let j = Math.max(0, i - 15); j <= Math.min(samples.length - 1, i + 15); j++) {
        s += samples[j].g;
        c++;
      }
      const smooth = s / c;
      samples[i].y = smooth + 9 - samples[i].under * 21;
    }
    // 역은 평평하게(역 가운데 높이), 역 사이 기울기는 3.5%까지
    const zone = trainLen / 2000 + 0.03;
    for (const kmS of [kmA, kmB]) {
      const c = samples[Math.max(0, Math.min(samples.length - 1, Math.round(kmS / 0.01)))].y;
      for (const s of samples) if (Math.abs(s.k - kmS) <= zone) s.y = c;
    }
    const MAXD = 0.35;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < samples.length; i++) samples[i].y = Math.max(samples[i - 1].y - MAXD, Math.min(samples[i - 1].y + MAXD, samples[i].y));
      for (let i = samples.length - 2; i >= 0; i--) samples[i].y = Math.max(samples[i + 1].y - MAXD, Math.min(samples[i + 1].y + MAXD, samples[i].y));
    }
    const anyAbove = samples.some((s) => s.under < 0.99);
    const parts = new Parts();
    const glow = new Parts();
    const ceil = new Parts();
    const plate = (s, t, o, w, h, dy, col, into = parts) => {
      const ax = s.x + s.rx * o;
      const az = s.z + s.rz * o;
      const bx = t.x + t.rx * o;
      const bz = t.z + t.rz * o;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) return;
      const g = new BoxGeometry(Math.hypot(len, t.y - s.y) + 0.05, h, w);
      g.rotateZ(Math.atan2(t.y - s.y, len));
      g.rotateY(Math.atan2(-(bz - az), bx - ax));
      g.translate((ax + bx) / 2, (s.y + t.y) / 2 + dy, (az + bz) / 2);
      into.add(g, col);
    };
    const atStation = (km) => Math.abs(km - kmA) < trainLen / 2000 + 0.012 || Math.abs(km - kmB) < trainLen / 2000 + 0.012;
    // 두 선로: 우리 선로(가운데 0), 맞은편 선로(-4.2)
    const OTHER = -4.2;
    for (let i = 1; i < samples.length; i++) {
      const s = samples[i - 1];
      const t = samples[i];
      const st = atStation(t.k);
      const under = (s.under + t.under) / 2;
      // 선로 바닥과 레일(경전철 고무바퀴는 콘크리트 주행로)
      for (const o of [0, OTHER]) {
        if (spec.rubber) {
          for (const r of [-0.85, 0.85]) plate(s, t, o + r, 0.5, 0.2, 0.1, '#a7a9a6');
          for (const r of [-1.3, 1.3]) plate(s, t, o + r, 0.08, 0.35, 0.35, '#6b7076');
        } else {
          plate(s, t, o, 2.6, 0.18, 0.05, '#6f6a62');
          for (const r of [-0.72, 0.72]) plate(s, t, o + r, 0.08, 0.14, 0.2, '#9aa0a6');
          if (i % 1 === 0) plate(s, t, o, 2.2, 0.05, 0.14, '#5a554e');
        }
      }
      if (under > 0.5) {
        // 상자 터널: 바닥, 벽, 천장, 벽 등
        const right = st ? 9 : 2.6;
        const left = OTHER - 2.4;
        plate(s, t, (right + left) / 2, right - left, 0.3, -0.2, '#4a4c4f');
        plate(s, t, right, 0.4, 6.5, 3.1, st ? '#d9dcdc' : '#6a6d70');
        plate(s, t, left, 0.4, 6.5, 3.1, st && look.wall ? look.wall : '#6a6d70');
        plate(s, t, (right + left) / 2, right - left + 0.4, 0.3, 6.4, st ? look.ceil : '#55585b', ceil);
        if (i % 3 === 0 && !st) glow.box(0.6, 0.18, 0.1, t.x + t.rx * (right - 0.25), t.y + 3.6, t.z + t.rz * (right - 0.25), '#fff6d8');
        if (st) {
          // 승강장 바닥, 천장 등
          plate(s, t, (EDGE + 0.05 + right) / 2, right - EDGE - 0.05, 1.1, 0.45, look.floor);
          // 승강장을 따라 이어진 노란 점자 블록(2호선 사진)
          if (look.tactileLine) plate(s, t, EDGE + 0.85, 0.4, 0.03, 1.02, '#E8B92A');
          // 천장에 가로 형광등 줄
          if (i % 2 === 0) plate(s, t, (EDGE + right) / 2, 0.25, 0.05, 6.2, '#fffdf2', glow);
          plate(s, t, 4.5, 0.3, 0.05, 6.2, '#fffdf2', glow);
          // 승강장 기둥(노선 색 띠)
          if (i % 2 === 0) {
            const g = look.round ? new CylinderGeometry(0.45, 0.45, 5.4, 12) : new BoxGeometry(0.6, 5.4, 0.6);
            g.translate(t.x + t.rx * 6.2, t.y + 3.7, t.z + t.rz * 6.2);
            parts.add(g, look.pillar);
            const b = new BoxGeometry(0.64, 0.25, 0.64);
            b.translate(t.x + t.rx * 6.2, t.y + 2.4, t.z + t.rz * 6.2);
            parts.add(b, color);
          }
        }
      } else {
        // 고가: 바닥판, 낮은 벽, 기둥
        const right = st ? 8 : 2.4;
        const left = OTHER - 2.2;
        plate(s, t, (right + left) / 2, right - left, 0.8, -0.45, '#bdbab2');
        plate(s, t, right, 0.3, 1.1, 0.4, '#c9c6be');
        plate(s, t, left, 0.3, 1.1, 0.4, '#c9c6be');
        if (i % 3 === 0) {
          const h = Math.max(1, t.y - t.g);
          const g = new BoxGeometry(1.6, h, 2.2);
          g.translate(t.x + t.rx * (OTHER / 2), t.g + h / 2 - 0.8, t.z + t.rz * (OTHER / 2));
          parts.add(g, '#b3b0a8');
        }
        // 전차선 기둥: 가공선식(1~3호선, 동해선)만. 4호선과 부산김해경전철은 제3궤조
        if (!spec.rubber && !spec.thirdRail && i % 5 === 0) {
          // 전차선 기둥
          const g = new BoxGeometry(0.25, 6, 0.25);
          g.translate(t.x + t.rx * (left + 0.2), t.y + 3, t.z + t.rz * (left + 0.2));
          parts.add(g, '#8c9399');
          plate(samples[i - 1], t, OTHER / 2, 0.05, 0.05, 5.4, '#3a3d40');
        }
        if (st) {
          plate(s, t, (EDGE + 0.05 + right) / 2, right - EDGE - 0.05, 1.1, 0.45, look.floor);
          if (look.arch) {
            // 철골 아치 지붕: 가운데가 높은 세 토막
            plate(s, t, EDGE + 0.8, 2.6, 0.2, 5.0, '#a9afb4');
            plate(s, t, (EDGE + right) / 2 + 0.4, 2.8, 0.2, 5.6, '#a9afb4');
            plate(s, t, right - 0.6, 2.6, 0.2, 5.0, '#a9afb4');
            if (i % 2 === 0) plate(s, t, (EDGE + right) / 2, right - EDGE + 0.6, 0.12, 5.3, '#6d757b');
          } else plate(s, t, (EDGE + right) / 2, right - EDGE + 0.6, 0.25, 4.8, look.roof ?? '#8e979e'); // 승강장 지붕
          if (look.benches && i % 15 === 0) {
            plate(s, t, 5.2, 0.7, 0.12, 1.45, '#b59a6e'); // 의자 판
            plate(s, t, 5.2, 0.5, 0.4, 1.2, '#9aa0a6'); // 의자 다리
          }
          if (i % 3 === 0) {
            const g = look.round ? new CylinderGeometry(0.3, 0.3, 3.8, 12) : new BoxGeometry(0.3, 3.8, 0.3);
            g.translate(t.x + t.rx * (right - 0.6), t.y + 2.9, t.z + t.rz * (right - 0.6));
            parts.add(g, '#6d757b');
          }
        }
      }
    }
    // 역마다: 안전문(유리 벽과 문 짝), 역 이름판
    const glassParts = new Parts();
    for (const [kmS, stop] of [
      [kmA, A],
      [kmB, B],
    ]) {
      // 열차가 서는 자리: 열차 가운데가 역 자리에 온다
      const headKm = kmS + trainLen / 2000;
      const doorKms = [];
      for (let c = 0; c < N; c++) {
        const centerKm = headKm - (c * (spec.L + GAP) + spec.L / 2) / 1000;
        for (const dx of cars[c].doorXs) doorKms.push(centerKm + dx / 1000);
      }
      const startKm = headKm - trainLen / 1000 - 0.004;
      for (let km = startKm; km <= headKm + 0.004; km += 0.002) {
        const s = sampleAt(km);
        const t = sampleAt(km + 0.002);
        if (!s || !t) continue;
        const nearDoor = doorKms.some((d) => Math.abs(km + 0.001 - d) < 0.0009);
        if (!nearDoor) plate(s, t, EDGE + 0.05, 0.04, look.psdFull ? 2.4 : 2.1, look.psdFull ? 1.7 : 1.55, '#9fc3d6', glassParts);
        // 안전문 위 흰 틀과 노선 색 줄(1호선 승강장 사진)
        plate(s, t, EDGE + 0.05, 0.2, 0.75, 2.98, look.psdHeader ?? '#e9eaea');
        plate(s, t, EDGE + 0.17, 0.02, 0.08, 3.12, look.psdStripe ?? color);
        plate(s, t, EDGE + 0.12, 0.08, 0.08, 0.54, '#d4d6d6'); // 문 아래 틀
      }
      for (const d of doorKms) {
        const s = sampleAt(d);
        if (!s) continue;
        // 문 양옆 청록 기둥, 문 앞 노란 점자 블록
        for (const side of [-1, 1]) {
          const g = new BoxGeometry(0.1, 2.15, 0.16);
          g.rotateY(Math.atan2(-s.uz, s.ux));
          g.translate(s.x + s.rx * (EDGE + 0.05) + s.ux * side * 0.98, s.y + 1.55, s.z + s.rz * (EDGE + 0.05) + s.uz * side * 0.98);
          parts.add(g, '#4F9A93');
        }
        if (!look.tactileLine) {
          const tg = new BoxGeometry(1.6, 0.03, 0.6);
          tg.rotateY(Math.atan2(-s.uz, s.ux));
          tg.translate(s.x + s.rx * (EDGE + 0.55), s.y + 1.01, s.z + s.rz * (EDGE + 0.55));
          parts.add(tg, '#E8B92A');
        }
        for (const side of [-1, 1]) {
          const m = new Mesh(new BoxGeometry(0.95, 2.05, 0.04), glassMat);
          const base = [s.x + s.rx * (EDGE + 0.05) + s.ux * side * 0.48, s.y + 1.55, s.z + s.rz * (EDGE + 0.05) + s.uz * side * 0.48];
          m.position.set(...base);
          m.rotation.y = Math.atan2(-s.uz, s.ux);
          world.add(m);
          psd.push({ mesh: m, base, ux: s.ux, uz: s.uz, side });
        }
      }
      // 역 이름판(뒤 벽): 노선 색 띠
      const tex = boardTexture([stop.name], { bg: '#ffffff', fg: '#1F3342', bar: color, width: 512, height: 128 });
      textures.push(tex);
      for (const off of [-0.06, -0.03, 0, 0.03, 0.06]) {
        const s = sampleAt(kmS + off);
        if (!s) continue;
        const under = s.under > 0.5;
        const b = new Mesh(new PlaneGeometry(6, 1.5), new MeshBasicMaterial({ map: tex }));
        const o = under ? 8.45 : 7.5;
        b.position.set(s.x + s.rx * o, s.y + 3.2, s.z + s.rz * o);
        b.rotation.y = Math.atan2(-s.uz, s.ux) + Math.PI;
        world.add(b);
      }
    }
    // 땅 위가 있으면 땅, 건물, 나무
    if (anyAbove) {
      const offs = [];
      for (let o = -300; o <= 300; o += 20) offs.push(o);
      const pos = [];
      const col = [];
      const idx = [];
      const c = new Color();
      const ground = samples.filter((_, i) => i % 2 === 0);
      ground.forEach((s, i) => {
        for (const o of offs) {
          const wx = s.x + s.rx * o;
          const wz = s.z + s.rz * o;
          const gx = wx / 1000 + origin[0];
          const gy = wz / 1000 + origin[1];
          pos.push(wx, groundY(gx, gy) - 0.1, wz);
          const terrain = grid.terrain[Math.floor(gy)]?.[Math.floor(gx)];
          const people = grid.population[Math.floor(gy)]?.[Math.floor(gx)] ?? 0;
          c.set(terrain === 'sea' ? '#7fa7c9' : terrain === 'river' ? '#8db3cf' : people > 3000 ? '#b3ada3' : people > 300 ? '#a9bb8e' : '#98b874');
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
      const facades = new Map();
      for (let i = 0; i < ground.length; i += 2) {
        const s = ground[i];
        for (const side of [-1, 1]) {
          for (let r = 0; r < 3; r++) {
            const o = side * (22 + r * 45 + cellNoise(i, r, side + 4) * 20);
            const wx = s.x + s.rx * o;
            const wz = s.z + s.rz * o;
            const gx = wx / 1000 + origin[0];
            const gy = wz / 1000 + origin[1];
            const terrain = grid.terrain[Math.floor(gy)]?.[Math.floor(gx)];
            if (terrain === 'sea' || terrain === 'river') continue;
            const people = grid.population[Math.floor(gy)]?.[Math.floor(gx)] ?? 0;
            const n = cellNoise(Math.round(s.k * 100), r * 2 + (side > 0 ? 1 : 0), 23);
            const y = groundY(gx, gy);
            if (people > 1500 && n < Math.min(0.85, people / 10000)) {
              const floors = people > 10000 ? 5 + Math.floor(n * 20) : 2 + Math.floor(n * 6);
              const style = floors >= 10 ? 'band' : n > 0.4 ? 'punched' : 'brick';
              if (!facades.has(style)) facades.set(style, new Mesher());
              const w = 14 + n * 10;
              const d = 12 + n * 8;
              const h = floors * 3.2;
              const tint = new Color(['#ece8de', '#e3ddd2', '#d9dde0', '#efe6d6'][Math.floor(n * 4)]);
              const ring = [
                [wx - w / 2, wz - d / 2],
                [wx + w / 2, wz - d / 2],
                [wx + w / 2, wz + d / 2],
                [wx - w / 2, wz + d / 2],
              ];
              let run = 0;
              const m = facades.get(style);
              for (let q = 0; q < 4; q++) {
                const [ax, az] = ring[q];
                const [bx, bz] = ring[(q + 1) % 4];
                const len = Math.hypot(bx - ax, bz - az);
                m.quad([ax, y, az], [bx, y, bz], [bx, y + h, bz], [ax, y + h, az], tint, [[run / 3, 0], [(run + len) / 3, 0], [(run + len) / 3, h / 4], [run / 3, h / 4]]);
                run += len;
              }
              parts.box(w, 0.3, d, wx, y + h + 0.15, wz, '#8f969c');
            } else if (n < 0.5) {
              const g = new ConeGeometry(2 + n * 2, 5 + n * 4, 7);
              g.translate(wx, y + 3, wz);
              parts.add(g, '#4f8a45');
            }
          }
        }
      }
      for (const [style, m] of facades) world.add(new Mesh(m.geometry(), facadeMat(style)));
    }
    world.add(new Mesh(parts.geometry(), material), new Mesh(glow.geometry(), glowMat), new Mesh(glassParts.geometry(), glassMat));
    ceiling = new Mesh(ceil.geometry(), material);
    world.add(ceiling);
    scene.add(world);
    // 땅속 구간이 많으면 하늘 대신 어두운 터널
    const mostlyUnder = samples.filter((s) => s.under > 0.5).length > samples.length / 2;
    scene.background.setHex(mostlyUnder ? TUNNEL : SKY);
    scene.fog.color.setHex(mostlyUnder ? TUNNEL : SKY);
    scene.fog.near = mostlyUnder ? 60 : 250;
    scene.fog.far = mostlyUnder ? 420 : 1100;
  }

  function sampleAt(km) {
    if (!samples.length) return null;
    const i = Math.max(0, Math.min(samples.length - 1, Math.round(km / 0.01)));
    const a = samples[Math.max(0, Math.min(samples.length - 2, Math.floor(km / 0.01)))];
    const b = samples[Math.min(samples.length - 1, Math.floor(km / 0.01) + 1)];
    if (!a || !b) return samples[i];
    const t = Math.max(0, Math.min(1, km / 0.01 - Math.floor(km / 0.01)));
    return {
      k: km,
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      y: a.y + (b.y - a.y) * t,
      ux: a.ux,
      uz: a.uz,
      rx: a.rx,
      rz: a.rz,
      under: a.under,
      g: a.g,
    };
  }

  function placeTrain() {
    for (let c = 0; c < N; c++) {
      const center = posKm - (c * (spec.L + GAP) + spec.L / 2) / 1000;
      const f = sampleAt(center + spec.L / 2000 - 0.002);
      const r = sampleAt(center - spec.L / 2000 + 0.002);
      if (!f || !r) continue;
      const g = cars[c].group;
      g.position.set((f.x + r.x) / 2, (f.y + r.y) / 2 + 0.2, (f.z + r.z) / 2);
      g.rotation.set(0, Math.atan2(-(f.z - r.z), f.x - r.x), Math.atan2(f.y - r.y, Math.hypot(f.x - r.x, f.z - r.z)));
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
      const e = drive.ease === 'out' ? 1 - (1 - u) * (1 - u) : u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
      posKm = drive.from + (drive.to - drive.from) * e;
      if (u >= 1) {
        const done = drive.done;
        drive = null;
        done();
      }
    }
    if (doorAmount !== doorTarget) {
      const s = reduceMotion ? 1 : dt / 1.2;
      doorAmount = doorTarget > doorAmount ? Math.min(doorTarget, doorAmount + s) : Math.max(doorTarget, doorAmount - s);
      for (const c of cars) for (const d of c.doors) d.mesh.position.set(d.base[0] + d.s * 0.62 * doorAmount, d.base[1], d.base[2] + 0.02);
      for (const p of psd) p.mesh.position.set(p.base[0] + p.ux * p.side * 0.9 * doorAmount, p.base[1], p.base[2] + p.uz * p.side * 0.9 * doorAmount);
    }
    placeTrain();
    const head = cars[0].group;
    const bp = cars[Math.min(N - 1, 1)].group.position;
    const ux = Math.cos(-head.rotation.y);
    const uz = Math.sin(-head.rotation.y);
    const rx = -uz;
    const rz = ux;
    const s = sampleAt(posKm - trainLen / 2000);
    const under = (s?.under ?? 0) > 0.5;
    if (ceiling) ceiling.visible = mode !== 'sky';
    if (mode === 'cabin') {
      const g = cars[cabinIndex].group;
      g.updateMatrixWorld(true);
      camera.position.copy(cabin.eye).applyMatrix4(g.matrixWorld);
      camera.lookAt(lookAt.copy(cabin.look).applyMatrix4(g.matrixWorld));
    } else if (mode === 'platform') {
      const p = sampleAt(platformAt + trainLen / 2000 - 0.006);
      if (p) {
        // 승강장에서 안전문 뒤 2m, 열차가 들어오는 쪽을 본다
        camera.position.set(p.x + p.rx * (EDGE + 2.6), p.y + 0.95 + EYE, p.z + p.rz * (EDGE + 2.6));
        camera.lookAt(p.x - p.ux * 60 + p.rx * EDGE, p.y + 1.9, p.z - p.uz * 60 + p.rz * EDGE);
        const h = sampleAt(platformAt + trainLen / 2000 - 0.012);
        hero.root.position.set(h.x + h.rx * (EDGE + 1.8), h.y + 1.0, h.z + h.rz * (EDGE + 1.8));
        hero.root.rotation.set(0, Math.atan2(-h.rx, -h.rz), 0);
      }
    } else if (mode === 'chase') {
      const back = sampleAt(posKm - trainLen / 1000 - 0.018) ?? s;
      camera.position.set(back.x + back.rx * 1.2, back.y + (under ? 4.3 : 7), back.z + back.rz * 1.2);
      camera.lookAt(head.position.x, head.position.y + 1.5, head.position.z);
    } else if (mode === 'sky') {
      camera.position.set(bp.x - ux * 40 + rx * 45, bp.y + 70, bp.z - uz * 40 + rz * 45);
      camera.lookAt(bp.x + ux * 30, bp.y, bp.z + uz * 30);
    } else {
      // 옆에서: 맞은편 선로 쪽에서(터널 안이면 가까이)
      // 터널 안이면 맞은편 선로 끝에서 비스듬히 앞쪽을, 땅 위면 멀리 옆에서
      const d = under ? -6.0 : -18;
      const fwd = under ? 16 : 2;
      camera.position.set(bp.x + rx * d + ux * fwd, bp.y + (under ? 2.6 : 4), bp.z + rz * d + uz * fwd);
      camera.lookAt(bp.x - ux * (under ? 6 : -2), bp.y + 1.8, bp.z - uz * (under ? 6 : -2));
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

  const run = (spec2) =>
    new Promise((done) => {
      drive = { start: 0, ...spec2, ms: reduceMotion ? 0 : spec2.ms, done };
    });
  /** 역 k에 선 열차 머리 자리(구간 k 안) */
  const stopHead = () => kmA + trainLen / 2000;

  const api = {
    el,
    /** 열차가 역 k에 서 있다 */
    atStation(k) {
      const kk = Math.min(k, stops.length - 2);
      if (seg !== kk || !world) buildWorld(kk);
      platformAt = kmA;
      posKm = k > kk ? kmB + trainLen / 2000 : stopHead();
      for (const c of cars) c.group.visible = true;
    },
    /** 승강장에서 기다린다(열차는 아직 안 보인다) */
    waitAtPlatform(k = 0) {
      api.atStation(k);
      for (const c of cars) c.group.visible = false;
      posKm = Math.max(trainLen / 1000, 0.05);
      doorAmount = 0;
      doorTarget = 0;
    },
    /** 열차가 들어와 선다 */
    arrive(ms = 6000) {
      for (const c of cars) c.group.visible = true;
      return run({ from: Math.max(0.02, stopHead() - 0.28), to: stopHead(), ms, ease: 'out' });
    },
    /** 역 k까지 달린다(여러 역을 건너뛰면 마지막 구간만 달린다) */
    driveTo(k, ms = 7000) {
      const from = Math.max(0, Math.min(k - 1, stops.length - 2));
      if (seg !== from || !world) buildWorld(from);
      platformAt = kmA;
      for (const c of cars) c.group.visible = true;
      return run({ from: stopHead(), to: kmB + trainLen / 2000, ms }).then(() => {
        platformAt = kmB;
      });
    },
    setDoors(open) {
      doorTarget = open ? 1 : 0;
    },
    setDisplay(lines) {
      displayBox.replaceChildren(
        ...lines.map((t) => {
          const d = document.createElement('div');
          d.textContent = t;
          return d;
        }),
      );
    },
    /** 'platform'(승강장, 아이 눈높이), 'cabin'(열차 안), 'outside'(밖에서) */
    setView(view) {
      mode = view === 'outside' ? outsideMode : view;
      const inCabin = mode === 'cabin';
      cabin.group.visible = inCabin;
      cars[cabinIndex].group.children[0].visible = !inCabin;
      for (const d of cars[cabinIndex].doors) d.mesh.visible = !inCabin;
      camRow.style.display = view === 'outside' ? '' : 'none';
      displayBox.hidden = view === 'platform';
      if (inCabin) {
        cars[cabinIndex].group.add(hero.root);
        hero.root.position.set(cabin.hero.x, cabin.hero.y, cabin.hero.z);
        hero.root.rotation.set(0, -Math.PI / 2, 0);
      } else if (mode === 'platform') scene.add(hero.root);
      else hero.root.removeFromParent();
      hemi.groundColor.setHex(inCabin || mode === 'platform' ? 0xd9d5cc : 0xb9b3a6);
      camera.fov = inCabin || mode === 'platform' ? 62 : 55;
      camera.updateProjectionMatrix();
      canvas.setAttribute('aria-label', inCabin ? '지하철 안 3D 그림' : mode === 'platform' ? '지하철 승강장 3D 그림' : '지하철을 밖에서 본 3D 그림');
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
      cabin.dispose();
      for (const c of cars) {
        c.group.traverse((o) => o.geometry?.dispose());
        c.doorMat.dispose();
      }
      material.dispose();
      glowMat.dispose();
      glassMat.dispose();
      for (const t of textures) t.dispose();
      for (const m of facadeMats.values()) {
        m.map?.dispose();
        m.dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
  if (import.meta.env?.DEV) el.devApi = { ...api, world: () => world, scene, camera };
  return api;
}
