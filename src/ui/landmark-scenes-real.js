// 사진을 보고 건물 모양과 색을 따라 새로 그린 장면(SVG). 사진 자체는 넣지 않는다. 근처에서 찾아본 사진은 data/SOURCES.md에 적었다.
// 빛과 그림자, 창문 줄, 나뭇잎 덩어리로 실제에 가깝게 그린다. landmark-scenes.js의 SCENES에 합쳐 쓴다.

const SVG_NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}
/** 늘 같은 0~1 수 */
const rnd = (i) => (((i * 2654435761) >>> 0) % 1000) / 1000;

let idCount = 0;
/** 그러데이션을 만들어 그 주소를 돌려준다. dir: 'down' 위에서 아래로, 'right' 왼쪽에서 오른쪽으로 */
function paint(g, stops, dir = 'down') {
  idCount += 1;
  const id = `lm-real-${idCount}`;
  const grad = el('linearGradient', { id, x1: 0, y1: 0, x2: dir === 'right' ? 1 : 0, y2: dir === 'right' ? 0 : 1 });
  stops.forEach((color, k) => grad.append(el('stop', { offset: k / (stops.length - 1), 'stop-color': color })));
  const defs = el('defs');
  defs.append(grad);
  g.append(defs);
  return `url(#${id})`;
}
function blur(g, amount) {
  idCount += 1;
  const id = `lm-real-${idCount}`;
  const filter = el('filter', { id, x: '-30%', y: '-30%', width: '160%', height: '160%' });
  filter.append(el('feGaussianBlur', { stdDeviation: amount }));
  const defs = el('defs');
  defs.append(filter);
  g.append(defs);
  return `url(#${id})`;
}

function skyAndClouds(g, colors, clouds) {
  g.append(el('rect', { x: 0, y: 0, width: 600, height: 320, fill: paint(g, colors) }));
  const soft = blur(g, 7);
  for (const [x, y, w, h, o = 0.85] of clouds) {
    g.append(el('ellipse', { cx: x, cy: y, rx: w, ry: h, fill: '#FFFFFF', opacity: o, filter: soft }));
    g.append(el('ellipse', { cx: x + w * 0.4, cy: y - h * 0.5, rx: w * 0.55, ry: h * 0.8, fill: '#FFFFFF', opacity: o, filter: soft }));
  }
}
/** 먼 산: 점으로 된 능선 */
function ridge(g, points, colors) {
  g.append(el('path', { d: `M0 320 L${points.map(([x, y]) => `${x} ${y}`).join(' L')} L600 320 Z`, fill: paint(g, colors) }));
}
/** 잎 덩어리: 어두운 잎부터 밝은 잎까지 겹친다 */
function foliage(g, x, y, r, seed = 1, shades = ['#2F5D34', '#3F7A3F', '#5A9650', '#7FB266']) {
  shades.forEach((color, layer) => {
    const count = 9 - layer;
    for (let i = 0; i < count; i++) {
      const a = rnd(seed * 31 + i * 7 + layer * 13) * Math.PI * 2;
      const d = rnd(seed * 17 + i * 11 + layer * 5) * r * (0.85 - layer * 0.12);
      const lift = layer * r * 0.13; // 위쪽이 햇빛을 받아 밝다
      g.append(el('circle', { cx: x + Math.cos(a) * d - layer * r * 0.06, cy: y + Math.sin(a) * d * 0.75 - lift, r: r * (0.42 - layer * 0.06), fill: color }));
    }
  });
}
function leafyTree(g, x, baseY, h, seed = 1) {
  g.append(el('path', { d: `M${x - h * 0.03} ${baseY} L${x - h * 0.012} ${baseY - h * 0.55} L${x + h * 0.012} ${baseY - h * 0.55} L${x + h * 0.03} ${baseY} Z`, fill: '#4A3A2C' }));
  foliage(g, x, baseY - h * 0.68, h * 0.34, seed);
}
function pine(g, x, baseY, h, seed = 1) {
  const lean = (rnd(seed) - 0.5) * h * 0.3;
  g.append(el('path', { d: `M${x} ${baseY} Q${x + lean * 0.2} ${baseY - h * 0.5} ${x + lean} ${baseY - h * 0.85}`, stroke: '#5B4332', 'stroke-width': Math.max(2, h * 0.05), fill: 'none' }));
  const shades = ['#1F4A32', '#2C6240', '#3E7A4C'];
  for (let k = 0; k < 4; k++) {
    const yy = baseY - h * (0.5 + k * 0.17);
    const xx = x + lean * (0.5 + k * 0.16) + (k % 2 ? 1 : -1) * h * 0.1;
    foliage(g, xx, yy, h * (0.22 - k * 0.02), seed + k, shades);
  }
}
function bamboo(g, x0, x1, baseY, h, seed = 1) {
  for (let i = 0; x0 + i * 7 < x1; i++) {
    const x = x0 + i * 7;
    const top = baseY - h * (0.75 + rnd(seed + i) * 0.25);
    g.append(el('line', { x1: x, y1: baseY, x2: x + (rnd(seed + i * 3) - 0.5) * 8, y2: top, stroke: i % 2 ? '#6F8F52' : '#5A7C44', 'stroke-width': 1.6 }));
  }
  for (let i = 0; i < (x1 - x0) / 12; i++) {
    const x = x0 + rnd(seed * 5 + i) * (x1 - x0);
    foliage(g, x, baseY - h * (0.45 + rnd(seed * 7 + i) * 0.5), h * 0.14, seed + i, ['#35683C', '#4B8A48', '#74AE5E']);
  }
}
/** 네모 구멍들을 한 길(path)에 모은다(창문이 많아도 가볍게) */
const rects = (list) => list.map(([x, y, w, h]) => `M${x.toFixed(1)} ${y.toFixed(1)}h${w.toFixed(1)}v${h.toFixed(1)}h${(-w).toFixed(1)}z`).join('');

