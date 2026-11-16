// 기차 3D 보기의 역: 역사(역 건물), 승강장, 승강장 지붕, 건너는 다리, 역 안 선로.
// 실제 자리와 모양은 OpenStreetMap(data/build/station-areas.json, scripts/build-station-areas.mjs)에서 온다.
// 주요 역의 겉모습 특징은 data/facts.json stationLooks(위키백과·위키미디어 공용 사진에서 본 특징)를 따른다.
// 건물은 바닥 모양을 그대로 세워 올리고, 외벽 무늬와 지붕은 코드로 그린다(실제 건물을 베끼지 않고 특징만 따른다. 로고는 넣지 않는다).
// 자료가 없는 역은 만든 모양(승강장, 지붕, 건너는 다리, 역 건물)으로 짓는다.
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  RepeatWrapping,
  ShapeUtils,
  SRGBColorSpace,
  Vector2,
} from 'three';
import stationAreas from '../../data/build/station-areas.json';
import { pointAt } from '../sim/train-3d-path.js';
import { Parts } from './train-3d-cars.js';
import { railStationById } from '../data.js';

/** 역 자료가 있는가(역 안 선로를 그리면 기본 두 번째 선로를 숨긴다) */
export function stationData(id) {
  return stationAreas.stations?.[id] ?? null;
}

