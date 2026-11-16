// 시내버스 3D 보기: 실제 도로(OpenStreetMap)를 따라 정류장 사이를 달리는 버스.
// 땅 높이는 격자 칸 높이(1km), 도로는 걸어서 여행하기의 도로 자료(data/build/roads.json), 정류장은 버스 자료다.
// 건물과 가로수는 칸의 인구로 어림해 지은 것이다. 버스 칠은 bus-looks.js(도시·노선 종류별, 출처는 data/facts.json).
// 회사 이름, 로고, 상징 무늬는 넣지 않는다. three.js만 쓰고 파일을 읽는 로더는 쓰지 않는다.
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
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { roadsData } from '../data.js';
import { decodeRoads, indexRoads, MADE_ROAD, nearestRoad, taxiRoute } from '../sim/roads.js';
import { cellNoise, groundAt } from '../sim/train-3d-path.js';
import { Parts } from './train-3d-cars.js';
import { facadeTexture, Mesher } from './train-3d-station.js';
import { buildHero } from './hero-model.js';
import { busLookOf } from './bus-looks.js';
import heroData from '../content/hero/hero3d.json';
import heroTextureUrl from '../content/hero/hero3d.webp';

const SKY = 0xcfe6f5;
/** 도로 종류별 폭(미터): 1 간선, 2 주간선, 3 보조간선, 4 일반, 5 동네 길. 우리가 정한 값. */
const ROAD_W = { 1: 26, 2: 20, 3: 14, 4: 10, 5: 7 };
/** 보도 폭(미터) */
const WALK_W = 3.2;
/** 정류장 사이 하나를 지을 때 둘레(km) */
const PAD_KM = 0.32;
/** 아이 눈높이(미터) */
const EYE = 1.1;

let roadCache = null;
/** 도로 자료는 처음 쓸 때 한 번만 푼다 */
function roadsNow() {
  if (!roadCache) {
    const roads = decodeRoads(roadsData);
    roadCache = { roads, index: indexRoads(roads, (e) => e.cls !== MADE_ROAD) };
  }
  return roadCache;
}
const notMade = (e) => e.cls !== MADE_ROAD;

/** 두 정류장 사이 도로 길(격자 좌표 점들). 못 찾으면 곧은 줄. */
function roadPath(a, b) {
  const { roads, index } = roadsNow();
  const na = nearestRoad(roads, index, a, 0.2, notMade);
  const nb = nearestRoad(roads, index, b, 0.2, notMade);
  const r = na && nb ? taxiRoute(roads, na, nb) : null;
  const raw = r?.points?.length >= 2 ? r.points.map((p) => [p[0], p[1]]) : [[a.x, a.y], [b.x, b.y]];
  // 겹친 점(0.5m 안)은 뺀다. 방향을 셀 수 없게 되기 때문이다.
  const pts = raw.filter((p, i) => i === 0 || Math.hypot(p[0] - raw[i - 1][0], p[1] - raw[i - 1][1]) > 0.0005);
  // 두 정류장이 같은 자리면 30m 곧은 길을 둔다
  if (pts.length < 2) return [[a.x, a.y], [a.x + 0.03, a.y]];
  return pts;
}

/** 선 모양 길이(격자 km) */
export const lengthOf = (pts) => pts.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);

/** 선 위 거리 km 지점과 방향 */
export function along(pts, km) {
  let left = Math.max(0, km);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (left <= len || i === pts.length - 1) {
      const t = len ? Math.min(1, left / len) : 0;
      const d = len || 1;
      return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, dx: (x1 - x0) / d, dy: (y1 - y0) / d, i };
    }
    left -= len;
  }
  const p = pts.at(-1);
  return { x: p[0], y: p[1], dx: 1, dy: 0, i: pts.length - 1 };
}