/**
 * 고층 아파트 한 동: 앞면, 옆면, 층마다 창과 발코니 줄, 꼭대기.
 * @param {{x: number, base: number, w: number, h: number, side?: number, floors: number, cols: number, front: string[], sideColor: string[], glass?: string, band?: string, bandAt?: number, crown?: string, seed?: number}} t
 */
function tower(g, t) {
  const { x, base, w, h, side = w * 0.35, floors, cols, front, sideColor, glass = '#3E5668', band = null, bandAt = 0.5, crown = null, seed = 1 } = t;
  const top = base - h;
  const rise = side * 0.22;
  g.append(el('path', { d: `M${x + w} ${top} L${x + w + side} ${top + rise} L${x + w + side} ${base} L${x + w} ${base} Z`, fill: paint(g, sideColor) }));
  g.append(el('rect', { x, y: top, width: w, height: h, fill: paint(g, front, 'right') }));
  const fh = h / floors;
  const lit = [];
  const dark = [];
  const lines = [];
  const sideGlass = [];
  for (let f = 0; f < floors; f++) {
    const y = top + f * fh;
    lines.push([x, y + fh - 0.5, w, Math.max(0.5, fh * 0.14)]);
    for (let c = 0; c < cols; c++) {
      const cw = w / cols;
      const win = [x + c * cw + cw * 0.14, y + fh * 0.2, cw * 0.72, fh * 0.55];
      (rnd(seed * 97 + f * 41 + c * 13) > 0.72 ? lit : dark).push(win);
    }
    const sideCols = Math.max(2, Math.round(cols * 0.4));
    for (let c = 0; c < sideCols; c++) {
      const cw = side / sideCols;
      sideGlass.push([x + w + c * cw + cw * 0.2, y + fh * 0.22 + (rise * (c + 0.5)) / sideCols, cw * 0.6, fh * 0.5]);
    }
  }
  g.append(el('path', { d: rects(dark), fill: glass }));
  g.append(el('path', { d: rects(lit), fill: '#8FB2C9' }));
  g.append(el('path', { d: rects(lines), fill: '#FFFFFF', opacity: 0.45 }));
  g.append(el('path', { d: rects(sideGlass), fill: '#2B3D4B', opacity: 0.75 }));
  if (band) g.append(el('rect', { x: x + w * bandAt - w * 0.11, y: top, width: w * 0.22, height: h, fill: band, opacity: 0.88 }));
  // 왼쪽에서 오는 햇빛
  g.append(el('rect', { x, y: top, width: w, height: h, fill: paint(g, ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.12)'], 'right') }));
  if (crown) {
    g.append(el('path', { d: `M${x - 1} ${top} L${x + w * 0.12} ${top - fh * 2.2} L${x + w * 0.88} ${top - fh * 2.2} L${x + w + 1} ${top} Z`, fill: crown }));
    g.append(el('path', { d: `M${x + w + 1} ${top} L${x + w * 0.88} ${top - fh * 2.2} L${x + w + side * 0.8} ${top - fh * 2.2 + rise} L${x + w + side} ${top + rise} Z`, fill: crown, opacity: 0.7 }));
  }
}
/** 땅에 드리운 부드러운 그림자 */
function shadow(g, x, y, w, h, amount = 0.3) {
  g.append(el('ellipse', { cx: x, cy: y, rx: w, ry: h, fill: '#1B2A22', opacity: amount, filter: blur(g, 4) }));
}
/** 앞으로 다가오는 면 위의 창(왼쪽 x0에서 오른쪽 x1로 가며 키가 달라지는 건물) */
function perspectiveBlock(g, { x0, x1, top0, bot0, top1, bot1, floors, cols, wall, glass = '#3C5566', trim = '#F2EBDD', seed = 1 }) {
  g.append(el('path', { d: `M${x0} ${top0} L${x1} ${top1} L${x1} ${bot1} L${x0} ${bot0} Z`, fill: wall }));
  const panes = [];
  const yAt = (u, v) => (top0 + (top1 - top0) * u) * (1 - v) + (bot0 + (bot1 - bot0) * u) * v;
  const xAt = (u) => x0 + (x1 - x0) * u;
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const u0 = (c + 0.14) / cols;
      const u1 = (c + 0.86) / cols;
      const v0 = (f + 0.22) / floors;
      const v1 = (f + 0.74) / floors;
      panes.push(`M${xAt(u0).toFixed(1)} ${yAt(u0, v0).toFixed(1)}L${xAt(u1).toFixed(1)} ${yAt(u1, v0).toFixed(1)}L${xAt(u1).toFixed(1)} ${yAt(u1, v1).toFixed(1)}L${xAt(u0).toFixed(1)} ${yAt(u0, v1).toFixed(1)}Z`);
    }
    if (f > 0) g.append(el('line', { x1: x0, y1: yAt(0, f / floors), x2: x1, y2: yAt(1, f / floors), stroke: trim, 'stroke-width': 1.4, opacity: 0.85 }));
  }
  g.append(el('path', { d: panes.join(''), fill: glass }));
  void seed;
}
/** 먼지와 자국이 있는 흙 운동장 */
function dirtField(g, top, color = ['#CDB383', '#BFA271', '#AE9060']) {
  g.append(el('rect', { x: 0, y: top, width: 600, height: 320 - top, fill: paint(g, color) }));
  const speck = [];
  for (let i = 0; i < 260; i++) {
    const y = top + rnd(i * 3 + 1) ** 0.7 * (320 - top);
    const s = 0.5 + ((y - top) / (320 - top)) * 1.6;
    speck.push([rnd(i * 7 + 2) * 600, y, s * 2.4, s * 0.8]);
  }
  g.append(el('path', { d: rects(speck), fill: '#8C7247', opacity: 0.35 }));
}
function goalPost(g, x, base, w, h) {
  g.append(el('path', { d: `M${x} ${base} V${base - h} H${x + w} V${base}`, stroke: '#F4F4F2', 'stroke-width': 2.4, fill: 'none' }));
  const net = [];
  for (let k = 1; k < 7; k++) net.push(`M${x + (w * k) / 7} ${base - h}V${base}`);
  for (let k = 1; k < 4; k++) net.push(`M${x} ${base - (h * k) / 4}H${x + w}`);
  g.append(el('path', { d: net.join(''), stroke: '#E7E7E2', 'stroke-width': 0.6, opacity: 0.6 }));
}
function kid(g, x, y, s, color) {
  g.append(el('ellipse', { cx: x + 3 * s, cy: y, rx: 6 * s, ry: 1.6 * s, fill: '#2A2A22', opacity: 0.3 }));
  g.append(el('path', { d: `M${x - 2 * s} ${y} L${x - 1.5 * s} ${y - 8 * s} M${x + 2 * s} ${y} L${x + 1.5 * s} ${y - 8 * s}`, stroke: '#2F3A45', 'stroke-width': 1.8 * s }));
  g.append(el('rect', { x: x - 3 * s, y: y - 16 * s, width: 6 * s, height: 9 * s, rx: 2 * s, fill: color }));
  g.append(el('circle', { cx: x, cy: y - 18.5 * s, r: 2.6 * s, fill: '#E9BE9A' }));
}

export const REAL_SCENES = {
  /** 부산대학교: 큰 흰 무지개문과 둥근 옛 수위실, 대나무와 소나무 */
  pnuArch(g) {
    skyAndClouds(g, ['#3F86C9', '#86BCE6', '#E4F1F8'], [[150, 70, 60, 12, 0.8], [490, 46, 74, 14, 0.75], [330, 110, 46, 8, 0.5]]);
    ridge(g, [[0, 190], [90, 168], [190, 176], [300, 150], [410, 172], [520, 160], [600, 180]], ['#7F9FA8', '#A9BFB8']);
    // 멀리 있는 유리 건물
    g.append(el('rect', { x: 262, y: 152, width: 86, height: 50, fill: paint(g, ['#9CB8CC', '#6E8DA5'], 'right') }));
    for (let k = 0; k < 6; k++) g.append(el('line', { x1: 262, y1: 158 + k * 7, x2: 348, y2: 158 + k * 7, stroke: '#DCE8F0', 'stroke-width': 1 }));
    // 양쪽 숲
    for (let i = 0; i < 6; i++) leafyTree(g, 20 + i * 36, 228, 110 + rnd(i + 2) * 40, i + 3);
    bamboo(g, 395, 600, 232, 150, 4);
    for (const [x, h, s] of [[448, 165, 5], [545, 190, 6]]) pine(g, x, 232, h, s);
    pine(g, 45, 234, 130, 8);
    // 길(소실점으로 좁아진다)
    g.append(el('path', { d: 'M0 320 L262 206 L338 206 L600 320 Z', fill: paint(g, ['#8F9498', '#65696E', '#4F5357']) }));
    g.append(el('path', { d: 'M0 226 L262 206 L0 320 Z', fill: '#B9AE98', opacity: 0.55 }));
    g.append(el('path', { d: 'M600 226 L338 206 L600 320 Z', fill: '#B9AE98', opacity: 0.55 }));
    for (let k = 0; k < 7; k++) {
      const t0 = k / 7;
      const y0 = 208 + t0 ** 2 * 80;
      const hh = 2 + t0 * 9;
      g.append(el('rect', { x: 299 - t0, y: y0, width: 2 + t0 * 3, height: hh, fill: '#EDD77A' }));
    }
    // 건널목
    const zebra = [];
    for (let k = 0; k < 12; k++) {
      const x = 96 + k * 36;
      zebra.push(`M${x} 290L${x + 22} 290L${x + 18 - (x - 300) * 0.1 + 2} 306L${x - (x - 300) * 0.1} 306Z`);
    }
    g.append(el('path', { d: zebra.join(''), fill: '#EFEFEA', opacity: 0.9 }));
    // 무지개문: 아래가 굵고 위로 갈수록 가늘어진다
    const arch = 'M92 270 C166 -44 434 -44 508 270 L482 270 C414 -28 186 -28 118 270 Z';
    g.append(el('path', { d: arch, fill: paint(g, ['#FBFBF8', '#E6E6E0', '#C9C9C2'], 'right') }));
    g.append(el('path', { d: 'M118 270 C186 -28 414 -28 482 270', stroke: '#9EA39F', 'stroke-width': 2, fill: 'none', opacity: 0.8 }));
    g.append(el('path', { d: 'M92 270 C166 -44 434 -44 508 270', stroke: '#FFFFFF', 'stroke-width': 1.5, fill: 'none' }));
    for (const [x, w] of [[86, 38], [476, 38]]) g.append(el('rect', { x, y: 266, width: w, height: 9, fill: '#BDBDB6' }));
    shadow(g, 300, 276, 250, 5, 0.18);
    // 옛 수위실: 둥근 흰 건물, 긴 띠창, 얇은 지붕 판
    g.append(el('path', { d: 'M8 288 L8 248 Q8 232 30 232 L96 232 Q116 232 116 250 L116 288 Z', fill: paint(g, ['#FAFAF6', '#E9E8E0', '#CFCFC7'], 'right') }));
    g.append(el('path', { d: 'M2 233 Q2 224 24 224 L102 224 Q124 224 124 234 L124 238 L2 238 Z', fill: '#F4F4EF', stroke: '#A8ABA7', 'stroke-width': 1 }));
    g.append(el('rect', { x: 16, y: 248, width: 92, height: 18, rx: 7, fill: paint(g, ['#5C7F99', '#9FBFD3', '#4F6F86'], 'right') }));
    for (let k = 1; k < 6; k++) g.append(el('line', { x1: 16 + k * 15.3, y1: 248, x2: 16 + k * 15.3, y2: 266, stroke: '#ECEFEC', 'stroke-width': 1.4 }));
    foliage(g, 62, 292, 26, 11, ['#38703E', '#4D8D4B', '#6FAB5C']);
    kid(g, 346, 268, 1.1, '#E8590C');
    kid(g, 366, 266, 1, '#1971C2');
  },

  /** 송도탑스빌: 바위 언덕 위로 솟은 은회색 탑 건물 */
  topsville(g) {
    skyAndClouds(g, ['#4A8BC6', '#9CC7E6', '#EAF4F9'], [[120, 60, 80, 16, 0.85], [470, 96, 70, 13, 0.8], [330, 38, 44, 7, 0.45]]);
    tower(g, { x: 356, base: 240, w: 40, h: 158, side: 12, floors: 34, cols: 5, front: ['#E9EDF1', '#C2CCD6', '#8FA0B0'], sideColor: ['#7C8C9B', '#5C6B79'], glass: '#3D5A70', seed: 3 });
    tower(g, { x: 238, base: 240, w: 58, h: 214, side: 16, floors: 40, cols: 6, front: ['#F2F4F6', '#CAD3DC', '#90A1B2'], sideColor: ['#7F90A0', '#566675'], glass: '#3A5C76', band: '#3F627D', bandAt: 0.5, seed: 1 });
    tower(g, { x: 304, base: 240, w: 46, h: 190, side: 12, floors: 36, cols: 5, front: ['#ECEFF3', '#C5CFD9', '#8D9EAF'], sideColor: ['#74869A', '#566675'], glass: '#3A5C76', band: '#46698A', bandAt: 0.5, seed: 2 });
    // 위로 갈수록 좁아지는 꼭대기
    g.append(el('path', { d: 'M238 26 L252 10 L282 10 L296 26 Z', fill: paint(g, ['#DCE2E8', '#A9B6C2'], 'right') }));
    g.append(el('path', { d: 'M304 50 L316 37 L338 37 L350 50 Z', fill: paint(g, ['#D8DFE6', '#A5B2BF'], 'right') }));
    g.append(el('line', { x1: 267, y1: 10, x2: 267, y2: -6, stroke: '#7E8C98', 'stroke-width': 2 }));
    // 옆 낮은 건물들
    tower(g, { x: 452, base: 256, w: 54, h: 84, side: 14, floors: 14, cols: 6, front: ['#E7E1D2', '#C9C1AF'], sideColor: ['#9F9786', '#857E6E'], seed: 7 });
    tower(g, { x: 524, base: 256, w: 60, h: 112, side: 16, floors: 19, cols: 6, front: ['#EDEBE4', '#CBC8BE'], sideColor: ['#A3A198', '#85837A'], seed: 9 });
    // 바위 언덕: 면마다 밝기를 달리한다
    g.append(el('path', { d: 'M0 320 L0 244 L46 222 L92 232 L132 192 L176 204 L214 176 L262 196 L306 186 L352 212 L392 208 L440 244 L498 262 L600 276 L600 320 Z', fill: paint(g, ['#A99A86', '#7E7060', '#59503F']) }));
    const facets = [
      ['M132 192 L176 204 L160 254 L112 244 Z', '#BCAE99'],
      ['M214 176 L262 196 L246 258 L190 240 Z', '#C8BBA7'],
      ['M306 186 L352 212 L332 268 L282 246 Z', '#B4A692'],
      ['M46 222 L92 232 L84 280 L30 276 Z', '#9D907C'],
      ['M176 204 L214 176 L190 240 L160 254 Z', '#857966'],
      ['M262 196 L306 186 L282 246 L246 258 Z', '#7A6E5C'],
      ['M352 212 L392 208 L396 270 L332 268 Z', '#8F826E'],
      ['M112 244 L160 254 L150 306 L92 298 Z', '#7C7060'],
      ['M190 240 L246 258 L238 312 L176 306 Z', '#94876F'],
      ['M282 246 L332 268 L326 318 L262 312 Z', '#8A7D69'],
    ];
    for (const [d, fill] of facets) g.append(el('path', { d, fill, stroke: '#4F4638', 'stroke-width': 0.8, 'stroke-opacity': 0.6 }));
    // 바위 틈 금
    const cracks = [];
    for (let i = 0; i < 40; i++) {
      const x = 40 + rnd(i * 5 + 3) * 360;
      const y = 214 + rnd(i * 9 + 4) * 92;
      cracks.push(`M${x} ${y}l${(rnd(i + 8) - 0.5) * 14} ${6 + rnd(i + 5) * 10}`);
    }
    g.append(el('path', { d: cracks.join(''), stroke: '#463D30', 'stroke-width': 1, opacity: 0.55, fill: 'none' }));
    // 바위 위 소나무와 풀숲
    pine(g, 74, 232, 62, 12);
    pine(g, 196, 192, 54, 14);
    pine(g, 378, 214, 48, 15);
    for (const [x, y, r, s] of [[30, 262, 20, 3], [116, 300, 22, 5], [410, 268, 22, 6], [470, 290, 28, 7], [548, 298, 34, 8], [300, 316, 18, 9]]) foliage(g, x, y, r, s);
  },

  /** 동래3차 SK뷰: 금빛 꼭대기와 진한 갈색 띠의 일곱 동, 뒤로 산 */
  dongnaeSk(g) {
    skyAndClouds(g, ['#5B86B5', '#A9C5DD', '#F2E9D8'], [[130, 74, 90, 12, 0.7], [470, 52, 80, 11, 0.6]]);
    ridge(g, [[0, 176], [70, 150], [150, 136], [240, 150], [330, 128], [430, 148], [520, 130], [600, 156]], ['#6C8E78', '#8BA888']);
    ridge(g, [[0, 214], [120, 188], [260, 200], [420, 190], [600, 206]], ['#527F58', '#6F9A68']);
    const body = { front: ['#F1DFC2', '#D9C09B', '#A98F6C'], sideColor: ['#8A6F52', '#5E4A37'], glass: '#3F4B55', band: '#4A3A30', crown: '#D9A441' };
    const list = [
      { x: 28, h: 150, w: 44 },
      { x: 88, h: 178, w: 50 },
      { x: 158, h: 208, w: 54, seed: 21 },
      { x: 234, h: 238, w: 58, seed: 22 },
      { x: 320, h: 222, w: 56, seed: 23 },
      { x: 400, h: 190, w: 52, seed: 24 },
      { x: 480, h: 176, w: 50, seed: 25 },
    ];
    list.forEach((t, i) => tower(g, { ...body, base: 262, side: t.w * 0.26, floors: Math.round(t.h / 7), cols: 6, bandAt: i % 2 ? 0.32 : 0.7, seed: t.seed ?? i + 30, ...t }));
    // 아래 상가
    g.append(el('rect', { x: 0, y: 248, width: 600, height: 22, fill: paint(g, ['#7B6450', '#5C4A3A']) }));
    g.append(el('path', { d: rects(Array.from({ length: 30 }, (_, i) => [6 + i * 20, 252, 15, 14])), fill: '#B9D2DE' }));
    g.append(el('rect', { x: 0, y: 246, width: 600, height: 3, fill: '#E9DFCF' }));
    // 길과 가로수
    g.append(el('rect', { x: 0, y: 270, width: 600, height: 50, fill: paint(g, ['#7D8186', '#55595E']) }));
    g.append(el('rect', { x: 0, y: 270, width: 600, height: 7, fill: '#C9C0AE' }));
    g.append(el('path', { d: rects(Array.from({ length: 13 }, (_, i) => [i * 50, 298, 26, 2.5])), fill: '#EDEDE6' }));
    for (const [x, h, s] of [[60, 74, 2], [190, 80, 3], [330, 72, 4], [456, 82, 5], [566, 76, 6]]) leafyTree(g, x, 276, h, s);
    g.append(el('rect', { x: 212, y: 286, width: 44, height: 14, rx: 4, fill: '#E8E8E5' }));
    g.append(el('path', { d: 'M220 286 L228 277 L244 277 L250 286 Z', fill: '#44566A' }));
    for (const x of [222, 246]) g.append(el('circle', { cx: x, cy: 300, r: 4, fill: '#23272B' }));
  },

  /** 센텀푸르지오: 짙은 지붕선의 밝은 회백색 동들, 앞에 갈색 커뮤니티 건물과 정원 */
  centum(g) {
    skyAndClouds(g, ['#4D8BC9', '#A6CDE9', '#EEF6FA'], [[170, 58, 76, 14, 0.85], [470, 82, 86, 13, 0.75]]);
    ridge(g, [[0, 196], [100, 170], [220, 188], [350, 164], [480, 186], [600, 172]], ['#7EA18A', '#9AB79B']);
    const body = { front: ['#FBFBF9', '#E0E2E2', '#AEB3B6'], sideColor: ['#9AA0A4', '#6F7579'], glass: '#55697A', crown: '#4B4F54' };
    for (const t of [
      { x: 12, h: 128, w: 54, seed: 41 },
      { x: 86, h: 186, w: 58, seed: 42 },
      { x: 166, h: 150, w: 56, seed: 43 },
      { x: 244, h: 242, w: 64, seed: 44 },
      { x: 334, h: 202, w: 60, seed: 45 },
      { x: 414, h: 164, w: 56, seed: 46 },
      { x: 492, h: 208, w: 62, seed: 47 },
    ]) tower(g, { ...body, base: 256, side: t.w * 0.28, floors: Math.round(t.h / 7.5), cols: 5, ...t });
    // 잔디와 길
    g.append(el('rect', { x: 0, y: 252, width: 600, height: 68, fill: paint(g, ['#7FAE63', '#5C9049', '#47773A']) }));
    g.append(el('path', { d: 'M0 300 Q200 262 340 276 T600 268 L600 288 Q470 286 350 296 T0 320 Z', fill: '#D5CFC1' }));
    // 갈색 커뮤니티 건물: 녹슨 철판과 나무 살
    g.append(el('rect', { x: 196, y: 214, width: 128, height: 62, fill: paint(g, ['#7A4A2C', '#5B3722'], 'right') }));
    g.append(el('rect', { x: 188, y: 206, width: 146, height: 9, fill: '#3B2B20' }));
    g.append(el('rect', { x: 210, y: 232, width: 48, height: 44, fill: paint(g, ['#A9CCDD', '#6E94AB']) }));
    for (let k = 1; k < 4; k++) g.append(el('line', { x1: 210 + k * 12, y1: 232, x2: 210 + k * 12, y2: 276, stroke: '#3B2B20', 'stroke-width': 1.2 }));
    const slat = [];
    for (let k = 0; k < 13; k++) slat.push([268 + k * 4.2, 222, 2.2, 54]);
    g.append(el('path', { d: rects(slat), fill: '#C79A62' }));
    // 정원 나무
    for (const [x, h, s] of [[34, 70, 2], [140, 86, 3], [362, 76, 4], [430, 94, 5], [560, 88, 6]]) leafyTree(g, x, 276, h, s);
    for (const [x, y, r, s] of [[84, 296, 18, 7], [176, 280, 14, 8], [346, 296, 16, 9], [510, 292, 20, 10]]) foliage(g, x, y, r, s, ['#3D7A3D', '#5C9E4D', '#8CC26A']);
    kid(g, 300, 286, 1, '#E8590C');
  },

  /** 온천초등학교: 베이지색 교실 건물, 유리 계단탑, 초록 운동장 */
  oncheonSchool(g) {
    skyAndClouds(g, ['#5C9AD6', '#AFD3EE', '#EEF6FA'], [[150, 54, 74, 12, 0.85], [440, 40, 60, 10, 0.7]]);
    ridge(g, [[0, 132], [110, 104], [210, 122], [320, 96], [430, 118], [520, 102], [600, 124]], ['#5F8B68', '#83A986']);
    // 뒤편 동네 아파트
    for (const [x, h, s] of [[10, 86, 51], [68, 66, 52], [468, 92, 53], [534, 74, 54]]) tower(g, { x, base: 186, w: 44, h, side: 10, floors: Math.round(h / 7), cols: 5, front: ['#EEE9DF', '#CEC8BB'], sideColor: ['#A9A397', '#8B8579'], seed: s });
    // 긴 교실 건물
    g.append(el('rect', { x: 62, y: 96, width: 416, height: 102, fill: paint(g, ['#F0E3C8', '#DCCBA8', '#C3B08D'], 'right') }));
    g.append(el('rect', { x: 56, y: 90, width: 428, height: 8, fill: '#7E8B8F' }));
    const panes = [];
    const pillars = [];
    for (let f = 0; f < 4; f++) {
      for (let c = 0; c < 15; c++) panes.push([74 + c * 26.6, 104 + f * 23, 20, 14]);
    }
    for (let c = 0; c < 16; c++) pillars.push([69 + c * 26.6, 98, 3, 100]);
    g.append(el('path', { d: rects(panes), fill: paint(g, ['#7FA7BF', '#4C6E84']) }));
    g.append(el('path', { d: rects(pillars), fill: '#FFF8EA', opacity: 0.8 }));
    for (let f = 1; f < 4; f++) g.append(el('rect', { x: 62, y: 98 + f * 23, width: 416, height: 2.5, fill: '#FFF8EA' }));
    // 파란 유리 계단탑과 회색 벽
    g.append(el('rect', { x: 178, y: 66, width: 62, height: 132, fill: paint(g, ['#5B94C2', '#2F6E9F', '#1F5683'], 'right') }));
    const grid = [];
    for (let k = 1; k < 11; k++) grid.push(`M178 ${66 + k * 12}H240`);
    for (let k = 1; k < 5; k++) grid.push(`M${178 + k * 12.4} 66V198`);
    g.append(el('path', { d: grid.join(''), stroke: '#D5E7F2', 'stroke-width': 0.9, opacity: 0.8 }));
    g.append(el('path', { d: 'M178 66 L208 66 L178 118 Z', fill: '#FFFFFF', opacity: 0.2 }));
    g.append(el('rect', { x: 240, y: 76, width: 34, height: 122, fill: paint(g, ['#A4ABB0', '#808A91'], 'right') }));
    g.append(el('rect', { x: 174, y: 60, width: 104, height: 7, fill: '#5C676E' }));
    g.append(el('text', { x: 375, y: 88, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 800, fill: '#27476B', 'font-family': 'sans-serif' }, '온천초등학교'));
    // 현관
    g.append(el('rect', { x: 276, y: 176, width: 46, height: 22, fill: '#3F5766' }));
    g.append(el('rect', { x: 270, y: 170, width: 58, height: 7, fill: '#EDE6D4' }));
    // 울타리와 나무
    for (const [x, h, s] of [[32, 66, 2], [116, 58, 3], [506, 70, 4], [572, 62, 5]]) leafyTree(g, x, 206, h, s);
    g.append(el('rect', { x: 0, y: 198, width: 600, height: 12, fill: '#B9B2A2' }));
    // 초록 운동장, 흰 줄, 붉은 트랙
    g.append(el('path', { d: 'M0 214 L600 214 L600 320 L0 320 Z', fill: paint(g, ['#7FA068', '#5F9650', '#468240']) }));
    const stripes = [];
    for (let k = 0; k < 8; k++) stripes.push(`M${40 + k * 80} 214 L${-120 + k * 130} 320 L${-55 + k * 130} 320 L${80 + k * 80} 214Z`);
    g.append(el('path', { d: stripes.join(''), fill: '#FFFFFF', opacity: 0.05 }));
    g.append(el('path', { d: 'M0 214 L600 214 L600 224 L0 224 Z', fill: '#B4553F' }));
    g.append(el('path', { d: 'M60 300 L140 230 L460 230 L540 300 Z', fill: 'none', stroke: '#F4F5EE', 'stroke-width': 2.2 }));
    g.append(el('line', { x1: 300, y1: 230, x2: 300, y2: 300, stroke: '#F4F5EE', 'stroke-width': 2 }));
    g.append(el('ellipse', { cx: 300, cy: 262, rx: 54, ry: 15, fill: 'none', stroke: '#F4F5EE', 'stroke-width': 2 }));
    goalPost(g, 118, 244, 40, 18);
    goalPost(g, 442, 244, 40, 18);
    kid(g, 250, 276, 1.2, '#E8590C');
    kid(g, 330, 288, 1.3, '#1971C2');
    kid(g, 378, 266, 1.1, '#F59F00');
  },

  /** 송도초등학교: 흙 운동장, 비스듬히 뻗은 황토색 교실 건물, 뒤편 고층 건물 */
  songdoSchool(g) {
    skyAndClouds(g, ['#6BA3D6', '#B9D7EC', '#F1F6F8'], [[120, 44, 66, 11, 0.8], [400, 62, 80, 12, 0.75]]);
    ridge(g, [[0, 146], [120, 118], [240, 134], [360, 112], [500, 130], [600, 118]], ['#7898A0', '#9CB6AC']);
    // 뒤편 고층 아파트(송도 바닷가 쪽)
    tower(g, { x: 92, base: 178, w: 34, h: 150, side: 10, floors: 30, cols: 4, front: ['#E4E8EC', '#B7C1CB'], sideColor: ['#8795A2', '#667481'], seed: 61 });
    tower(g, { x: 142, base: 178, w: 34, h: 170, side: 10, floors: 34, cols: 4, front: ['#EDF0F2', '#BCC6CF'], sideColor: ['#8795A2', '#667481'], seed: 62 });
    tower(g, { x: 18, base: 178, w: 40, h: 96, side: 10, floors: 18, cols: 5, front: ['#EDE6D8', '#CFC6B4'], sideColor: ['#A29A88', '#857D6D'], seed: 63 });
    dirtField(g, 196);
    // 왼쪽 낮은 건물: 파란 띠가 있는 강당
    g.append(el('rect', { x: 190, y: 138, width: 116, height: 54, fill: paint(g, ['#EFEFE9', '#CFCFC6'], 'right') }));
    g.append(el('rect', { x: 186, y: 128, width: 124, height: 11, fill: '#2E6EA6' }));
    g.append(el('rect', { x: 190, y: 158, width: 116, height: 5, fill: '#E2B64A' }));
    g.append(el('path', { d: rects(Array.from({ length: 7 }, (_, i) => [197 + i * 15.5, 144, 10, 11])), fill: '#587488' }));
    // 비스듬히 뻗은 교실 건물(오른쪽으로 다가온다)
    perspectiveBlock(g, { x0: 304, x1: 600, top0: 118, bot0: 192, top1: 62, bot1: 232, floors: 4, cols: 14, wall: paint(g, ['#D9B98A', '#C69F6E', '#AF8758'], 'right'), glass: '#46647A', trim: '#F4E8D2' });
    g.append(el('path', { d: 'M300 116 L600 58 L600 66 L304 122 Z', fill: '#6F5B45' }));
    g.append(el('text', { x: 420, y: 88, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 800, fill: '#27476B', 'font-family': 'sans-serif', transform: 'rotate(-10.7 420 88)' }, '송도초등학교'));
    // 울타리, 스탠드 나무
    for (const [x, h, s] of [[20, 60, 2], [70, 50, 3], [260, 56, 4]]) leafyTree(g, x, 198, h, s);
    g.append(el('rect', { x: 0, y: 192, width: 304, height: 6, fill: '#9B9486' }));
    const fence = [];
    for (let k = 0; k < 31; k++) fence.push(`M${k * 10} 178V196`);
    g.append(el('path', { d: fence.join(''), stroke: '#5D6A63', 'stroke-width': 1, opacity: 0.6 }));
    g.append(el('line', { x1: 0, y1: 178, x2: 304, y2: 178, stroke: '#5D6A63', 'stroke-width': 1.5, opacity: 0.7 }));
    // 건물 그림자
    g.append(el('path', { d: 'M304 192 L600 232 L600 258 L300 204 Z', fill: '#54452E', opacity: 0.25, filter: blur(g, 3) }));
    g.append(el('path', { d: 'M40 300 Q280 236 560 280', stroke: '#F0E9D8', 'stroke-width': 2.2, fill: 'none', opacity: 0.75 }));
    g.append(el('ellipse', { cx: 280, cy: 266, rx: 60, ry: 14, fill: 'none', stroke: '#F0E9D8', 'stroke-width': 2, opacity: 0.7 }));
    goalPost(g, 56, 228, 46, 22);
    // 앞쪽 나무와 놀이기구
    g.append(el('path', { d: 'M500 262 V226 H560 V262 M522 226 V252 M544 226 V252', stroke: '#2E6EA6', 'stroke-width': 3, fill: 'none' }));
    for (const x of [522, 544]) g.append(el('rect', { x: x - 5, y: 252, width: 10, height: 3, fill: '#E8590C' }));
    kid(g, 200, 262, 1.2, '#1971C2');
    kid(g, 244, 288, 1.4, '#E8590C');
    kid(g, 336, 256, 1.1, '#2F9E44');
  },
};
