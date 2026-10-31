// 걸어서 여행하기의 동네 지도(캔버스). 캐릭터가 늘 가운데 있고 지도가 따라 움직인다.
// 바탕은 격자 지형(1km 칸), 길은 OpenStreetMap 차도, 건물·나무·논밭은 칸의 인구와 지형으로 어림해 그린다(4단계 거리 꾸미기).
// 건물 자리와 크기는 칸 번호로 늘 같게 정한다(실제 건물 자리가 아니다).
import { indexRoads, nearestRoad } from '../sim/roads.js';

/** 지형 바탕색 */
const GROUND = {
  flat: '#EEE9DC',
  hill: '#E2E8CF',
  mountain: '#C9DBB5',
  field: '#E7EDC8',
  river: '#9CCBE8',
  sea: '#86BCE0',
};
/** 도로 종류별 너비(m)와 색 */
const ROAD_STYLE = {
  1: { width: 26, fill: '#F7D58B', edge: '#C9A25A' },
  2: { width: 20, fill: '#FFFFFF', edge: '#A9AEB3' },
  3: { width: 15, fill: '#FFFFFF', edge: '#B8BDC2' },
  4: { width: 11, fill: '#FFFFFF', edge: '#C4C8CC' },
  5: { width: 7, fill: '#FBFAF6', edge: '#D3D6D9' },
};
/** 멀리서 볼 때(1km가 몇 픽셀보다 작을 때) 그리지 않는 작은 길: 종류 → 이 축척보다 크면 그린다 */
const ROAD_MIN_SCALE = { 1: 0, 2: 0, 3: 40, 4: 90, 5: 220 };
/** 가장 멀리 볼 때와 가장 가까이 볼 때(1km가 몇 픽셀) */
export const MIN_SCALE = 5;
export const MAX_SCALE = 2200;

/** 칸 번호로 늘 같은 0~1 수 */
function hash01(a, b, c) {
  let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791);
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{grid: object, roads: object, roadIndex: Map<string, number[]>, stations: object[], railStations: object[],
 *   railLines: object[], busStopsNear: (cell: number) => object[], lineColor: (line: string) => string, lineName: (line: string) => string}} world
 */