/** 버스 표시판 글씨(검은 바탕에 주황 글자) */
export function signTexture(text, { width = 512, height = 96, color = '#ffb347' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = '#111316';
  g.fillRect(0, 0, width, height);
  g.fillStyle = color;
  g.font = `bold ${Math.round(height * 0.62)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, width / 2, height * 0.54, width * 0.94);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** 정류장 이름판(초록 바탕 흰 글자) */
function stopTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#2E8B3E';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#ffffff';
  g.font = 'bold 60px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 66, 490);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** 차체 치수(미터, 우리가 정한 어림): 길이, 폭, 높이, 바닥, 창 아래, 창 위 */
export const BODY = {
  step: { L: 11, W: 2.5, H: 3.1, floor: 0.95, wb: 1.45, wt: 2.55, doors: [3.9, -0.7], axles: [3.2, -2.9] },
  low: { L: 11, W: 2.5, H: 3.2, floor: 0.38, wb: 1.05, wt: 2.65, doors: [4.0, -0.2], axles: [3.3, -3.0], pod: true },
  coach: { L: 12, W: 2.5, H: 3.45, floor: 1.35, wb: 1.95, wt: 3.0, doors: [4.6], axles: [3.6, -3.3], luggage: true },
  // 고속·시외버스(높은 바닥 관광형). 뒤 축이 둘이다.
  express: { L: 12.5, W: 2.5, H: 3.65, floor: 1.55, wb: 2.1, wt: 3.25, doors: [4.9], axles: [4.0, -2.6, -3.9], luggage: true, big: true },
  mini: { L: 7.4, W: 2.1, H: 2.75, floor: 0.75, wb: 1.3, wt: 2.3, doors: [2.5], axles: [2.0, -2.0], hood: true },
};

/**
 * 버스 한 대(밖 껍데기, 문짝, 표시판). 앞은 +x, 오른편(문 쪽)은 +z.
 */
export function busMesh(look, routeNo, material) {
  const b = BODY[look.vehicle] ?? BODY.step;
  const { L, W, H, wb, wt } = b;
  const parts = new Parts();
  const lower = look.lower;
  const upper = look.upper ?? look.lower;
  const roof = look.roof ?? upper;
  const front = look.front ?? lower;
  const stripe = look.stripe ?? upper;
  const pat = look.pattern;
  const GLASS = '#1b2633';
  const DARK = '#2a2d31';
  const x0 = -L / 2;
  const x1 = L / 2 - (b.hood ? 0.8 : 0);
  const len = x1 - x0;
  const mid = (x0 + x1) / 2;
  // 아래 몸통(창 아래)
  const lowerColor = lower;
  parts.box(len, wb - 0.35, W, mid, 0.35 + (wb - 0.35) / 2, 0, lowerColor);
  // 창 둘레(창 아래~창 위)
  const bandColor = pat === 'two-tone' ? upper : pat === 'window-band' ? stripe : pat === 'solid' ? lower : upper;
  parts.box(len, wt - wb, W - 0.04, mid, (wb + wt) / 2, 0, bandColor);
  // 창 위~지붕
  const topColor = pat === 'solid' || pat === 'window-band' ? lower : upper;
  parts.box(len, H - 0.15 - wt, W, mid, (wt + H - 0.15) / 2, 0, topColor);
  parts.box(len - 0.2, 0.15, W - 0.1, mid, H - 0.075, 0, roof);
  // 옆 창(기둥 사이). 문 자리는 비운다.
  const doorXs = b.doors;
  for (const side of [-1, 1]) {
    for (let x = x0 + 0.9; x < x1 - 1.4; x += 1.55) {
      const cx = x + 0.7;
      if (side > 0 && doorXs.some((d) => Math.abs(d - cx) < 1.15)) continue;
      parts.box(1.3, wt - wb - 0.25, 0.04, cx, (wb + wt) / 2, side * (W / 2 + 0.01), GLASS);
    }
  }
  // 무늬: 사선 띠, 물방울
  if (pat === 'diagonal') {
    for (const side of [-1, 1]) {
      const g = new BoxGeometry(4.2, 0.45, 0.03);
      g.rotateZ(0.42);
      g.translate(mid - 1.2, (0.4 + wt) / 2, side * (W / 2 + 0.02));
      parts.add(g, stripe);
    }
  }
  if (pat === 'splash') {
    // 바탕색 위에 뒤로 갈수록 커지는 물보라 무늬(띠 색, 없으면 흰색)
    const spray = look.stripe && look.stripe !== lower ? look.stripe : '#FFFFFF';
    for (const side of [-1, 1]) {
      for (let k = 0; k < 9; k++) {
        const r = 0.12 + (k / 9) * 0.25 + cellNoise(k, side, 3) * 0.12;
        const g = new CylinderGeometry(r, r, 0.02, 10);
        g.rotateX(Math.PI / 2);
        g.translate(x1 - len * 0.34 - 0.3 - k * 0.75, 0.55 + cellNoise(k, side, 7) * (wb - 0.7), side * (W / 2 + 0.015));
        parts.add(g, spray);
      }
    }
  }
  // 고속·시외버스 무늬: 흰 차체에 띠 색 지붕 테두리·앞 지붕 모자·뒤쪽 아래·맨 아래 띠·앞 범퍼
  if (pat === 'cap-tail') {
    const c = look.stripe ?? stripe;
    parts.box(len, 0.16, W + 0.03, mid, H - 0.23, 0, c); // 지붕 테두리
    parts.box(1.4, 0.42, W + 0.03, x1 - 0.7, H - 0.36, 0, c); // 앞 지붕 모자
    parts.box(len * 0.42, wb - 0.35 + 0.02, W + 0.03, x0 + len * 0.21, 0.35 + (wb - 0.35) / 2, 0, c); // 뒤쪽 아래
    parts.box(len, 0.24, W + 0.03, mid, 0.47, 0, c); // 맨 아래 띠
    parts.box(0.1, 0.32, W, x1 + 0.06, 0.5, 0, c); // 앞 범퍼
  }
  // 고속·시외버스 무늬: 바탕색 차체에 흰 쐐기(창 아래 뒤쪽 흰 띠, 앞문 뒤에서 비스듬히 오르는 흰 띠), 앞·뒤 지붕 모자
  if (pat === 'wedge') {
    const c = look.stripe ?? '#FFFFFF';
    parts.box(len * 0.55, 0.5, W + 0.03, x0 + len * 0.275, wb - 0.27, 0, c); // 뒤쪽 창 아래 흰 띠
    parts.box(1.5, 1.0, W + 0.03, x1 - 0.75, 0.95, 0, c); // 앞 아래 흰 판
    for (const side of [-1, 1]) {
      // 앞 흰 판에서 뒤 흰 띠로 비스듬히 오르는 흰 띠
      const ax = x1 - 1.4;
      const ay = 0.75;
      const bx = x0 + len * 0.55;
      const by = wb - 0.27;
      const l2 = Math.hypot(bx - ax, by - ay);
      const g = new BoxGeometry(l2, 0.5, 0.03);
      g.rotateZ(Math.atan2(by - ay, bx - ax));
      g.translate((ax + bx) / 2, (ay + by) / 2, side * (W / 2 + 0.02));
      parts.add(g, c);
    }
    const capC = look.cap ?? lower;
    parts.box(1.6, 0.3, W + 0.03, x1 - 0.8, H - 0.12, 0, capC); // 앞 지붕 모자
    parts.box(1.8, 0.4, W + 0.03, x0 + 0.9, H - 0.08, 0, capC); // 뒤 지붕 모자
    parts.box(0.1, 0.3, W, x1 + 0.06, 0.45, 0, lower); // 앞 범퍼
  }
  // 고속·시외버스 무늬: 바탕색 차체에 창 아래 앞에서 뒤 아래로 내려가는 흰 띠와 주황 띠
  if (pat === 'sweep') {
    const cols = [look.stripe ?? '#FFFFFF', look.stripe2 ?? look.stripe ?? '#FFFFFF'];
    parts.box(0.06, 0.25, W - 0.2, x1 + 0.05, 1.25, 0, cols[0]); // 앞 흰 V 띠(어림)
    for (const side of [-1, 1]) {
      cols.forEach((c, i) => {
        const dy = i * 0.32;
        for (const [ax, ay, bx, by] of [
          [x1 - 0.4, wb - 0.3 - dy, x1 - len * 0.45, wb - 0.3 - dy],
          [x1 - len * 0.45, wb - 0.3 - dy, x0 + len * 0.18, 0.75 - dy * 0.3],
          [x0 + len * 0.18, 0.75 - dy * 0.3, x0 + 0.2, 0.75 - dy * 0.3],
        ]) {
          const l2 = Math.hypot(bx - ax, by - ay);
          const g = new BoxGeometry(l2 + 0.05, 0.24 - i * 0.06, 0.03);
          g.rotateZ(Math.atan2(by - ay, bx - ax));
          g.translate((ax + bx) / 2, (ay + by) / 2, side * (W / 2 + 0.02 + i * 0.002));
          parts.add(g, c);
        }
      });
    }
  }
  // 고속·시외버스 무늬: 가로 띠 여러 줄, 뒤로 솟는 물결
  if (pat === 'stripes') {
    const cols = [look.stripe ?? stripe, look.stripe2 ?? look.stripe ?? stripe];
    for (const side of [-1, 1]) {
      cols.forEach((c, i) => parts.box(len - 0.4, 0.16, 0.03, mid, wb - 0.35 - i * 0.3, side * (W / 2 + 0.02), c));
    }
  }
  if (pat === 'swoosh') {
    const cols = [look.stripe ?? stripe, look.stripe2 ?? look.stripe ?? stripe];
    for (const side of [-1, 1]) {
      cols.forEach((c, i) => {
        // 앞 아래에서 뒤 위로 비스듬히 오르는 띠 두 토막
        for (const [ax, ay, bx, by] of [
          [x1 - 0.6, 0.7 + i * 0.32, mid, 0.9 + i * 0.32],
          [mid, 0.9 + i * 0.32, x0 + 0.3, wb + 0.9 + i * 0.25],
        ]) {
          const l2 = Math.hypot(bx - ax, by - ay);
          const g = new BoxGeometry(l2, 0.22, 0.03);
          g.rotateZ(Math.atan2(by - ay, bx - ax));
          g.translate((ax + bx) / 2, (ay + by) / 2, side * (W / 2 + 0.02 + i * 0.002));
          parts.add(g, c);
        }
      });
    }
  }
  // 앞(마을버스는 짧게 튀어나온 코)
  if (b.hood) {
    parts.box(0.8, 1.0, W - 0.1, x1 + 0.4, 0.9, 0, front);
    parts.box(0.05, 1.0, W - 0.3, x1 + 0.03, 1.9, 0, GLASS);
  }
  const fx = b.hood ? x1 + 0.8 : x1;
  parts.box(0.06, wb - 0.35, W, fx + 0.02, 0.35 + (wb - 0.35) / 2, 0, front);
  const shieldBottom = b.hood ? 1.4 : look.vehicle === 'low' ? 0.95 : wb - 0.1;
  const shieldTop = H - 0.45;
  if (!b.hood) parts.box(0.06, shieldTop - shieldBottom, W - 0.18, fx + 0.04, (shieldBottom + shieldTop) / 2, 0, GLASS);
  parts.box(0.06, 0.32, W, fx + 0.03, H - 0.27, 0, front);
  // 앞·뒤 불빛
  for (const s of [-1, 1]) {
    parts.box(0.05, 0.2, 0.42, fx + 0.06, 0.62, s * (W / 2 - 0.35), '#f6f2d8');
    parts.box(0.05, 0.35, 0.22, x0 - 0.03, 0.85, s * (W / 2 - 0.2), '#c8302a');
  }
  // 뒤: 작은 뒷유리(관광버스형은 크게)
  parts.box(0.05, wb - 0.35, W, x0 - 0.02, 0.35 + (wb - 0.35) / 2, 0, lower);
  const bigRear = look.vehicle === 'coach' || look.vehicle === 'express';
  parts.box(0.05, bigRear ? wt - wb : 0.7, W - 0.5, x0 - 0.03, bigRear ? (wb + wt) / 2 : wt - 0.45, 0, GLASS);
  // 바퀴와 바퀴집
  for (const ax of b.axles) {
    for (const s of [-1, 1]) {
      const g = new CylinderGeometry(0.5, 0.5, 0.32, 16);
      g.rotateX(Math.PI / 2);
      g.translate(ax, 0.5, s * (W / 2 - 0.2));
      parts.add(g, '#25272a');
      const h = new CylinderGeometry(0.24, 0.24, 0.34, 10);
      h.rotateX(Math.PI / 2);
      h.translate(ax, 0.5, s * (W / 2 - 0.19));
      parts.add(h, '#b9bec2');
      parts.box(1.25, 0.12, 0.05, ax, 1.06, s * (W / 2 + 0.01), DARK);
    }
  }
  // 거울
  for (const s of [-1, 1]) {
    parts.box(0.06, 0.06, 0.45, fx - 0.1, H - 0.7, s * (W / 2 + 0.2), DARK);
    parts.box(0.1, 0.5, 0.22, fx + 0.05, H - 0.95, s * (W / 2 + 0.42), DARK);
  }
  // 지붕 위: 저상버스 가스통 덮개, 냉방기
  if (b.pod) parts.box(3.6, 0.45, 1.9, x1 - 2.6, H + 0.2, 0, roof);
  parts.box(2.2, 0.28, 1.5, mid - 1, H + 0.12, 0, '#cfd3d6');
  // 관광버스형: 옆 아래 짐칸 문
  if (b.luggage) for (const s of [-1, 1]) for (const x of [-1.6, 0.6]) parts.box(1.6, 0.6, 0.03, x, 0.85, s * (W / 2 + 0.015), DARK);
  const group = new Group();
  group.add(new Mesh(parts.geometry(), material));
  // 문짝(따로 움직인다): 문 쪽(+z)
  const doors = [];
  const doorMat = new MeshLambertMaterial({ color: GLASS });
  for (const dx of doorXs) {
    const g = new BoxGeometry(1.1, H - 0.6 - (look.vehicle === 'low' ? 0.05 : 0.35), 0.05);
    const m = new Mesh(g, doorMat);
    const y = (H - 0.3 + (look.vehicle === 'low' ? 0.3 : 0.6)) / 2;
    m.position.set(dx, y, W / 2 + 0.03);
    group.add(m);
    // 문틀(문 색)
    const frame = new Mesh(new BoxGeometry(1.2, 0.08, 0.06), new MeshLambertMaterial({ color: front }));
    frame.position.set(dx, H - 0.32, W / 2 + 0.03);
    group.add(frame);
    doors.push({ mesh: m, base: [dx, y, W / 2 + 0.03] });
  }
  // 행선 표시판: 앞 위, 옆(앞문 뒤)
  const tex = signTexture(String(routeNo));
  const signMat = new MeshBasicMaterial({ map: tex });
  const fs = new Mesh(new PlaneGeometry(W - 0.6, 0.32), signMat);
  fs.position.set(fx + 0.07, H - 0.27, 0);
  fs.rotation.y = Math.PI / 2;
  group.add(fs);
  const ss = new Mesh(new PlaneGeometry(1.4, 0.3), signMat);
  ss.position.set(doorXs[0] - 1.6, wt + 0.12, W / 2 + 0.02);
  group.add(ss);
  const bs = new Mesh(new PlaneGeometry(1.2, 0.3), signMat);
  bs.position.set(x0 - 0.05, wt + 0.1, 0);
  bs.rotation.y = -Math.PI / 2;
  group.add(bs);
  return {
    group,
    body: b,
    doors,
    dispose() {
      group.traverse((o) => {
        o.geometry?.dispose();
        if (o.material && o.material !== material) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
    },
  };
}

/** 버스 안(밖 껍데기를 숨기고 본다): 바닥, 벽(창 자리 비움), 천장 등, 좌석, 손잡이 기둥, 하차벨 */
function busCabin(body, look, material) {
  const { L, W, H, floor, wb, wt } = body;
  const parts = new Parts();
  const glow = new Parts();
  const x0 = -L / 2 + 0.2;
  const x1 = L / 2 - (body.hood ? 0.8 : 0) - 0.2;
  const len = x1 - x0;
  const mid = (x0 + x1) / 2;
  const iw = W / 2 - 0.08;
  const wall = '#e9ebe8';
  parts.box(len, 0.08, iw * 2, mid, floor - 0.04, 0, '#6f7378'); // 바닥
  parts.box(len, 0.01, 0.7, mid, floor + 0.005, 0, '#5d6166'); // 복도 줄
  parts.box(len, 0.06, iw * 2, mid, H - 0.35, 0, '#f2f3f2'); // 천장
  glow.box(len - 1, 0.02, 0.25, mid, H - 0.39, -0.55, '#fffdf2');
  glow.box(len - 1, 0.02, 0.25, mid, H - 0.39, 0.55, '#fffdf2');
  for (const s of [-1, 1]) {
    parts.box(len, wb - floor, 0.05, mid, (floor + wb) / 2, s * iw, wall); // 창 아래
    parts.box(len, H - 0.35 - wt, 0.05, mid, (wt + H - 0.35) / 2, s * iw, wall); // 창 위
    for (let x = x0 + 0.7; x < x1; x += 1.55) parts.box(0.18, wt - wb, 0.08, x, (wb + wt) / 2, s * iw, wall); // 창 사이 기둥
    // 손잡이 막대와 고리
    parts.box(len - 1, 0.04, 0.04, mid, H - 0.6, s * 0.45, '#c9ccd0');
    for (let x = x0 + 1; x < x1 - 1; x += 0.5) parts.box(0.04, 0.22, 0.12, x, H - 0.75, s * 0.45, '#f2c230');
  }
  // 좌석: 뒤쪽 절반은 양쪽 두 줄, 앞쪽은 왼편(문 반대)만
  const seat = look.vehicle === 'coach' ? '#3b4a6b' : '#3f6fb3';
  for (let x = x0 + 0.6; x < x1 - 2.2; x += 0.85) {
    for (const s of [-1, 1]) {
      if (s > 0 && body.doors.some((d) => Math.abs(d - x) < 1.2)) continue;
      if (s > 0 && x > mid && look.vehicle !== 'coach') continue;
      const z = s * (iw - 0.5);
      parts.box(0.45, 0.1, 0.85, x, floor + 0.45, z, seat);
      parts.box(0.08, 0.55, 0.85, x - 0.22, floor + 0.75, z, seat);
    }
  }
  // 노란 기둥과 빨간 하차벨
  for (let x = x0 + 1.2; x < x1 - 1; x += 2.2) {
    for (const s of [-1, 1]) {
      const g = new CylinderGeometry(0.03, 0.03, H - 0.35 - floor, 8);
      g.translate(x, (floor + H - 0.35) / 2, s * 0.42);
      parts.add(g, '#f2c230');
      parts.box(0.08, 0.08, 0.06, x, floor + 1.35, s * 0.42 + s * 0.05, '#d93a2f');
    }
  }
  // 운전석
  parts.box(0.6, 1.0, 0.7, x1 - 0.6, floor + 0.5, -iw + 0.45, '#2f3338');
  parts.box(0.4, 0.5, iw * 2, x1 - 0.15, floor + 0.7, 0, '#3a3d42');
  const group = new Group();
  group.add(new Mesh(parts.geometry(), material), new Mesh(glow.geometry(), new MeshBasicMaterial({ vertexColors: true })));
  return {
    group,
    eye: new Vector3(x0 + len * 0.3, floor + EYE, 0.1),
    look: new Vector3(x1 + 3, floor + 1.0, -0.6),
    hero: { x: x0 + len * 0.3 + 2.4, y: floor },
    dispose() {
      group.traverse((o) => {
        o.geometry?.dispose();
        if (o.material && o.material !== material) o.material.dispose();
      });
    },
  };
}

/**
 * 버스 3D 보기를 만든다. 만들 수 없으면 오류를 던진다(부르는 쪽이 그림으로 돌아간다).
 * @param {{grid: object, route: string, reduceMotion?: boolean}} p route: 노선 이름(예: "1000(급행)", "대구 503")
 */
export function createBus3D({ grid, route, reduceMotion = false }) {
  const look = busLookOf(route);
  const el = document.createElement('div');
  el.className = 'tr3d';
  const canvas = document.createElement('canvas');
  canvas.className = 'tr3d-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '버스 3D 그림');
  el.append(canvas);
  const overlay = document.createElement('div');
  overlay.className = 'tr3d-overlay';
  const displayBox = document.createElement('div');
  displayBox.className = 'tr3d-display';
  overlay.append(displayBox);
  el.append(overlay);
  const credit = document.createElement('div');
  credit.className = 'tr3d-credit';
  credit.textContent = '도로 모양 © OpenStreetMap contributors';
  el.append(credit);

  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  scene.background = new Color(SKY);
  scene.fog = new Fog(SKY, 250, 900);
  const camera = new PerspectiveCamera(58, 16 / 10, 0.1, 2000);
  const hemi = new HemisphereLight(0xf4f8ff, 0xb9b3a6, 1.4);
  scene.add(hemi, new AmbientLight(0xffffff, 0.25));
  const sun = new DirectionalLight(0xffffff, 1.9);
  sun.position.set(-0.4, 1, 0.3);
  scene.add(sun);
  const material = new MeshLambertMaterial({ vertexColors: true });
  const glowMat = new MeshBasicMaterial({ vertexColors: true });
  const facadeMats = new Map();

  // 버스
  const bus = busMesh(look, look.no, material);
  scene.add(bus.group);
  const cabin = busCabin(bus.body, look, material);
  cabin.group.visible = false;
  bus.group.add(cabin.group);

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

  let stops = [];
  let paths = [];
  let origin = [0, 0];
  let world = null;
  let worldSeg = -1;
  let seg = 0; // 지금 구간(정류장 seg → seg+1)
  let posKm = 0; // 구간 안 버스 머리 자리
  let drive = null; // 달리는 중: {from, to, start, ms, done}
  let mode = 'side';
  let outsideMode = 'side';
  let doorAmount = 0;
  let doorTarget = 0;
  let approach = null; // 정류장 장면: 버스가 들어오는 길(격자 점)
  let raf = 0;
  let last = 0;

  const W = (x, y) => [(x - origin[0]) * 1000, (y - origin[1]) * 1000];
  const groundY = (x, y) => Math.max(0, groundAt(grid, x, y));

  function disposeWorld() {
    if (!world) return;
    scene.remove(world);
    world.traverse((o) => {
      o.geometry?.dispose();
      const m = o.material;
      if (m && m !== material && m !== glowMat && ![...facadeMats.values()].includes(m)) {
        m.map?.dispose();
        m.dispose();
      }
    });
    world = null;
  }

  /** 길 점마다 차로 옆 거리(오른편, 미터): 가까운 도로 폭에서 */
  function laneOffsets(pts) {
    const { roads, index } = roadsNow();
    return pts.map(([x, y]) => {
      const n = nearestRoad(roads, index, { x, y }, 0.05, notMade);
      const w = ROAD_W[roads.edges[n?.edge]?.cls] ?? 10;
      return Math.max(1.8, w / 2 - 1.9);
    });
  }

  /** 정류장 seg 둘레(앞 구간, 이 구간)의 땅, 도로, 건물, 가로수, 정류장 쉼터를 짓는다 */
  function buildWorld(k) {
    disposeWorld();
    worldSeg = k;
    world = new Group();
    const path = paths[k] ?? [[stops[k].x, stops[k].y], [stops[k].x + 0.001, stops[k].y]];
    const extra = approach ?? [];
    const all = [...path, ...extra];
    const minX = Math.min(...all.map((p) => p[0])) - PAD_KM;
    const maxX = Math.max(...all.map((p) => p[0])) + PAD_KM;
    const minY = Math.min(...all.map((p) => p[1])) - PAD_KM;
    const maxY = Math.max(...all.map((p) => p[1])) + PAD_KM;
    origin = [(minX + maxX) / 2, (minY + maxY) / 2];
    const parts = new Parts();
    const glow = new Parts();

    // 땅: 20m 눈금
    const STEP = 0.02;
    const nx = Math.ceil((maxX - minX) / STEP) + 1;
    const ny = Math.ceil((maxY - minY) / STEP) + 1;
    const pos = [];
    const col = [];
    const idx = [];
    const c = new Color();
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = minX + i * STEP;
        const y = minY + j * STEP;
        const [wx, wz] = W(x, y);
        pos.push(wx, groundY(x, y) - 0.05, wz);
        const people = grid.population[Math.floor(y)]?.[Math.floor(x)] ?? 0;
        const terrain = grid.terrain[Math.floor(y)]?.[Math.floor(x)];
        c.set(terrain === 'sea' ? '#c8c2b0' : people > 3000 ? '#b3ada3' : people > 500 ? '#bfc6a9' : '#a7bf82');
        col.push(c.r, c.g, c.b);
        if (i > 0 && j > 0) {
          const a = (j - 1) * nx + i - 1;
          idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
        }
      }
    }
    const gGeo = new BufferGeometry();
    gGeo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    gGeo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
    gGeo.setIndex(idx);
    gGeo.computeVertexNormals();
    world.add(new Mesh(gGeo, material));

    // 도로: 둘레 안 토막
    const { roads, index } = roadsNow();
    const seen = new Set();
    for (let cy = Math.floor(minY); cy <= Math.floor(maxY); cy++) {
      for (let cx = Math.floor(minX); cx <= Math.floor(maxX); cx++) {
        for (const e of index.get(`${cx},${cy}`) ?? []) seen.add(e);
      }
    }
    const inBox = (p) => p[0] >= minX - 0.05 && p[0] <= maxX + 0.05 && p[1] >= minY - 0.05 && p[1] <= maxY + 0.05;
    const roadSegs = []; // 건물이 도로를 피하도록 [x0, z0, x1, z1, 반폭]
    /** 세계 좌표의 땅 높이 */
    const hW = (wx, wz) => groundY(wx / 1000 + origin[0], wz / 1000 + origin[1]);
    /** 선을 따라 띠(왼쪽 오프셋 o, 폭 w, 땅 위 dy). 비탈을 따라 8m 조각으로 기울여 깐다. */
    const strip = (wpts, ys, o, w, dy, color, into = parts) => {
      for (let i = 1; i < wpts.length; i++) {
        const [ax, az] = wpts[i - 1];
        const [bx, bz] = wpts[i];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.05) continue;
        const nx2 = -(bz - az) / len;
        const nz2 = (bx - ax) / len;
        const yaw = Math.atan2(-(bz - az), bx - ax);
        const pieces = Math.max(1, Math.ceil(len / 8));
        for (let q = 0; q < pieces; q++) {
          const t0 = q / pieces;
          const t1 = (q + 1) / pieces;
          const x0 = ax + (bx - ax) * t0 + nx2 * o;
          const z0 = az + (bz - az) * t0 + nz2 * o;
          const x1 = ax + (bx - ax) * t1 + nx2 * o;
          const z1 = az + (bz - az) * t1 + nz2 * o;
          const y0 = hW(x0, z0);
          const y1 = hW(x1, z1);
          const piece = len / pieces;
          const g = new BoxGeometry(Math.hypot(piece, y1 - y0) + 0.04, 0.04, w);
          g.rotateZ(Math.atan2(y1 - y0, piece));
          g.rotateY(yaw);
          g.translate((x0 + x1) / 2, (y0 + y1) / 2 + dy + 0.06, (z0 + z1) / 2);
          into.add(g, color);
        }
      }
    };
    const crossings = new Map(); // 큰 길 교차점 → 횟수
    for (const e of seen) {
      const edge = roads.edges[e];
      if (edge.cls === MADE_ROAD || !edge.pts.some(inBox)) continue;
      const w = ROAD_W[edge.cls] ?? 8;
      const wpts = edge.pts.map(([x, y]) => W(x, y));
      const ys = edge.pts.map(([x, y]) => groundY(x, y));
      const lift = 0.02 + (6 - edge.cls) * 0.004; // 큰 길이 조금 위(겹치는 교차점)
      strip(wpts, ys, 0, w, lift, '#55585d');
      for (let i = 1; i < wpts.length; i++) roadSegs.push([...wpts[i - 1], ...wpts[i], w / 2]);
      if (edge.cls <= 4) {
        // 보도와 연석, 가로수
        for (const s of [-1, 1]) {
          strip(wpts, ys, s * (w / 2 + WALK_W / 2), WALK_W, 0.12, '#cdc8be');
          strip(wpts, ys, s * (w / 2 + 0.1), 0.2, 0.14, '#9a968e');
        }
        // 중앙선(노랑), 큰 길은 차로 점선(흰색)
        strip(wpts, ys, 0.15, 0.12, lift + 0.025, '#e8b92a');
        strip(wpts, ys, -0.15, 0.12, lift + 0.025, '#e8b92a');
        if (edge.cls <= 3) {
          for (let i = 1; i < wpts.length; i++) {
            const [ax, az] = wpts[i - 1];
            const [bx, bz] = wpts[i];
            const len = Math.hypot(bx - ax, bz - az);
            for (let d = 2; d < len - 3; d += 9) {
              const t0 = d / len;
              const t1 = Math.min(1, (d + 3) / len);
              const p0 = [ax + (bx - ax) * t0, az + (bz - az) * t0];
              const p1 = [ax + (bx - ax) * t1, az + (bz - az) * t1];
              for (const s of [-1, 1]) strip([p0, p1], [ys[i - 1], ys[i]], s * (w / 4), 0.12, lift + 0.025, '#f2f2ee');
            }
          }
        }
        for (const end of [edge.a, edge.b]) crossings.set(end, (crossings.get(end) ?? 0) + 1);
      }
    }
    // 횡단보도: 큰 길이 셋 넘게 만나는 곳의 길마다
    for (const e of seen) {
      const edge = roads.edges[e];
      if (edge.cls > 3 || !edge.pts.some(inBox)) continue;
      const w = ROAD_W[edge.cls];
      for (const [node, from, next] of [[edge.a, 0, 1], [edge.b, edge.pts.length - 1, edge.pts.length - 2]]) {
        if ((crossings.get(node) ?? 0) < 3 || next < 0 || next >= edge.pts.length) continue;
        const [ax, az] = W(...edge.pts[from]);
        const [bx, bz] = W(...edge.pts[next]);
        const len = Math.hypot(bx - ax, bz - az);
        if (len < w) continue;
        const ux = (bx - ax) / len;
        const uz = (bz - az) / len;
        const cx = ax + ux * (w / 2 + 4);
        const cz = az + uz * (w / 2 + 4);
        const y = groundY(...edge.pts[from]) + 0.07;
        for (let k2 = -w / 2 + 0.8; k2 < w / 2 - 0.4; k2 += 1.2) {
          const g = new BoxGeometry(3, 0.02, 0.6);
          g.rotateY(Math.atan2(-uz, ux));
          g.translate(cx - uz * k2, y, cz + ux * k2);
          parts.add(g, '#f4f4f0');
        }
      }
    }

    // 건물: 28m 눈금마다 칸의 인구로 어림(도로와 보도는 피한다)
    const nearRoad = (x, z, r) => {
      for (const [ax, az, bx, bz, hw] of roadSegs) {
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        if (Math.hypot(x - ax - t * dx, z - az - t * dz) < hw + WALK_W + r) return true;
      }
      return false;
    };
    const tooNearPath = (x, z, r) =>
      [...path, ...extra].some((p, i, arr) => {
        if (i === 0) return false;
        const [ax, az] = W(...arr[i - 1]);
        const [bx, bz] = W(...p);
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        return Math.hypot(x - ax - t * dx, z - az - t * dz) < 12 + r;
      });
    const bySeat = new Map();
    const G = 0.028;
    let made = 0;
    for (let gy = Math.ceil(minY / G); gy * G <= maxY && made < 2600; gy++) {
      for (let gx = Math.ceil(minX / G); gx * G <= maxX && made < 2600; gx++) {
        const x = gx * G;
        const y = gy * G;
        const col2 = Math.floor(x);
        const row2 = Math.floor(y);
        const terrain = grid.terrain[row2]?.[col2];
        if (!terrain || terrain === 'sea' || terrain === 'river' || terrain === 'mountain') continue;
        const people = grid.population[row2]?.[col2] ?? 0;
        const chance = Math.min(0.85, people / 9000 + 0.06);
        if (cellNoise(gx, gy, 41) > chance) continue;
        const size = 10 + cellNoise(gx, gy, 42) * (people > 8000 ? 16 : 10);
        const [wx, wz] = W(x + (cellNoise(gx, gy, 43) - 0.5) * 0.008, y + (cellNoise(gx, gy, 44) - 0.5) * 0.008);
        if (nearRoad(wx, wz, size * 0.6) || tooNearPath(wx, wz, size * 0.6)) continue;
        const floors = people > 15000 ? 8 + Math.floor(cellNoise(gx, gy, 45) * 18) : people > 5000 ? 3 + Math.floor(cellNoise(gx, gy, 45) * 8) : 1 + Math.floor(cellNoise(gx, gy, 45) * 3);
        const h = floors * 3.2;
        const style = floors >= 10 ? 'band' : floors >= 4 ? (cellNoise(gx, gy, 46) > 0.5 ? 'band' : 'punched') : cellNoise(gx, gy, 46) > 0.5 ? 'brick' : 'punched';
        const tints = ['#ece8de', '#e3ddd2', '#d9dde0', '#efe6d6', '#e0d8cc', '#d6d2c8'];
        const tint = new Color(tints[Math.floor(cellNoise(gx, gy, 47) * tints.length)]);
        const base = groundY(x, y);
        const rot = cellNoise(gx, gy, 48) * Math.PI;
        const hw = size / 2;
        const hd = (size * (0.6 + cellNoise(gx, gy, 49) * 0.5)) / 2;
        const cs = Math.cos(rot);
        const sn = Math.sin(rot);
        const corner = (u, v) => [wx + u * cs - v * sn, wz + u * sn + v * cs];
        const ring = [corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(-hw, hd)];
        if (!bySeat.has(style)) bySeat.set(style, new Mesher());
        const m = bySeat.get(style);
        let run = 0;
        for (let i = 0; i < 4; i++) {
          const [ax, az] = ring[i];
          const [bx, bz] = ring[(i + 1) % 4];
          const len = Math.hypot(bx - ax, bz - az);
          m.quad([ax, base, az], [bx, base, bz], [bx, base + h, bz], [ax, base + h, az], tint, [[run / 3, 0], [(run + len) / 3, 0], [(run + len) / 3, h / 4], [run / 3, h / 4]]);
          run += len;
        }
        const roofG = new BoxGeometry(hw * 2, 0.3, hd * 2);
        roofG.rotateY(-rot);
        roofG.translate(wx, base + h + 0.15, wz);
        parts.add(roofG, '#8f969c');
        made += 1;
      }
    }
    for (const [style, m] of bySeat) {
      if (!facadeMats.has(style)) facadeMats.set(style, new MeshLambertMaterial({ map: facadeTexture(style), vertexColors: true, side: DoubleSide }));
      world.add(new Mesh(m.geometry(), facadeMats.get(style)));
    }

    // 가로수: 큰 길 보도에 14m마다
    const trees = [];
    for (const e of seen) {
      const edge = roads.edges[e];
      if (edge.cls > 4 || !edge.pts.some(inBox)) continue;
      const w = ROAD_W[edge.cls];
      for (let i = 1; i < edge.pts.length; i++) {
        const [ax, az] = W(...edge.pts[i - 1]);
        const [bx, bz] = W(...edge.pts[i]);
        const len = Math.hypot(bx - ax, bz - az);
        const nx2 = -(bz - az) / (len || 1);
        const nz2 = (bx - ax) / (len || 1);
        for (let d = 6; d < len - 4; d += 14) {
          for (const s of [-1, 1]) {
            const px = ax + ((bx - ax) * d) / len + s * nx2 * (w / 2 + 1.2);
            const pz = az + ((bz - az) * d) / len + s * nz2 * (w / 2 + 1.2);
            if (trees.length < 1500) trees.push([px, hW(px, pz) + 0.18, pz]);
          }
        }
      }
    }
    if (trees.length) {
      const trunks = new InstancedMesh(new CylinderGeometry(0.15, 0.2, 2.6, 6), new MeshLambertMaterial({ color: 0x6b4f37 }), trees.length);
      const crowns = new InstancedMesh(new SphereGeometry(1.8, 7, 5), new MeshLambertMaterial({ color: 0x5f9a4f }), trees.length);
      const d = new Object3D();
      trees.forEach(([x, y, z], i) => {
        d.position.set(x, y + 1.3, z);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        trunks.setMatrixAt(i, d.matrix);
        const s = 0.8 + cellNoise(i, 3, 9) * 0.5;
        d.position.set(x, y + 3.3 * s, z);
        d.scale.set(s, s * 1.1, s);
        d.updateMatrix();
        crowns.setMatrixAt(i, d.matrix);
      });
      world.add(trunks, crowns);
    }

    // 정류장 쉼터: 이 구간의 두 정류장
    for (const si of [k, k + 1]) {
      const st = stops[si];
      if (!st) continue;
      const p = stopPose(si);
      if (!p) continue;
      const g = new Group();
      g.position.set(p.x, p.y + 0.12, p.z);
      g.rotation.y = Math.atan2(-p.dz, p.dx);
      const sp = new Parts();
      // 이 틀: +x 버스가 가는 쪽, +z 보도 쪽
      sp.box(4.2, 0.12, 1.8, 0, 2.6, 1.2, '#5d6670'); // 지붕
      sp.box(4.2, 2.4, 0.06, 0, 1.3, 2.05, '#a9c3d4'); // 뒤 유리
      for (const x of [-2, 2]) sp.box(0.1, 2.6, 0.1, x, 1.3, 2.0, '#5d6670');
      sp.box(2.6, 0.08, 0.45, 0, 0.45, 1.75, '#c9a36b'); // 의자
      sp.box(0.12, 3.0, 0.12, 2.9, 1.5, 0.5, '#56636e'); // 표지 기둥
      sp.box(0.9, 0.5, 0.06, 2.9, 2.85, 0.5, '#2E8B3E');
      g.add(new Mesh(sp.geometry(), material));
      const nameBoard = new Mesh(new PlaneGeometry(3.6, 0.9), new MeshBasicMaterial({ map: stopTexture(st.name) }));
      nameBoard.position.set(0, 3.1, 1.2);
      const back = nameBoard.clone();
      back.rotation.y = Math.PI;
      g.add(nameBoard, back);
      world.add(g);
    }

    // 차고지: 정류장 장면에서 버스가 첫 정류장(기점)에서 출발할 때
    if (approach && depot) {
      const [sx, sy] = approach[0];
      const [ax, az] = W(sx, sy);
      const [bx, bz] = W(...approach[1]);
      const yaw = Math.atan2(-(bz - az), bx - ax);
      const d = new Group();
      d.position.set(ax, groundY(sx, sy), az);
      d.rotation.y = yaw;
      const dp = new Parts();
      dp.box(40, 0.1, 22, 0, 0.06, 0, '#bfc3c6'); // 콘크리트 바닥
      for (const z of [-5, 0, 5]) for (let x = -18; x <= 18; x += 3) dp.box(1.4, 0.02, 0.2, x, 0.12, z, (x / 3) % 2 ? '#f2c230' : '#26282b'); // 안전 줄무늬
      for (let x = -18; x <= 18; x += 6) for (const z of [-10, 10]) dp.box(0.4, 7, 0.4, x, 3.5, z, '#c9ccd0'); // 철골 기둥
      for (const s of [-1, 1]) {
        const g2 = new BoxGeometry(40, 0.2, 11.4);
        g2.rotateX(s * 0.32);
        g2.translate(0, 8.6, s * 5.4);
        dp.add(g2, '#7d8790');
      }
      d.add(new Mesh(dp.geometry(), material));
      world.add(d);
    }

    world.add(new Mesh(parts.geometry(), material), new Mesh(glow.geometry(), glowMat));
    scene.add(world);
  }

  /** 정류장 si의 자리(세계 좌표): 버스가 서는 차로와 보도 쪽 방향 */
  function stopPose(si) {
    const path = paths[si] ?? (paths[si - 1] ? [...paths[si - 1]].reverse() : null);
    if (!path) return null;
    const usePrev = !paths[si];
    const a = usePrev ? along(paths[si - 1], lengthOf(paths[si - 1])) : along(path, 0);
    const [x, z] = W(a.x, a.y);
    const lane = laneOffsets([[a.x, a.y]])[0];
    // 보도 쪽(오른편)으로: 도로 반폭 + 보도 가운데
    const half = lane + 1.9;
    const rx = -a.dy;
    const rz = a.dx;
    return { x: x + rx * (half + 0.4), z: z + rz * (half + 0.4), y: groundY(a.x, a.y), dx: a.dx, dz: a.dy, lane, half };
  }

  let laneCache = new Map();
  /** 구간 path의 km 자리에 있는 버스의 세계 자리와 방향(차로로 비켜) */
  function busPose(path, km) {
    const a = along(path, km);
    const b = along(path, Math.min(lengthOf(path), km + 0.006));
    const key = `${Math.round(a.x * 2000)},${Math.round(a.y * 2000)}`;
    if (!laneCache.has(key)) laneCache.set(key, laneOffsets([[a.x, a.y]])[0]);
    const lane = laneCache.get(key);
    const dx = b.x - a.x || a.dx;
    const dy = b.y - a.y || a.dy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const [x, z] = W(a.x, a.y);
    // 땅 높이는 차로 자리에서 잰다(도로 띠와 같은 땅)
    return { x: x - uy * lane, z: z + ux * lane, y: groundY(a.x - (uy * lane) / 1000, a.y + (ux * lane) / 1000) + 0.08, ux, uz: uy };
  }

  let curPath = null;
  let depot = false;
  function placeBus() {
    const path = curPath;
    if (!path) return;
    const L = lengthOf(path);
    // 버스 가운데 = 머리에서 반 길이 뒤
    const head = Math.min(L, posKm);
    const p = busPose(path, Math.max(0, head - bus.body.L / 2000));
    // 비탈: 앞바퀴와 뒷바퀴 자리의 땅 높이로 차를 기울인다
    const half = bus.body.L / 2;
    const ground = (d) => groundY((p.x + p.ux * d) / 1000 + origin[0], (p.z + p.uz * d) / 1000 + origin[1]) + 0.08;
    const yF = ground(half * 0.7);
    const yR = ground(-half * 0.7);
    bus.group.position.set(p.x, (yF + yR) / 2, p.z);
    bus.group.rotation.set(0, Math.atan2(-p.uz, p.ux), Math.atan2(yF - yR, half * 1.4));
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

  const v = new Vector3();
  const lookAt = new Vector3();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!curPath || !el.isConnected || el.offsetParent === null) return;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0);
    last = now;
    resize();
    mixer.update(reduceMotion ? 0 : dt);
    if (drive) {
      if (!drive.start) drive.start = now;
      const u = drive.ms > 0 ? Math.min(1, (now - drive.start) / drive.ms) : 1;
      // 천천히 떠나 천천히 선다
      const e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
      posKm = drive.from + (drive.to - drive.from) * e;
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
    const bp = bus.group.position;
    const ux = Math.cos(-bus.group.rotation.y);
    const uz = Math.sin(-bus.group.rotation.y);
    // 오른편(보도 쪽) 단위: (-uz, ux)
    const rx = -uz;
    const rz = ux;
    if (mode === 'cabin') {
      bus.group.updateMatrixWorld(true);
      camera.position.copy(cabin.eye).applyMatrix4(bus.group.matrixWorld);
      camera.lookAt(lookAt.copy(cabin.look).applyMatrix4(bus.group.matrixWorld));
    } else if (mode === 'stop') {
      const p = stopPose(seg);
      if (p) {
        // 보도에서 버스가 오는 쪽을 비스듬히 본다. 주인공은 연석에서 1.5m 뒤에 선다.
        const fx = p.dx;
        const fz = p.dz;
        const rx2 = -fz;
        const rz2 = fx;
        // 버스가 서는 자리(머리 +4m)보다 조금 앞, 보도 안쪽에서 버스가 오는 쪽을 본다
        camera.position.set(p.x + fx * 10 + rx2 * 2.2, p.y + 0.12 + EYE, p.z + fz * 10 + rz2 * 2.2);
        camera.lookAt(p.x - fx * 30 - rx2 * 1.5, p.y + 1.4, p.z - fz * 30 - rz2 * 1.5);
        hero.root.position.set(p.x + fx * 2.6 - rx2 * 0.2, p.y + 0.12, p.z + fz * 2.6 - rz2 * 0.2);
        hero.root.rotation.set(0, Math.atan2(-rx2 * 0.7 + fx * 0.7, -rz2 * 0.7 + fz * 0.7), 0);
      }
    } else if (mode === 'chase') {
      camera.position.set(bp.x - ux * 16 + rx * 3, bp.y + 6, bp.z - uz * 16 + rz * 3);
      camera.lookAt(bp.x + ux * 10, bp.y + 1.5, bp.z + uz * 10);
    } else if (mode === 'sky') {
      camera.position.set(bp.x - ux * 30 + rx * 25, bp.y + 55, bp.z - uz * 30 + rz * 25);
      camera.lookAt(bp.x + ux * 25, bp.y, bp.z + uz * 25);
    } else {
      // 옆에서: 문 쪽(오른편) 보도 너머에서
      camera.position.set(bp.x + rx * 15 + ux * 2, bp.y + 2.6, bp.z + rz * 15 + uz * 2);
      camera.lookAt(bp.x + ux * 1, bp.y + 1.6, bp.z + uz * 1);
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

  const api = {
    el,
    look,
    /**
     * 탈 버스의 정류장들(탈 곳부터 내릴 곳까지).
     * @param {Array<{name: string, x: number, y: number}>} list
     * @param {{fromFirst?: boolean}} [options] fromFirst: 탈 곳이 이 노선의 기점(차고지에서 나온다)
     */
    setRide(list, { fromFirst = false } = {}) {
      stops = list;
      paths = list.slice(0, -1).map((s, i) => roadPath(s, list[i + 1]));
      depot = fromFirst;
      seg = 0;
      api.atStop(0);
    },
    /** 정류장 k에 서 있게 한다(k → k+1 구간을 짓는다) */
    atStop(k) {
      seg = Math.min(k, Math.max(0, stops.length - 2));
      const atEnd = k >= stops.length - 1;
      approach = null;
      curPath = paths[seg];
      if (!curPath) return;
      if (worldSeg !== seg) buildWorld(seg);
      posKm = atEnd ? lengthOf(curPath) : bus.body.L / 1000;
    },
    /** 정류장 장면: 버스가 들어오는 길(정류장 뒤로 곧게 160m)을 붙이고, 아직 버스는 오지 않는다 */
    waitAtStop() {
      const first = paths[0];
      if (!first) return;
      const a = along(first, 0);
      const back = 0.16;
      approach = [[a.x - a.dx * back, a.y - a.dy * back], [a.x, a.y]];
      curPath = [approach[0], ...first];
      seg = 0;
      buildWorld(0);
      worldSeg = -1; // 타고 나면 다시 짓는다(들어오는 길 없이)
      posKm = 0;
      bus.group.visible = false;
    },
    /** 정류장 장면: 버스가 들어와 선다. 다 서면 끝나는 약속 */
    arrive(ms = 7000) {
      bus.group.visible = true;
      // 버스 머리가 정류장보다 4m 앞에 선다(앞문이 기다리는 사람 앞에 온다)
      const to = 0.16 + 0.004;
      return new Promise((done) => {
        drive = { from: depot ? bus.body.L / 1000 : 0.01, to, start: 0, ms: reduceMotion ? 0 : ms, done };
      });
    },
    /** 다음 정류장까지 달린다(ms 동안). 다 서면 끝나는 약속 */
    driveTo(k, ms = 6000) {
      let from = Math.min(seg, stops.length - 2);
      if (k <= from && !(k === stops.length - 1 && from === stops.length - 2)) return Promise.resolve();
      // 여러 정류장을 건너뛰면 마지막 앞 정류장으로 옮긴 뒤 마지막 구간만 달린다(구간마다 거리를 새로 짓기 때문)
      if (k > from + 1) from = k - 1;
      api.atStop(from);
      const L = lengthOf(curPath);
      return new Promise((done) => {
        drive = {
          from: posKm,
          to: L,
          start: 0,
          ms: reduceMotion ? 0 : ms,
          done: () => {
            if (k < stops.length - 1) api.atStop(k);
            done();
          },
        };
      });
    },
    setDoors(open) {
      doorTarget = open ? 1 : 0;
    },
    /** 'stop'(정류장), 'cabin'(버스 안), 'outside'(밖에서) */
    setView(view) {
      mode = view === 'outside' ? outsideMode : view;
      const inCabin = mode === 'cabin';
      cabin.group.visible = inCabin;
      bus.group.children[0].visible = !inCabin;
      for (const d of bus.doors) d.mesh.visible = !inCabin;
      camRow.style.display = view === 'outside' ? '' : 'none';
      if (view === 'stop') scene.add(hero.root);
      else if (inCabin) {
        bus.group.add(hero.root);
        hero.root.position.set(cabin.hero.x, cabin.hero.y, 0);
        hero.root.rotation.set(0, -Math.PI / 2, 0);
      } else hero.root.removeFromParent();
      hemi.groundColor.setHex(inCabin ? 0xd9d5cc : 0xb9b3a6);
      camera.fov = inCabin || view === 'stop' ? 62 : 55;
      camera.near = 0.05;
      camera.updateProjectionMatrix();
      canvas.setAttribute('aria-label', inCabin ? '버스 안 3D 그림' : view === 'stop' ? '버스 정류장 3D 그림' : '버스를 밖에서 본 3D 그림');
    },
    setDisplay(lines) {
      displayBox.replaceChildren(...lines.map((line) => Object.assign(document.createElement('div'), { textContent: line })));
    },
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
    onHero(fn) {
      heroDone = fn;
    },
    destroy() {
      cancelAnimationFrame(raf);
      disposeWorld();
      mixer.stopAllAction();
      hero.dispose();
      bus.dispose();
      cabin.dispose();
      material.dispose();
      glowMat.dispose();
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