/** 승강장 이름판(흰 바탕에 역 이름, 아래 꾸밈 띠) */
export function boardTexture(text, accent, { bg = '#ffffff', fg = '#1f2a36', width = 512, height = 128 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, width, height);
  g.fillStyle = accent;
  g.fillRect(0, height * 0.81, width, height * 0.19);
  g.fillStyle = fg;
  g.font = `bold ${Math.round(height * 0.56)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, width / 2, height * 0.42, width * 0.94);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * 외벽 무늬(한 칸 = 가로 3m × 세로 한 층 4m). 꼭짓점 색(벽 색)을 곱해 쓴다.
 * curtain: 유리 커튼월, band: 가로 띠창, punched: 작은 창, hanok: 한옥(흰 벽과 나무 틀), brick: 벽돌
 */
function facadeTexture(style) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 160;
  const g = canvas.getContext('2d');
  const W = 128;
  const H = 160;
  if (style === 'curtain') {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#b7c6d2');
    grad.addColorStop(1, '#7f909e');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.moveTo(10, 0);
    g.lineTo(40, 0);
    g.lineTo(0, 60);
    g.lineTo(0, 15);
    g.fill();
    g.fillStyle = '#e4e7ea';
    g.fillRect(0, 0, 4, H); // 세로 멀리언
    g.fillRect(W / 2 - 1, 0, 2, H);
    g.fillRect(0, 0, W, 7); // 층 띠
    g.fillRect(0, H / 2 - 1, W, 2);
  } else if (style === 'band') {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#5b7186';
    g.fillRect(0, 22, W, 82);
    g.fillStyle = '#dfe3e6';
    for (const x of [0, 42, 85]) g.fillRect(x, 22, 3, 82);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, 104, W, 4);
  } else if (style === 'hanok') {
    g.fillStyle = '#f3efe6';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#6b4a32';
    g.fillRect(0, 0, 10, H); // 기둥
    g.fillRect(0, 0, W, 10); // 인방
    g.fillRect(0, H - 14, W, 14);
    g.strokeStyle = '#7a5638';
    g.lineWidth = 3;
    for (let x = 30; x < W - 10; x += 16) {
      g.beginPath();
      g.moveTo(x, 40);
      g.lineTo(x, 120);
      g.stroke();
    }
    for (let y = 40; y <= 120; y += 16) {
      g.beginPath();
      g.moveTo(24, y);
      g.lineTo(W - 12, y);
      g.stroke();
    }
  } else if (style === 'brick') {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(120,60,40,0.25)';
    for (let y = 0; y < H; y += 10) for (let x = (y / 10) % 2 ? -12 : 0; x < W; x += 24) g.fillRect(x + 1, y + 1, 22, 8);
    g.fillStyle = '#4c5f70';
    g.fillRect(40, 45, 48, 62);
    g.fillStyle = '#efe9df';
    g.fillRect(36, 105, 56, 6);
  } else {
    // punched: 밝은 벽에 창
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#4f6476';
    g.fillRect(28, 38, 72, 74);
    g.fillStyle = '#d9dcdd';
    g.fillRect(62, 38, 4, 74);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(24, 112, 80, 6);
  }
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  return t;
}

/** 무늬 있는 그물 모으기(자리, 법선, 색, 무늬 좌표) */
class Mesher {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
  }

  /** 네 점 면(a, b, c, d 차례로 둘레), 무늬 좌표 네 개 */
  quad(a, b, c, d, color, uvs) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (const [p, t] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [a, uvs[0]], [c, uvs[2]], [d, uvs[3]]]) {
      this.pos.push(...p);
      this.nor.push(nx, ny, nz);
      this.col.push(color.r, color.g, color.b);
      this.uv.push(...t);
    }
  }

  geometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.computeBoundingSphere();
    return g;
  }
}

// ── 평면 도형 셈(x, z 미터) ──
const signedArea = (ring) => ring.reduce((s, p, i) => {
  const q = ring[(i + 1) % ring.length];
  return s + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;
function insideRing([x, z], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}
/** 점에서 선까지 가장 가까운 점과 거리 */
function nearestOnLine([x, z], line) {
  let best = { d: Infinity, p: line[0] };
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1];
    const [bx, bz] = line[i];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    const px = ax + t * dx;
    const pz = az + t * dz;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, p: [px, pz] };
  }
  return best;
}
/** 가장 작은 둘러싼 직사각형(볼록 껍질 변 방향 중): 가운데, 긴 축(단위), 반 길이 */
function orientedBox(ring) {
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.5) continue;
    const ux = (b[0] - a[0]) / len;
    const uz = (b[1] - a[1]) / len;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [x, z] of ring) {
      const u = x * ux + z * uz;
      const v = -x * uz + z * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) best = { area, ux, uz, minU, maxU, minV, maxV };
  }
  if (!best) return null;
  let { ux, uz, minU, maxU, minV, maxV } = best;
  // 긴 축을 u로
  if (maxV - minV > maxU - minU) {
    [ux, uz] = [-uz, ux];
    [minU, maxU, minV, maxV] = [minV, maxV, -maxU, -minU];
  }
  const cu = (minU + maxU) / 2;
  const cv = (minV + maxV) / 2;
  return {
    cx: cu * ux - cv * uz,
    cz: cu * uz + cv * ux,
    ux,
    uz,
    A: (maxU - minU) / 2,
    B: (maxV - minV) / 2,
    fill: Math.abs(signedArea(ring)) / ((maxU - minU) * (maxV - minV) || 1),
  };
}
/** 직사각형 위의 점(u, v는 가운데에서 긴 축, 짧은 축 방향 미터) */
export const boxPoint = (o, u, v) => [o.cx + u * o.ux - v * o.uz, o.cz + u * o.uz + v * o.ux];

/**
 * 역 하나를 짓는다.
 * @param {object} ctx
 * @returns {{group: Group, stop: {side: number, edge: number, width: number}, hidesSecondTrack: boolean}}
 *   stop: 기차가 서는 승강장(side 1 = 가는 쪽 왼편, -1 = 오른편, edge = 기차 선로 가운데에서 승강장 끝까지 미터, width = 승강장 폭)
 */
export function buildStation(ctx) {
  const { id, name, centerKm, profile, toWorld, origin, meshHeight, look, materials, trainLenKm, TRACK_SIDE, PLATFORM_TOP, textures } = ctx;
  const group = new Group();
  const data = stationData(id);
  const recipe = data?.look ?? {};
  const T = PLATFORM_TOP;
  const accent = look.accent;

  // ── 선로 위 자리 셈 ──
  const win0 = Math.max(0, centerKm - 1.1);
  const win1 = Math.min(profile.lengthKm, centerKm + 0.7);
  const samples = [];
  for (let k = win0; k <= win1 + 1e-9; k += 0.01) {
    const p = pointAt(profile, k);
    const [wx, wy, wz] = toWorld(p.x, p.y, p.h);
    samples.push({ k, x: wx, y: wy, z: wz, lx: p.dy, lz: -p.dx, dx: p.dx, dz: p.dy, tunnel: p.tunnel });
  }
  /** 세계 점(x, z)에서 가장 가까운 선로 자리(km, 높이, 옆 방향) */
  const nearTrack = (x, z) => {
    let best = null;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      const px = a.x + t * dx;
      const pz = a.z + t * dz;
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, k: a.k + (b.k - a.k) * t, y: a.y + (b.y - a.y) * t, cx: px, cz: pz, lx: a.lx, lz: a.lz };
    }
    return best;
  };
  /** 기차 선로(가운데에서 TRACK_SIDE 왼편)에서 본 옆 거리(+ = 왼편) */
  const lateralOf = (x, z) => {
    const n = nearTrack(x, z);
    return { lat: (x - n.cx) * n.lx + (z - n.cz) * n.lz - TRACK_SIDE, k: n.k, y: n.y };
  };
  const trainLine = samples.map((s) => [s.x + s.lx * TRACK_SIDE, s.z + s.lz * TRACK_SIDE]);
  const groundAt = (x, z) => meshHeight(x / 1000 + origin[0], z / 1000 + origin[1]);
  // 역 자리: 선로 길(rail.json)은 역에서 가장 가까운 선로 꼭짓점에서 시작해 역에서 수백 m 떨어질 수 있다.
  // 실제 역 자리(OSM 역 노드)에서 가장 가까운 선로 점을 역 지점으로 다시 잡는다.
  const stationGrid = data?.origin ?? (railStationById.get(id) ? [railStationById.get(id).x, railStationById.get(id).y] : null);
  const kStation = stationGrid ? nearTrack((stationGrid[0] - origin[0]) * 1000, (stationGrid[1] - origin[1]) * 1000).k : centerKm;
  const underground = pointAt(profile, kStation).tunnel;

  /** 승강장 자료 → 고리(선으로 그린 승강장은 폭만큼 양쪽으로 부풀린다) */
  function platformRing(p) {
    if (p.area) return p.shape.length >= 3 ? p.shape : null;
    const w = (p.width ?? 4) / 2;
    const L = p.shape;
    if (L.length < 2) return null;
    const offset = (sgn) =>
      L.map((q, i) => {
        const a = L[Math.max(0, i - 1)];
        const b = L[Math.min(L.length - 1, i + 1)];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const len = Math.hypot(dx, dz) || 1;
        return [q[0] - (dz / len) * w * sgn, q[1] + (dx / len) * w * sgn];
      });
    return [...offset(1), ...offset(-1).reverse()];
  }
  // ── 실제 자료를 세계 좌표로: 역 원점 + 맞추기(우리 기차 선로와 가장 가까운 실제 선로가 겹치게) ──
  let shift = [0, 0];
  let debug = null;
  /** 기차가 서는 자리를 구간 끝점(centerKm)에서 얼마나 옮기는지(km): 실제 역 자리, 있으면 실제 승강장 가운데 */
  let stopShiftKm = 0;
  let realTracks = [];
  if (data) {
    const ox = (data.origin[0] - origin[0]) * 1000;
    const oz = (data.origin[1] - origin[1]) * 1000;
    const toW = ([x, y]) => [ox + x, oz + y];
    realTracks = data.tracks.map((t) => ({ ...t, line: t.line.map(toW) }));
    // 맞추기. 서는 열차는 승강장 옆 선로로 들어간다(본선이 가운데로 지나가는 역이 많다).
    // 실제 승강장과 그 끝을 따라 지나는 실제 선로를 한 쌍으로 찾고, 우리 기차 선로에 가장 가까운 쌍의 선로가
    // 우리 기차 선로에 겹치도록 역 자료 전체를 옆으로 옮긴다. 쌍이 없으면 가장 가까운 선로를 겹친다.
    const s0 = samples.reduce((m, x) => (Math.abs(x.k - kStation) < Math.abs(m.k - kStation) ? x : m));
    const latUnit = [s0.lx, s0.lz];
    const trackInfo = realTracks.map((t) => {
      const ls = [];
      for (const q of t.line) {
        const l = lateralOf(...q);
        if (Math.abs(l.k - kStation) <= 0.45) ls.push(l.lat);
      }
      ls.sort((x, y) => x - y);
      return { t, lat: ls.length >= 2 ? ls[Math.floor(ls.length / 2)] : null, n: ls.length };
    }).filter((x) => x.lat !== null);
  
    let best = null;
    const dbgPlats = [];
    for (const p of data.platforms) {
      const ring = platformRing({ ...p, shape: p.shape.map(toW) });
      if (!ring) continue;
      const ls = ring.map(([x, z]) => lateralOf(x, z));
      const minL = Math.min(...ls.map((l) => l.lat));
      const maxL = Math.max(...ls.map((l) => l.lat));
      const ks = ls.map((l) => l.k);
      const kMin = Math.min(...ks);
      const kMax = Math.max(...ks);
      const kMid = (kMin + kMax) / 2;
      dbgPlats.push([+minL.toFixed(1), +maxL.toFixed(1), +(kMid - kStation).toFixed(3), +(kMax - kMin).toFixed(3)]);
      // 길이 80m 넘는 승강장, 역 자리에서 350m 안
      if (kMax - kMin < 0.08 || Math.abs(kMid - kStation) > 0.35) continue;
      for (const ti of trackInfo) {
        // 승강장이 선로의 왼편(+): 승강장 가까운 끝 = 선로 + 1.75m
        for (const side of [1, -1]) {
          const edge = side > 0 ? minL : maxL;
          const gap = side * (edge - ti.lat);
          if (gap < 0.8 || gap > 3.2) continue;
          const cost = Math.abs(ti.lat) + Math.abs(gap - 1.75) * 2 + Math.abs(kMid - kStation) * 20;
          if (!best || cost < best.cost) best = { cost, ti, side, kMid };
        }
      }
    }
    if (import.meta.env?.DEV) debug = { tracks: trackInfo.map((t) => +t.lat.toFixed(1)).sort((x, y) => x - y), platforms: dbgPlats, best: best ? [best.ti.lat, best.side] : null };
    if (best && Math.abs(best.ti.lat) < 40) {
      shift = [-latUnit[0] * best.ti.lat, -latUnit[1] * best.ti.lat];
      best.ti.t.ours = true;
      // 기차는 이 승강장 가운데에 선다
      stopShiftKm = best.kMid - centerKm;
    } else {
      const near = trainLine.filter((_, i) => Math.abs(samples[i].k - kStation) <= 0.15);
      let bestTrack = null;
      for (const t of realTracks) {
        let sum = 0;
        let n = 0;
        let vx = 0;
        let vz = 0;
        for (const p of near) {
          const q = nearestOnLine(p, t.line);
          if (q.d > 30) continue;
          sum += q.d;
          n += 1;
          vx += p[0] - q.p[0];
          vz += p[1] - q.p[1];
        }
        if (n < near.length * 0.5) continue;
        const mean = sum / n;
        if (!bestTrack || mean < bestTrack.mean) bestTrack = { t, mean, v: [vx / n, vz / n] };
      }
      if (bestTrack) {
        shift = bestTrack.v;
        bestTrack.t.ours = true;
      }
    }
    const sh = ([x, z]) => [x + shift[0], z + shift[1]];
    for (const t of realTracks) t.line = t.line.map(sh);
    data._world = {
      platforms: data.platforms.map((p) => ({ ...p, shape: p.shape.map(toW).map(sh) })),
      roofs: data.roofs.map((r) => ({ ...r, ring: r.ring.map(toW).map(sh) })),
      bridges: data.bridges.map((b) => ({ ...b, line: b.line.map(toW).map(sh) })),
      buildings: data.buildings.map((b) => ({ ...b, ring: b.ring.map(toW).map(sh), holes: (b.holes ?? []).map((h) => h.map(toW).map(sh)) })),
    };
  }
  const W = data?._world;
  const otherTracks = realTracks.filter((t) => !t.ours);
  // 기본 두 번째 선로를 숨기는지는 선로를 지을 때(train-3d.js) 이미 정했다
  const hidesSecondTrack = ctx.secondTrackHidden && !underground;

  const parts = new Parts(); // 꼭짓점 색(조명 받음)
  const glow = new Parts(); // 빛나는 것(등)
  /** 두 점 사이 상자(세계 x, z; 높이 y0~y1) */
  const beam = (a, b, y0, y1, w, color, into = parts) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) return;
    const g = new BoxGeometry(len, y1 - y0, w);
    g.rotateY(Math.atan2(-(b[1] - a[1]), b[0] - a[0]));
    g.translate((a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2);
    into.add(g, color);
  };
  /** 한 점에 선 상자(along: 방향 단위 [x, z]) */
  const block = ([x, z], along, y0, y1, l, w, color, into = parts) => {
    const g = new BoxGeometry(l, y1 - y0, w);
    g.rotateY(Math.atan2(-along[1], along[0]));
    g.translate(x, (y0 + y1) / 2, z);
    into.add(g, color);
  };
  /** 다각형 판(위·아래 면과 옆) 높이는 점마다 y(x, z) + 더하기 */
  const slab = (ring, yOf, bottom, top, color, into = parts) => {
    const r = signedArea(ring) < 0 ? [...ring].reverse() : ring;
    const contour = r.map(([x, z]) => new Vector2(x, z));
    const tris = ShapeUtils.triangulateShape(contour, []);
    const pos = [];
    for (const [i, j, k] of tris) {
      for (const idx of [i, k, j]) {
        const [x, z] = r[idx];
        pos.push(x, yOf(x, z) + top, z);
      }
    }
    for (const [i, j, k] of tris) {
      for (const idx of [i, j, k]) {
        const [x, z] = r[idx];
        pos.push(x, yOf(x, z) + bottom, z);
      }
    }
    for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i];
      const [bx, bz] = r[(i + 1) % r.length];
      const ya = yOf(ax, az);
      const yb = yOf(bx, bz);
      pos.push(ax, ya + bottom, az, bx, yb + bottom, bz, bx, yb + top, bz, ax, ya + bottom, az, bx, yb + top, bz, ax, ya + top, az);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.computeVertexNormals();
    into.add(g, color);
  };
  const trackY = (x, z) => nearTrack(x, z).y;

  // ── 지하역: 큰 방(벽, 천장, 등)과 양쪽 승강장 ──
  const stopCenterU = kStation;
  if (underground) {
    const half = trainLenKm / 2 + 0.03;
    const left = [];
    const right = [];
    for (const s of samples) {
      if (Math.abs(s.k - stopCenterU) > half) continue;
      left.push([s.x + s.lx * (TRACK_SIDE + 9), s.z + s.lz * (TRACK_SIDE + 9), s.y]);
      right.push([s.x - s.lx * (TRACK_SIDE + 9), s.z - s.lz * (TRACK_SIDE + 9), s.y]);
    }
    for (const side of [left, right]) for (let i = 1; i < side.length; i++) beam(side[i - 1], side[i], side[i][2] - 1, side[i][2] + 7.5, 0.4, '#e6e2d8');
    for (let i = 1; i < left.length; i++) {
      const a = [(left[i - 1][0] + right[i - 1][0]) / 2, (left[i - 1][1] + right[i - 1][1]) / 2];
      const b = [(left[i][0] + right[i][0]) / 2, (left[i][1] + right[i][1]) / 2];
      beam(a, b, left[i][2] + 7.5, left[i][2] + 7.8, (TRACK_SIDE + 9) * 2, '#d4d0c6');
      for (const off of [-6, 0, 6]) {
        const ax = a[0] + samples[0].lx * off;
        const az = a[1] + samples[0].lz * off;
        beam([ax, az], [b[0] + samples[0].lx * off, b[1] + samples[0].lz * off], left[i][2] + 7.42, left[i][2] + 7.48, 0.5, '#fffaf0', glow);
      }
    }
  }

  // ── 역 안 선로(우리 두 선로가 아닌 실제 선로) ──
  if (!underground) {
    for (const t of otherTracks) {
      // 우리 기차 선로와 겹치는 토막은 건너뛴다
      const pts = t.line.filter((p) => nearestOnLine(p, trainLine).d > 2.6);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 60) continue;
        const ya = trackY(...a);
        const yb = trackY(...b);
        const y = Math.min(ya, yb);
        beam(a, b, y - 0.4, y + 0.15, 3.2, '#857c70');
        const nx = -(b[1] - a[1]);
        const nz = b[0] - a[0];
        const nl = Math.hypot(nx, nz) || 1;
        for (const g of [-0.72, 0.72]) {
          const o = [(nx / nl) * g, (nz / nl) * g];
          beam([a[0] + o[0], a[1] + o[1]], [b[0] + o[0], b[1] + o[1]], y + 0.3, y + 0.45, 0.1, '#55504a');
        }
      }
    }
  }

  // ── 승강장 ──
  if (!stopShiftKm) stopShiftKm = kStation - centerKm;
  // 붙인 선로 안에서만(앞 1.2km, 뒤 0.6km): 기차 앞뒤가 선로 끝을 넘지 않게
  stopShiftKm = Math.max(win0 + trainLenKm / 2 + 0.02 - centerKm, Math.min(win1 - trainLenKm / 2 - 0.12 - centerKm, stopShiftKm));
  const stopCenter = centerKm + stopShiftKm;
  const stopRange = [stopCenter - trainLenKm / 2, stopCenter + trainLenKm / 2];
  let stop = null;
  const platformRings = [];
  if (W) {
    for (const p of W.platforms) {
      const ring = platformRing(p);
      if (!ring) continue;
      // 둘레를 5m마다 촘촘히 잰다(꼭짓점 사이가 멀면 굽은 선로에서 승강장 끝이 몇 m 벌어진다)
      const dense = [];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
        for (let j = 0; j < n; j++) dense.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]);
      }
      const lats = dense.map(([x, z]) => lateralOf(x, z));
      const minL = Math.min(...lats.map((l) => l.lat));
      const maxL = Math.max(...lats.map((l) => l.lat));
      const ks = lats.map((l) => l.k);
      const overlap = Math.max(0, Math.min(Math.max(...ks), stopRange[1]) - Math.max(Math.min(...ks), stopRange[0]));
      platformRings.push({ ring, minL, maxL, overlap, covered: p.covered, lats });
    }
    // 기차 바로 옆 승강장(가장 가까운 끝이 1~4m)을 고른다. 기차와 겹치는 승강장은 뺀다.
    const candidates = platformRings.filter((p) => p.overlap > 0.03 && ((p.minL > 0.9 && p.minL < 4) || (p.maxL < -0.9 && p.maxL > -4)));
    candidates.sort((a, b) => b.overlap - a.overlap || Math.min(Math.abs(a.minL), Math.abs(a.maxL)) - Math.min(Math.abs(b.minL), Math.abs(b.maxL)));
    const chosen = candidates[0] ?? null;
    if (chosen) {
      const side = chosen.minL > 0 ? 1 : -1;
      const nearEdge = side > 0 ? chosen.minL : -chosen.maxL;
      // 승강장 끝을 기차 옆 1.75m에 맞춘다(자료와 선로 모양의 작은 어긋남을 메운다)
      const move = side * (1.75 - nearEdge);
      const c = nearTrack(...chosen.ring[0]);
      chosen.ring = chosen.ring.map(([x, z]) => [x + c.lx * move, z + c.lz * move]);
      chosen.minL += move;
      chosen.maxL += move;
      // 자리마다 승강장 끝(기차 선로에서, km 10m 칸마다 가장 가까운 끝): 주인공과 카메라를 그 자리 끝에서 안쪽에 세운다
      const edges = new Map();
      for (const l of chosen.lats) {
        const d = side * (l.lat + move);
        if (d <= 0) continue;
        const key = Math.round(l.k * 100);
        if (!edges.has(key) || d < edges.get(key)) edges.set(key, d);
      }
      const edgeAt = [...edges].sort((a, b) => a[0] - b[0]).map(([k, d]) => [k / 100, d]);
      stop = { side, edge: 1.75, width: Math.max(3, Math.min(12, chosen.maxL - chosen.minL)), edgeAt };
    }
    for (const p of platformRings) {
      if (p !== chosen && p.minL < 1.6 && p.maxL > -1.6) p.drop = true; // 기차와 겹친다
      // 두 번째 기본 선로를 숨기지 않으면 그 선로와 겹치는 것도 뺀다
      if (!hidesSecondTrack && p !== chosen && p.minL < -2 * TRACK_SIDE + 1.6 && p.maxL > -2 * TRACK_SIDE - 1.6) p.drop = true;
    }
  }
  const tracksForEdges = [trainLine, ...otherTracks.map((t) => t.line)];
  const drawPlatform = (ring) => {
    platformRingsDrawn.push(ring);
    slab(ring, trackY, -2, T, '#c9c4ba');
    // 선로 쪽 끝: 흰 줄과 노란 점자 블록
    const ccw = signedArea(ring) > 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 8) continue;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (!tracksForEdges.some((l) => nearestOnLine(mid, l).d < 3.2)) continue;
      // 안쪽 방향
      let nx = -(b[1] - a[1]) / len;
      let nz = (b[0] - a[0]) / len;
      if (!ccw) {
        nx = -nx;
        nz = -nz;
      }
      if (!insideRing([mid[0] + nx * 0.5, mid[1] + nz * 0.5], ring)) {
        nx = -nx;
        nz = -nz;
      }
      const y = trackY(...mid);
      const inset = (d) => [[a[0] + nx * d, a[1] + nz * d], [b[0] + nx * d, b[1] + nz * d]];
      const [w0, w1] = inset(0.08);
      beam(w0, w1, y + T, y + T + 0.02, 0.16, '#f4f4f0');
      const [t0, t1] = inset(0.85);
      beam(t0, t1, y + T, y + T + 0.03, 0.32, '#f2c230');
    }
  };
  const platformRingsDrawn = [];
  if (!underground) for (const p of platformRings) if (!p.drop) drawPlatform(p.ring);

  // 기차 옆 승강장이 없으면 만든 승강장(가는 쪽 왼편)을 놓는다
  if (!stop) {
    const width = 4.5;
    const edge = 2.15;
    const ring = [];
    const left = [];
    const right = [];
    for (const s of samples) {
      if (s.k < stopRange[0] - 0.015 || s.k > stopRange[1] + 0.015) continue;
      const b = TRACK_SIDE + edge;
      left.push([s.x + s.lx * b, s.z + s.lz * b]);
      right.push([s.x + s.lx * (b + width), s.z + s.lz * (b + width)]);
    }
    ring.push(...left, ...right.reverse());
    if (ring.length >= 4) drawPlatform(ring);
    // 맞은편(오른편)에도 승강장이 있다고 본다(기본 두 번째 선로 옆)
    if (!hidesSecondTrack && !underground) {
      const ring2 = [];
      const l2 = [];
      const r2 = [];
      for (const s of samples) {
        if (s.k < stopRange[0] - 0.015 || s.k > stopRange[1] + 0.015) continue;
        const b = -(TRACK_SIDE + edge);
        l2.push([s.x + s.lx * b, s.z + s.lz * b]);
        r2.push([s.x + s.lx * (b - width), s.z + s.lz * (b - width)]);
      }
      ring2.push(...l2, ...r2.reverse());
      if (ring2.length >= 4) drawPlatform(ring2);
    }
    stop = { side: 1, edge, width };
  }

  // ── 승강장 지붕 ──
  const crossesTrain = (ring) => trainLine.some((p) => insideRing(p, ring));
  let roofed = false;
  const columnsUnder = (ring, y0, y1) => {
    const o = orientedBox(ring);
    if (!o) return;
    for (let u = -o.A + 3; u <= o.A - 3; u += 10) {
      const p = boxPoint(o, u, 0);
      if (!platformRingsDrawn.some((r) => insideRing(p, r))) continue;
      const base = trackY(...p);
      block(p, [o.ux, o.uz], base + T, base + y0, 0.3, 0.3, '#5d6670');
    }
  };
  if (W && !underground) {
    for (const r of W.roofs) {
      const over = crossesTrain(r.ring);
      const h = r.minHeight ?? (over ? 8.5 : 4.8);
      slab(r.ring, trackY, h, h + 0.35, over ? '#8d98a3' : '#7b8794');
      columnsUnder(r.ring, h, h + 0.35);
      if (platformRingsDrawn.some((pr) => pr.some((p) => insideRing(p, r.ring)))) roofed = true;
    }
  }
  // 넓은 지붕(동대구), 아치 지붕(오송, 천안아산): 승강장 전체를 덮는다
  if ((recipe.shed === 'wide' || recipe.shed === 'arch') && platformRingsDrawn.length && !underground) {
    const all = platformRingsDrawn.flat();
    const lats = all.map(([x, z]) => lateralOf(x, z).lat);
    const lo = Math.min(...lats, -2 * TRACK_SIDE - 2);
    const hi = Math.max(...lats, 2);
    const span = hi - lo;
    const midLat = (lo + hi) / 2;
    const L = trainLenKm * 1000 * 0.9;
    const ks = [];
    for (let u = -L / 2; u <= L / 2; u += 12) ks.push(stopCenter + u / 1000);
    for (let i = 1; i < ks.length; i++) {
      const pa = samples.reduce((b, s) => (Math.abs(s.k - ks[i - 1]) < Math.abs(b.k - ks[i - 1]) ? s : b));
      const pb = samples.reduce((b, s) => (Math.abs(s.k - ks[i]) < Math.abs(b.k - ks[i]) ? s : b));
      const off = TRACK_SIDE + midLat;
      const a = [pa.x + pa.lx * off, pa.z + pa.lz * off];
      const b = [pb.x + pb.lx * off, pb.z + pb.lz * off];
      if (recipe.shed === 'wide') beam(a, b, pa.y + 9, pa.y + 9.5, span + 4, '#6f7a85');
      else {
        // 아치: 가로 방향으로 휜 판 조각
        const n = 10;
        for (let j = 0; j < n; j++) {
          const t0 = j / n;
          const t1 = (j + 1) / n;
          const lat0 = -span / 2 - 2 + (span + 4) * t0;
          const lat1 = -span / 2 - 2 + (span + 4) * t1;
          const h0 = 10 + 7 * Math.sin(Math.PI * t0);
          const h1 = 10 + 7 * Math.sin(Math.PI * t1);
          const latC = (lat0 + lat1) / 2;
          const hC = (h0 + h1) / 2;
          const piece = [a[0] + pa.lx * latC, a[1] + pa.lz * latC];
          const piece2 = [b[0] + pb.lx * latC, b[1] + pb.lz * latC];
          const g = new BoxGeometry(Math.hypot(piece2[0] - piece[0], piece2[1] - piece[1]) + 0.1, 0.3, Math.hypot(lat1 - lat0, h1 - h0) + 0.05);
          g.rotateX(Math.atan2(h1 - h0, lat1 - lat0) * -1);
          g.rotateY(Math.atan2(-(piece2[1] - piece[1]), piece2[0] - piece[0]));
          g.translate((piece[0] + piece2[0]) / 2, pa.y + hC, (piece[1] + piece2[1]) / 2);
          parts.add(g, j % 2 ? '#9aa6b1' : '#a9b4bd');
        }
      }
    }
    roofed = true;
  }
  // 기차 옆 승강장 위에 지붕이 없으면 만든 지붕을 덮는다(실제 역은 대부분 승강장에 지붕이 있다)
  if (!roofed && !underground) {
    const off = stop.side * (stop.edge + stop.width / 2);
    for (let k = stopRange[0] + 0.01; k < stopRange[1] - 0.01; k += 0.012) {
      const a = samples.reduce((b, s) => (Math.abs(s.k - k) < Math.abs(b.k - k) ? s : b));
      const b = samples.reduce((bb, s) => (Math.abs(s.k - (k + 0.012)) < Math.abs(bb.k - (k + 0.012)) ? s : bb));
      const la = TRACK_SIDE + off;
      const pa = [a.x + a.lx * la, a.z + a.lz * la];
      const pb = [b.x + b.lx * la, b.z + b.lz * la];
      beam(pa, pb, a.y + 4.8, a.y + 5.15, stop.width + 1, '#7b8794');
      block(pa, [a.dx, a.dz], a.y + T, a.y + 4.8, 0.3, 0.3, '#5d6670');
      glow.add(new BoxGeometry(1.2, 0.06, 0.18).rotateY(Math.atan2(-a.dz, a.dx)).translate(pa[0], a.y + 4.72, pa[1]), '#fffbe8');
    }
  }

  // ── 건너는 다리 ──
  const BRIDGE_LOW = 8;
  const BRIDGE_HIGH = 11;
  let bridged = false;
  if (W && !underground) {
    for (const b of W.bridges) {
      const w = Math.max(3.5, b.width ?? 4);
      for (let i = 1; i < b.line.length; i++) {
        const a = b.line[i - 1];
        const c = b.line[i];
        const y = Math.max(trackY(...a), trackY(...c));
        beam(a, c, y + BRIDGE_LOW, y + BRIDGE_HIGH, w, '#d6d3cc');
        beam(a, c, y + BRIDGE_LOW + 1.2, y + BRIDGE_HIGH - 0.6, w + 0.06, '#2c3a4a');
      }
      // 승강장 위 계단 건물
      const done = new Set();
      for (let i = 1; i < b.line.length; i++) {
        const a = b.line[i - 1];
        const c = b.line[i];
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        for (let s = 0; s <= len; s += 1) {
          const p = [a[0] + ((c[0] - a[0]) * s) / len, a[1] + ((c[1] - a[1]) * s) / len];
          const r = platformRingsDrawn.findIndex((ring) => insideRing(p, ring));
          if (r < 0 || done.has(r)) continue;
          done.add(r);
          const y = trackY(...p);
          block(p, [(c[0] - a[0]) / len, (c[1] - a[1]) / len], y + T, y + BRIDGE_LOW, 4.2, 2.8, '#cfcac0');
        }
      }
      bridged = true;
    }
  }

  // ── 역 건물 ──
  const buildings = W?.buildings ?? [];
  const mainBuilding = buildings.reduce((m, b) => (!m || b.area > m.area ? b : m), null);
  const wallMeshers = new Map(); // 외벽 무늬마다
  const mesherFor = (style) => {
    if (!wallMeshers.has(style)) wallMeshers.set(style, new Mesher());
    return wallMeshers.get(style);
  };
  const colorOf = (hex) => new Color(hex);
  const signSpots = [];
  /** 대합실을 놓을 건물(가장 큰 역 건물): 둘러싼 직사각형, 바닥·지붕 높이, 출입구 쪽(vSide) */
  let hall = null;
  /** 선로 위에 걸친 건물의 선로에서 지붕까지 높이(없으면 0) */
  let overTop = 0;
  /** 그 건물이 기차 선로에서 왼편(+)으로 얼마나 뻗었는지(미터) */
  let overSpan = 0;
  const drawBuilding = (b) => {
    const isMain = b === mainBuilding;
    const look = isMain ? recipe : {};
    const ring = signedArea(b.ring) < 0 ? [...b.ring].reverse() : b.ring;
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const tr = nearTrack(cx, cz);
    // 선로 위에 걸친 건물(선상역사)인가
    const over = look.type === 'over' || trainLine.some((p) => insideRing(p, ring)) || otherTracks.some((t) => t.line.some((p) => insideRing(p, ring)));
    const ground = Math.min(tr.y, groundAt(cx, cz));
    // 고가역(선로가 높은 다리 위): 선로 아래 낮은 건물, 승강장 위는 지붕(recipe.shed)이 덮는다
    const elevated = look.type === 'elevated' && over;
    const levels = b.levels ?? look.levels ?? null;
    let base = over && !elevated ? tr.y + (b.minHeight ?? 7.5) : ground;
    let H = b.height !== null && b.height !== undefined ? b.height - (b.minHeight ?? 0) : levels ? levels * 4.2 : b.area > 8000 ? 18 : b.area > 3000 ? 14 : b.area > 1000 ? 10 : b.area > 300 ? 7 : 5;
    if (elevated) H = Math.max(4, tr.y - 1 - ground);
    else if (over) H = b.area > 9000 ? 4.5 : Math.min(H, levels ? levels * 4.2 : 9); // 아주 넓으면 승강장 위를 덮는 얇은 띠
    base = Math.max(base, ground);
    const small = b.area < 600 && !look.facade;
    const facade = look.facade ?? (small ? 'brick' : b.area > 2500 ? 'curtain' : 'band');
    const roofKind = look.roof ?? ({ gabled: 'gabled', hipped: 'hipped', round: 'curved', dome: 'curved', half_hipped: 'hipped' }[b.roof] ?? (small ? 'hipped' : 'flat'));
    const tint = look.tint ?? look.wall ?? b.colour ?? (facade === 'curtain' ? '#9fb1c0' : facade === 'brick' ? '#a9583e' : '#e9e5dc');
    const wallColor = colorOf(/^#|^[a-z]+$/i.test(tint) ? tint : '#e9e5dc');
    const m = mesherFor(facade === 'brick' ? 'brick' : facade);
    // 벽: 둘레를 따라 무늬 좌표(가로 3m, 세로 4m마다 한 칸)
    const rings = [ring, ...(b.holes ?? [])];
    for (const r of rings) {
      let run = 0;
      for (let i = 0; i < r.length; i++) {
        const [ax, az] = r[i];
        const [bx, bz] = r[(i + 1) % r.length];
        const len = Math.hypot(bx - ax, bz - az);
        const u0 = run / 3;
        const u1 = (run + len) / 3;
        run += len;
        m.quad([ax, base, az], [bx, base, bz], [bx, base + H, bz], [ax, base + H, az], wallColor, [[u0, 0], [u1, 0], [u1, H / 4], [u0, H / 4]]);
      }
    }
    // 선상역사: 밑면을 막고(아래에서 속이 보이지 않게) 선로 위로 얼마나 높은지 남긴다(밖에서 보기 카메라)
    if (over && !elevated) {
      slab(ring, () => base, -0.35, 0, '#c9c6bf');
      overTop = Math.max(overTop, base + H - tr.y);
      for (const [x, z] of ring) overSpan = Math.max(overSpan, lateralOf(x, z).lat);
    }
    // 선상역사 아래 기둥
    if (over) {
      const o = orientedBox(ring);
      if (o) {
        for (let u = -o.A + 2; u <= o.A - 2; u += 9) {
          for (const v of [-o.B + 1, o.B - 1]) {
            const p = boxPoint(o, u, v);
            if (nearestOnLine(p, trainLine).d < 2.6 || otherTracks.some((t) => nearestOnLine(p, t.line).d < 2.4)) continue;
            const y = trackY(...p);
            block(p, [o.ux, o.uz], y, base, 0.9, 0.9, '#bcb8b0');
          }
        }
      }
    }
    // 지붕
    const top = base + H;
    const o = orientedBox(ring);
    const roofColor = b.roofColour && /^#/.test(b.roofColour) ? b.roofColour : null;
    if (roofKind === 'flat' || !o || (o.fill < 0.8 && roofKind !== 'wave')) {
      slab(ring, () => top, 0, 0.3, roofColor ?? '#8f969c');
      // 난간(지붕 둘레 낮은 벽)
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const c = ring[(i + 1) % ring.length];
        beam(a, c, top, top + 0.9, 0.25, '#d7d4cc');
      }
      // 지붕 위 기계(냉방기)
      if (o && o.A > 8) for (const u of [-o.A * 0.4, o.A * 0.3]) block(boxPoint(o, u, o.B * 0.2), [o.ux, o.uz], top + 0.3, top + 1.8, Math.min(6, o.A * 0.3), Math.min(4, o.B * 0.5), '#a7adb2');
    } else if (roofKind === 'curved' || roofKind === 'shell') {
      // 짧은 축으로 휜 원통 지붕(shell: 한쪽 끝이 땅으로 휘어 내려온다)
      const rise = Math.min(9, o.B * 0.4);
      const n = 12;
      const ends = roofKind === 'shell' ? [-o.A - 1, o.A + 1] : [-o.A - 1.5, o.A + 1.5];
      for (let j = 0; j < n; j++) {
        const t0 = -Math.PI / 2 + (Math.PI * j) / n;
        const t1 = -Math.PI / 2 + (Math.PI * (j + 1)) / n;
        const v0 = (o.B + 1.5) * Math.sin(t0);
        const v1 = (o.B + 1.5) * Math.sin(t1);
        const y0 = top + rise * Math.cos(t0);
        const y1 = top + rise * Math.cos(t1);
        const g = new BoxGeometry(ends[1] - ends[0], 0.35, Math.hypot(v1 - v0, y1 - y0) + 0.05);
        g.rotateX(-Math.atan2(y1 - y0, v1 - v0));
        g.translate(0, (y0 + y1) / 2, (v0 + v1) / 2);
        g.rotateY(Math.atan2(-o.uz, o.ux));
        g.translate(o.cx, 0, o.cz);
        parts.add(g, roofColor ?? '#c3c9ce');
      }
      if (roofKind === 'shell') {
        // 앞 끝(긴 축 +쪽)이 땅까지 휘어 내려오는 곡면
        const m2 = 10;
        for (let j = 0; j < m2; j++) {
          const a0 = (Math.PI / 2) * (j / m2);
          const a1 = (Math.PI / 2) * ((j + 1) / m2);
          const R = top + rise - base;
          const u0 = o.A + 1 + R * 0.5 * Math.sin(a0);
          const u1 = o.A + 1 + R * 0.5 * Math.sin(a1);
          const y0 = base + R * Math.cos(a0);
          const y1 = base + R * Math.cos(a1);
          const g = new BoxGeometry(Math.hypot(u1 - u0, y1 - y0) + 0.05, 0.35, (o.B + 1.5) * 2);
          g.rotateZ(Math.atan2(y1 - y0, u1 - u0));
          g.translate((u0 + u1) / 2, (y0 + y1) / 2, 0);
          g.rotateY(Math.atan2(-o.uz, o.ux));
          g.translate(o.cx, 0, o.cz);
          parts.add(g, roofColor ?? '#c3c9ce');
        }
      }
    } else if (roofKind === 'wave') {
      // 평지붕 + 앞 처마가 물결처럼 들려 올라간다
      slab(ring, () => top, 0, 0.3, roofColor ?? '#e9ecee');
      const n = 14;
      for (let j = 0; j < n; j++) {
        const u0 = -o.A - 2 + ((o.A * 2 + 4) * j) / n;
        const u1 = -o.A - 2 + ((o.A * 2 + 4) * (j + 1)) / n;
        const lift = (u) => 1.6 + 1.4 * Math.sin((u / (o.A + 2)) * Math.PI * 1.5);
        for (const side of [-1, 1]) {
          const p0 = boxPoint(o, u0, side * (o.B + 2.5));
          const p1 = boxPoint(o, u1, side * (o.B + 2.5));
          const q0 = boxPoint(o, u0, side * o.B);
          const g = new BoxGeometry(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + 0.05, 0.3, 2.6);
          g.rotateX(side * -Math.atan2(lift((u0 + u1) / 2), 2.5) * 0.5);
          g.rotateY(Math.atan2(-o.uz, o.ux));
          g.translate((p0[0] + p1[0] + q0[0] * 0) / 2, top + lift((u0 + u1) / 2) * 0.5, (p0[1] + p1[1]) / 2);
          parts.add(g, '#f1f3f4');
        }
      }
    } else {
      // 모임지붕·박공지붕·한옥 지붕: 둘러싼 직사각형 위에 처마를 내민다
      const E = roofKind === 'hanok' ? 2.2 : 1.6;
      const R = o.B * (roofKind === 'hanok' ? 0.62 : 0.5) + 0.5;
      const ridge = roofKind === 'gabled' ? o.A + E : Math.max(0, o.A - o.B * 0.7);
      const lift = roofKind === 'hanok' ? 0.9 : 0;
      const P = (u, v, y) => {
        const [x, z] = boxPoint(o, u, v);
        return [x, y, z];
      };
      const A = o.A + E;
      const B = o.B + E;
      const c1 = P(-A, -B, top + lift);
      const c2 = P(A, -B, top + lift);
      const c3 = P(A, B, top + lift);
      const c4 = P(-A, B, top + lift);
      const r1 = P(-ridge, 0, top + R);
      const r2 = P(ridge, 0, top + R);
      const tile = colorOf(roofColor ?? (roofKind === 'hanok' ? '#4a4f56' : '#5a5f66'));
      const rm = mesherFor('roof');
      const flat = [[0, 0], [1, 0], [1, 1], [0, 1]];
      // 처마 가운데는 조금 낮게(한옥 처마의 휜 선)
      const sag = roofKind === 'hanok' ? 0.45 : 0;
      const m1 = P(0, -B, top + lift - sag);
      const m3 = P(0, B, top + lift - sag);
      rm.quad(c1, m1, [ (r1[0] + r2[0]) / 2, top + R, (r1[2] + r2[2]) / 2 ], r1, tile, flat);
      rm.quad(m1, c2, r2, [ (r1[0] + r2[0]) / 2, top + R, (r1[2] + r2[2]) / 2 ], tile, flat);
      rm.quad(c3, m3, [ (r1[0] + r2[0]) / 2, top + R, (r1[2] + r2[2]) / 2 ], r2, tile, flat);
      rm.quad(m3, c4, r1, [ (r1[0] + r2[0]) / 2, top + R, (r1[2] + r2[2]) / 2 ], tile, flat);
      if (roofKind === 'gabled') {
        rm.quad(c4, c1, r1, r1, colorOf('#d8d2c6'), flat);
        rm.quad(c2, c3, r2, r2, colorOf('#d8d2c6'), flat);
      } else {
        rm.quad(c4, c1, r1, r1, tile, flat);
        rm.quad(c2, c3, r2, r2, tile, flat);
      }
      // 용마루
      const rr1 = [r1[0], r1[2]];
      const rr2 = [r2[0], r2[2]];
      if (ridge > 0.5) beam(rr1, rr2, top + R - 0.15, top + R + 0.35, 0.6, roofKind === 'hanok' ? '#d9d6cf' : '#6a7077');
      // 처마 밑을 받치는 기둥(한옥, 기둥 줄)
      if (roofKind === 'hanok' || look.colonnade) {
        for (let u = -o.A; u <= o.A + 0.1; u += Math.max(3, (o.A * 2) / Math.max(1, Math.round((o.A * 2) / 3.5)))) {
          for (const v of [-(o.B + E * 0.55), o.B + E * 0.55]) block(boxPoint(o, u, v), [o.ux, o.uz], base, top + lift * 0.5, 0.45, 0.45, '#6b4a32');
        }
      }
    }
    // 역 이름판: 선로에서 먼 긴 변(앞 출입구 쪽) 위
    if (isMain && o) {
      const vSide = (() => {
        const p1 = boxPoint(o, 0, o.B);
        const p2 = boxPoint(o, 0, -o.B);
        return nearestOnLine(p1, trainLine).d > nearestOnLine(p2, trainLine).d ? 1 : -1;
      })();
      signSpots.push({ o, vSide, top, base, roofKind, over });
      hall = { o, base, top, vSide, over };
      // 앞 출입구 차양(부산, 울산)
      if (look.frontCanopy) {
        for (let u = -o.A * 0.35; u < o.A * 0.35; u += 6) {
          const a = boxPoint(o, u, vSide * (o.B + 0.5));
          const c = boxPoint(o, u + 6, vSide * (o.B + 0.5));
          const a2 = boxPoint(o, u + 3, vSide * (o.B + 9));
          beam(a, c, base + 6, base + 6.5, 17, '#c9ced3');
          block(a2, [o.ux, o.uz], base, base + 6, 0.5, 0.5, '#9aa1a8');
        }
      } else if (!over) {
        // 기본 출입구 차양과 문
        const a = boxPoint(o, -Math.min(8, o.A * 0.4), vSide * (o.B + 2));
        const c = boxPoint(o, Math.min(8, o.A * 0.4), vSide * (o.B + 2));
        beam(a, c, base + 3.4, base + 3.8, 4, '#7b8794');
      }
    }
  };
  if (!underground) for (const b of buildings) if (b.area >= 25) drawBuilding(b);

  // 자료에 역 건물이 없으면 만든 역 건물(가는 쪽 오른편)과 건너는 다리
  if (!buildings.length && !underground) {
    const s = samples.reduce((b, x) => (Math.abs(x.k - stopCenter) < Math.abs(b.k - stopCenter) ? x : b));
    const houseOff = -(TRACK_SIDE + 30) * stop.side; // 승강장 반대편
    const hx = s.x + s.lx * (houseOff - TRACK_SIDE * 0); // 가운데 선에서
    const hz = s.z + s.lz * houseOff;
    const base = Math.min(s.y, groundAt(hx, hz));
    const tall = Math.max(10, BRIDGE_HIGH + 1.5 - (base - s.y));
    const o = { cx: hx, cz: hz, ux: s.dx, uz: s.dz, A: 24, B: 8, fill: 1 };
    const ring = [boxPoint(o, -24, -8), boxPoint(o, 24, -8), boxPoint(o, 24, 8), boxPoint(o, -24, 8)];
    drawBuildingRing(ring, base, tall);
    signSpots.push({ o: { ...o }, vSide: houseOff < 0 ? 1 : -1, top: base + tall, base, roofKind: 'flat', over: false, made: true });
    hall = { o: { ...o }, base, top: base + tall, vSide: houseOff < 0 ? 1 : -1, over: false };
    if (!bridged) {
      // 건너는 다리: 기차 옆 승강장에서 역 건물까지
      const from = TRACK_SIDE + stop.side * (stop.edge + stop.width / 2);
      const a = [s.x + s.lx * from, s.z + s.lz * from];
      const c = [hx, hz];
      beam(a, c, s.y + BRIDGE_LOW, s.y + BRIDGE_HIGH, 7, '#d6d3cc');
      beam(a, c, s.y + BRIDGE_LOW + 1.2, s.y + BRIDGE_HIGH - 0.6, 7.06, '#2c3a4a');
      block(a, [s.dx, s.dz], s.y + T, s.y + BRIDGE_LOW, 4.2, 2.6, '#cfcac0');
    }
  }
  function drawBuildingRing(ring, base, H) {
    const m = mesherFor('band');
    const c = colorOf('#e9e5dc');
    let run = 0;
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % ring.length];
      const len = Math.hypot(bx - ax, bz - az);
      m.quad([ax, base, az], [bx, base, bz], [bx, base + H, bz], [ax, base + H, az], c, [[run / 3, 0], [(run + len) / 3, 0], [(run + len) / 3, H / 4], [run / 3, H / 4]]);
      run += len;
    }
    slab(ring, () => base + H, 0, 0.4, accent);
  }

  // ── 이름판 ──
  const tex = boardTexture(name, accent);
  const signMat = new MeshBasicMaterial({ map: tex });
  for (const sp of signSpots) {
    const { o, vSide, top, base } = sp;
    const len = Math.min(18, Math.max(8, o.A * 0.6));
    const geo = new PlaneGeometry(len, len / 4);
    const front = boxPoint(o, 0, vSide * (o.B + 0.12));
    const facing = Math.atan2(vSide * -o.uz, vSide * o.ux); // 바깥(앞)을 본다
    const y = recipe.bigSign && !sp.made ? base + 13 : sp.roofKind === 'flat' ? top - len / 8 - 0.6 : base + Math.min(6, (top - base) * 0.6);
    for (const turn of [0, Math.PI]) {
      const s = new Mesh(geo, signMat);
      s.position.set(front[0] + (turn ? -1 : 1) * vSide * -o.uz * 0.02, y, front[1] + (turn ? -1 : 1) * vSide * o.ux * 0.02);
      s.rotation.y = facing + turn;
      group.add(s);
    }
    if (recipe.bigSign && !sp.made) {
      // 큰 간판을 받치는 철골
      for (const u of [-len / 2 + 0.5, len / 2 - 0.5]) block(boxPoint(o, u, vSide * (o.B + 0.3)), [o.ux, o.uz], top, y + len / 8, 0.3, 0.3, '#7d858c');
    }
    if (recipe.roundSign && !sp.made) {
      const disc = new Mesh(new PlaneGeometry(4, 4), new MeshBasicMaterial({ map: boardTexture(name, '#2d5aa8', { bg: '#2d5aa8', fg: '#ffffff', width: 256, height: 256 }), side: DoubleSide }));
      const corner = boxPoint(o, o.A - 3, vSide * (o.B + 0.15));
      disc.position.set(corner[0], top + 2.4, corner[1]);
      disc.rotation.y = facing;
      group.add(disc);
    }
  }
  // 승강장 이름판(지붕 아래, 40m마다, 앞뒤 두 장)
  const boardGeo = new PlaneGeometry(3.6, 0.9);
  for (const ring of platformRingsDrawn) {
    const o = orientedBox(ring);
    if (!o || o.A < 20) continue;
    for (let u = -o.A + 15; u <= o.A - 15; u += 40) {
      const p = boxPoint(o, u, 0);
      const y = trackY(...p);
      for (const turn of [0, Math.PI]) {
        const bm = new Mesh(boardGeo, signMat);
        bm.position.set(p[0], y + 3.6, p[1]);
        bm.rotation.y = Math.atan2(-o.uz, o.ux) + turn;
        group.add(bm);
      }
    }
  }

  // ── 모아서 그물로 ──
  group.add(new Mesh(parts.geometry(), materials.car), new Mesh(glow.geometry(), materials.glowV));
  for (const [style, m] of wallMeshers) {
    if (!m.pos.length) continue;
    const mat =
      style === 'roof'
        ? materials.carDouble
        : textures.get(style) ??
          (() => {
            const t = new MeshLambertMaterial({ map: facadeTexture(style), vertexColors: true, side: DoubleSide });
            textures.set(style, t);
            return t;
          })();
    group.add(new Mesh(m.geometry(), mat));
  }
  return { group, stop, stopShiftKm, hidesSecondTrack, underground, hall, debug, overTop, overSpan };
}