export function createWalkMap(canvas, world) {
  const ctx = canvas.getContext('2d');
  const buildingCache = new Map();
  let scale = 700; // 1km를 몇 픽셀로
  // 멀리서 볼 때는 큰길만 담은 목록을 쓴다(그릴 토막 수를 줄인다)
  let majorIndex = null;
  const indexFor = () => {
    if (scale >= 90) return world.roadIndex;
    if (!majorIndex) majorIndex = indexRoads(world.roads, (edge) => edge.cls <= 3);
    return majorIndex;
  };

  /** 한 칸의 건물·나무(한 번만 만들어 둔다). 길 위에는 두지 않는다. */
  function decorations(col, row) {
    const key = `${col},${row}`;
    if (buildingCache.has(key)) return buildingCache.get(key);
    const terrain = world.grid.terrain[row]?.[col];
    const people = world.grid.population[row]?.[col] ?? 0;
    const items = [];
    if (terrain === 'flat' || terrain === 'hill' || terrain === 'field') {
      // 사람이 많을수록 건물이 많고 높다(어림)
      const count = Math.min(220, Math.round(people / 90));
      const tall = Math.min(1, people / 25000);
      // 길 위에는 두지 않는다. 건물 가운데에서 길까지 건물 반 너비와 길 반 너비만큼은 떨어지게 한다.
      // 길이 촘촘한 동네에서도 빈 블록을 고르게 찾도록, 칸을 40m 눈금(25×25)으로 나눠 섞은 차례로 본다.
      const isMajor = (edge) => edge.cls <= 4;
      const isMinor = (edge) => edge.cls === 5;
      let placed = 0;
      for (let k = 0; k < 625 && placed < count; k++) {
        const i = (k * 389 + col * 7 + row * 13) % 625;
        const size = 0.016 + hash01(col, row, i * 3 + 2) * 0.022;
        const h = size * (0.7 + hash01(i, col, row) * 0.6);
        const x = col + ((i % 25) + 0.15 + hash01(col, row, i * 3) * 0.3) / 25;
        const y = row + (Math.floor(i / 25) + 0.15 + hash01(col, row, i * 3 + 1) * 0.3) / 25;
        const center = { x: x + size / 2, y: y + h / 2 };
        const half = Math.max(size, h) * 0.6;
        if (nearestRoad(world.roads, world.roadIndex, center, half + 0.012, isMajor)) continue;
        if (nearestRoad(world.roads, world.roadIndex, center, half + 0.005, isMinor)) continue;
        const floors = 1 + Math.round(hash01(row, col, i) * (2 + tall * 18));
        const palette = ['#D9D2C3', '#C9CED6', '#E3D7C6', '#BFC7CF', '#D7CDBB', '#CDD6D0'];
        items.push({ kind: 'building', x, y, w: size, h, floors, color: palette[i % palette.length] });
        placed += 1;
      }
      // 사람이 적은 들판에는 논밭과 나무
      if (people < 1500) {
        for (let i = 0; i < 6; i++) {
          const x = col + hash01(col, row, 500 + i) * 0.9;
          const y = row + hash01(col, row, 600 + i) * 0.9;
          if (!nearestRoad(world.roads, world.roadIndex, { x: x + 0.05, y: y + 0.05 }, 0.06)) items.push({ kind: 'paddy', x, y, w: 0.1, h: 0.08 });
        }
      }
    }
    const trees = terrain === 'mountain' ? 40 : terrain === 'hill' ? 14 : people < 4000 ? 6 : 2;
    for (let i = 0; i < trees; i++) {
      const x = col + hash01(col, row, 900 + i) * 1;
      const y = row + hash01(col, row, 1000 + i) * 1;
      if (terrain === 'river' || terrain === 'sea') break;
      if (nearestRoad(world.roads, world.roadIndex, { x, y }, 0.02)) continue;
      items.push({ kind: 'tree', x, y, r: 0.012 + hash01(i, row, col) * 0.012 });
    }
    // 아래쪽 것을 나중에 그려 앞에 보이게 한다
    items.sort((a, b) => a.y - b.y);
    buildingCache.set(key, items);
    return items;
  }

  /**
   * 그리기.
   * @param {{x: number, y: number}} center 화면 가운데(캐릭터 자리)
   * @param {{me?: {x: number, y: number, facing: number, step: number}, taxi?: {x: number, y: number, angle: number}|null,
   *   route?: Array<[number, number]>|null, target?: {x: number, y: number}|null, highlight?: Set<string>}} extra
   */
  function draw(center, extra = {}) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = (x) => w / 2 + (x - center.x) * scale;
    const sy = (y) => h / 2 + (y - center.y) * scale;
    const left = center.x - w / 2 / scale;
    const top = center.y - h / 2 / scale;
    const right = center.x + w / 2 / scale;
    const bottom = center.y + h / 2 / scale;
    const c0 = Math.floor(left);
    const c1 = Math.floor(right);
    const r0 = Math.floor(top);
    const r1 = Math.floor(bottom);

    // 1. 바탕(지형)
    ctx.fillStyle = '#86BCE0';
    ctx.fillRect(0, 0, w, h);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const terrain = world.grid.terrain[row]?.[col] ?? 'sea';
        ctx.fillStyle = GROUND[terrain] ?? GROUND.flat;
        ctx.fillRect(Math.floor(sx(col)), Math.floor(sy(row)), Math.ceil(scale) + 1, Math.ceil(scale) + 1);
        if ((terrain === 'sea' || terrain === 'river') && scale >= 200) {
          // 물결
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 1.5;
          for (let i = 0; i < 10; i++) {
            const x = col + hash01(col, row, i) * 0.9;
            const y = row + hash01(row, col, i) * 0.95;
            ctx.beginPath();
            ctx.arc(sx(x), sy(y), 0.02 * scale, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
          }
        }
      }
    }
    // 2. 논밭(길 아래)
    const decor = [];
    if (scale >= 300) for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) decor.push(...decorations(col, row));
    for (const d of decor) {
      if (d.kind !== 'paddy') continue;
      ctx.fillStyle = '#CFE0A0';
      ctx.fillRect(sx(d.x), sy(d.y), d.w * scale, d.h * scale);
      ctx.strokeStyle = '#B7CC86';
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(sx(d.x), sy(d.y + (d.h * k) / 4));
        ctx.lineTo(sx(d.x + d.w), sy(d.y + (d.h * k) / 4));
        ctx.stroke();
      }
    }

    // 3. 기찻길
    ctx.lineCap = 'butt';
    for (const line of world.railLines) {
      for (const path of line.paths) {
        ctx.beginPath();
        path.forEach(([px, py], k) => (k ? ctx.lineTo(sx(px / 100), sy(py / 100)) : ctx.moveTo(sx(px / 100), sy(py / 100))));
        ctx.strokeStyle = '#555B61';
        ctx.lineWidth = Math.max(2, 0.008 * scale);
        ctx.stroke();
        ctx.setLineDash([Math.max(3, 0.012 * scale), Math.max(3, 0.012 * scale)]);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.max(1, 0.004 * scale);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 4. 차도(테두리 → 바탕 → 가운데 선)
    const seen = new Set();
    const visible = [];
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        for (const i of indexFor().get(`${col},${row}`) ?? []) {
          if (seen.has(i)) continue;
          seen.add(i);
          const edge = world.roads.edges[i];
          if (scale >= ROAD_MIN_SCALE[edge.cls]) visible.push(edge);
        }
      }
    }
    visible.sort((a, b) => b.cls - a.cls);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const stroke = (edge, width, color) => {
      ctx.beginPath();
      edge.pts.forEach(([px, py], k) => (k ? ctx.lineTo(sx(px), sy(py)) : ctx.moveTo(sx(px), sy(py))));
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    // 멀리서 볼 때는 테두리 없이 가는 선으로
    const far = scale < 120;
    if (!far) for (const edge of visible) stroke(edge, Math.max(3, (ROAD_STYLE[edge.cls].width / 1000) * scale + 3), ROAD_STYLE[edge.cls].edge);
    for (const edge of visible) stroke(edge, far ? (edge.cls <= 2 ? 2 : 1) : Math.max(2, (ROAD_STYLE[edge.cls].width / 1000) * scale), far ? (edge.cls === 1 ? '#D9A53F' : '#FFFFFF') : ROAD_STYLE[edge.cls].fill);
    if (scale >= 500) {
      ctx.setLineDash([8, 8]);
      for (const edge of visible) if (edge.cls <= 2) stroke(edge, 1.5, '#E3B341');
      ctx.setLineDash([]);
    }
    // 택시가 가는 길(노란 점선), 걸어갈 길(주황 점선)
    if (extra.route) {
      ctx.beginPath();
      extra.route.forEach(([px, py], k) => (k ? ctx.lineTo(sx(px), sy(py)) : ctx.moveTo(sx(px), sy(py))));
      ctx.strokeStyle = extra.routeKind === 'walk' ? 'rgba(232,89,12,0.8)' : 'rgba(224,168,0,0.85)';
      ctx.lineWidth = Math.max(5, 0.012 * scale);
      ctx.setLineDash([12, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 5. 건물과 나무(위에서 조금 비스듬히 본 모습: 높을수록 위로 솟는다)
    for (const d of decor) {
      if (d.kind === 'building') {
        const bx = sx(d.x);
        const by = sy(d.y);
        const bw = d.w * scale;
        const bh = d.h * scale;
        const lift = Math.min(60, d.floors * 0.003 * scale);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(bx + lift * 0.3, by + 2, bw, bh);
        ctx.fillStyle = shadeHex(d.color, 0.8);
        ctx.fillRect(bx, by - lift + bh, bw, lift);
        ctx.fillStyle = d.color;
        ctx.fillRect(bx, by - lift, bw, bh);
        ctx.strokeStyle = shadeHex(d.color, 0.65);
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by - lift, bw, bh + lift);
        // 창(층 줄)
        if (lift > 8) {
          ctx.fillStyle = 'rgba(80,110,140,0.35)';
          for (let y = by - lift + bh + 3; y < by + bh - 2; y += 5) ctx.fillRect(bx + 2, y, bw - 4, 1.5);
        }
      } else if (d.kind === 'tree') {
        const r = d.r * scale;
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.ellipse(sx(d.x) + r * 0.3, sy(d.y) + r * 0.6, r, r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5E9A57';
        ctx.beginPath();
        ctx.arc(sx(d.x), sy(d.y), r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7DB46F';
        ctx.beginPath();
        ctx.arc(sx(d.x) - r * 0.3, sy(d.y) - r * 0.3, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 6. 타는 곳: 버스 정류장, 지하철역, 기차역(그림과 글자를 함께)
    const font = (size, bold = true) => `${bold ? '700 ' : ''}${size}px system-ui, sans-serif`;
    const label = (text, x, y, color = '#1F2933') => {
      ctx.font = font(13);
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };
    if (scale >= 90 && scale < 350) {
      // 버스를 탈 수 있는 정류장(초록 점)
      ctx.fillStyle = '#2E8B3E';
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          for (const stop of world.busStopsNear(row * world.grid.cols + col)) {
            ctx.beginPath();
            ctx.arc(sx(stop.x), sy(stop.y), 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    if (scale >= 350) {
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          for (const stop of world.busStopsNear(row * world.grid.cols + col)) {
            const x = sx(stop.x);
            const y = sy(stop.y);
            ctx.fillStyle = '#2E8B3E';
            ctx.fillRect(x - 7, y - 16, 14, 12);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = font(9);
            ctx.textAlign = 'center';
            ctx.fillText('버', x, y - 7);
            ctx.fillStyle = '#555B61';
            ctx.fillRect(x - 1, y - 4, 2, 6);
            if (scale >= 900) label(stop.name, x, y + 14, '#1E5E2A');
          }
        }
      }
    }
    for (const s of world.railStations) {
      if (s.x < left - 0.2 || s.x > right + 0.2 || s.y < top - 0.2 || s.y > bottom + 0.2) continue;
      const x = sx(s.x);
      const y = sy(s.y);
      if (scale < 150) {
        ctx.fillStyle = '#3B3B3B';
        ctx.fillRect(x - 4, y - 4, 8, 8);
        if (scale >= 25) label(s.name, x, y - 8);
        continue;
      }
      ctx.fillStyle = '#3B3B3B';
      ctx.fillRect(x - 22, y - 12, 44, 22);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = font(12);
      ctx.textAlign = 'center';
      ctx.fillText('기차', x, y + 4);
      label(`${s.name}역`, x, y + 26);
    }
    for (const s of world.stations) {
      if (s.x < left - 0.2 || s.x > right + 0.2 || s.y < top - 0.2 || s.y > bottom + 0.2) continue;
      const x = sx(s.x);
      const y = sy(s.y);
      if (scale < 150) {
        if (scale < 40) continue;
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = world.lineColor(s.line);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = world.lineColor(s.line);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1F2933';
      ctx.font = font(11);
      ctx.textAlign = 'center';
      ctx.fillText(world.lineName(s.line), x, y + 4);
      label(`${s.name}역`, x, y + 28);
    }

    // 7. 걸어갈 곳 표시
    if (extra.target) {
      ctx.strokeStyle = '#D9480F';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx(extra.target.x), sy(extra.target.y), 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 8. 택시
    if (extra.taxi) drawTaxi(ctx, sx(extra.taxi.x), sy(extra.taxi.y), extra.taxi.angle);
    // 9. 나(캐릭터). 멀리서 볼 때는 작은 표시로
    if (extra.me) {
      if (scale >= 150) drawMe(ctx, sx(extra.me.x), sy(extra.me.y), extra.me.step, extra.me.facing);
      else {
        ctx.fillStyle = '#E8590C';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx(extra.me.x), sy(extra.me.y), 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    drawScaleBar(ctx, w, h, scale);
  }

  return {
    draw,
    get scale() {
      return scale;
    },
    setScale(next) {
      scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
    },
    /** 화면 점 → 격자 좌표 */
    toWorld(px, py, center) {
      return { x: center.x + (px - canvas.clientWidth / 2) / scale, y: center.y + (py - canvas.clientHeight / 2) / scale };
    },
  };
}

function shadeHex(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/** 나: 머리, 몸, 걷는 다리(step은 걸음 박자) */
function drawMe(ctx, x, y, step, facing) {
  const swing = Math.sin(step) * 5;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2F3A45';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 12);
  ctx.lineTo(x - 3 - swing, y);
  ctx.moveTo(x + 3, y - 12);
  ctx.lineTo(x + 3 + swing, y);
  ctx.stroke();
  ctx.fillStyle = '#E8590C';
  ctx.beginPath();
  ctx.roundRect?.(x - 8, y - 30, 16, 20, 5);
  if (!ctx.roundRect) ctx.rect(x - 8, y - 30, 16, 20);
  ctx.fill();
  // 가방
  ctx.fillStyle = '#1971C2';
  ctx.fillRect(x + (facing < 0 ? 4 : -10), y - 28, 6, 12);
  ctx.fillStyle = '#F1C6A4';
  ctx.beginPath();
  ctx.arc(x, y - 37, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3B2A20';
  ctx.beginPath();
  ctx.arc(x, y - 40, 8, Math.PI, Math.PI * 2);
  ctx.fill();
  // 내 자리 표시
  ctx.strokeStyle = '#E8590C';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y + 2, 18, 0, Math.PI * 2);
  ctx.stroke();
}

/** 택시: 노란 차, 지붕에 택시 표시 */
function drawTaxi(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-20, -9, 42, 22);
  ctx.fillStyle = '#F2B705';
  ctx.fillRect(-22, -11, 44, 22);
  ctx.fillStyle = '#2B3A4A';
  ctx.fillRect(4, -8, 10, 16);
  ctx.fillRect(-16, -8, 8, 16);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-5, -5, 8, 10);
  ctx.fillStyle = '#222';
  ctx.font = '700 7px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.save();
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('택시', 0, 2);
  ctx.restore();
  ctx.restore();
}

/** 축척 막대: 화면 아래 오른쪽에 "500m" 같은 막대(1, 2, 5 단위로 알맞은 길이를 고른다) */
function drawScaleBar(ctx, w, h, scale) {
  const steps = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
  const km = steps.find((v) => v * scale >= 70) ?? 50;
  const len = km * scale;
  const x1 = w - 16;
  const x0 = x1 - len;
  const y = h - 30;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(x0 - 8, y - 22, len + 16, 30);
  ctx.strokeStyle = '#1F2933';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0, y - 6);
  ctx.lineTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.lineTo(x1, y - 6);
  ctx.stroke();
  ctx.fillStyle = '#1F2933';
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(km >= 1 ? `${km}km` : `${Math.round(km * 1000)}m`, (x0 + x1) / 2, y - 9);
}
