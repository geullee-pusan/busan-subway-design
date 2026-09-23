// 버스 안과 택시 안 그림(SVG). 시승 모드와 여행 모드가 함께 쓴다.
// 부산 시내버스와 택시 안 사진을 보고 새로 그린 그림이다. 사진을 그대로 쓰지 않는다.
//
// 버스: 뒤에서 앞을 바라본 저상 버스 안. 가운데 통로 끝에 앞 유리와 운전석,
//   양쪽에 창문과 검은 의자, 연두색 기둥과 손잡이 고리, 오른쪽 앞에 뒷문과 카드 찍는 기계.
//   멀고 가까운 것은 깊이 t(0 = 맨 앞 벽, 1 = 보는 사람 바로 앞)로 그린다.
// 택시: 뒷자리에서 본 앞쪽. 왼쪽에 운전하는 사람의 뒷모습과 운전대, 가운데 길 안내 화면,
//   오른쪽에 요금 미터기, 위에 앞 유리 너머 앞차들과 뒷거울.

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

export const SHIRTS = ['#2F6690', '#D1495B', '#EDAE49', '#3A7D44', '#6D597A', '#00798C', '#9C6644', '#4F5D75'];

// ---------- 버스 안 ----------
/** 버스 그림에 사람이 설 수 있는 자리 수(앉는 자리 8 + 서는 자리 18) */
export const BUS_PEOPLE_MAX = 26;
const BUS_POLE = '#9BC53D';
const BUS_POLE_DARK = '#6E9429';
/** 깊이 t에서 왼쪽 벽이 바닥과 만나는 x, 바닥 y, 천장 y, 크기 */
const busAt = (t) => ({
  wall: 250 * (1 - t),
  floor: 215 + 125 * t,
  ceil: 110 * (1 - t),
  s: 0.4 + 0.9 * t,
});
/** 벽 높이의 어느 비율(0 = 천장, 1 = 바닥)에 있는 점. side는 왼쪽(-1) 또는 오른쪽(1) */
function busWallPoint(t, share, side) {
  const p = busAt(t);
  const x = side < 0 ? p.wall : 800 - p.wall;
  return `${x.toFixed(1)},${(p.ceil + (p.floor - p.ceil) * share).toFixed(1)}`;
}
function busPanel(t0, t1, top, bottom, side) {
  return [busWallPoint(t0, top, side), busWallPoint(t1, top, side), busWallPoint(t1, bottom, side), busWallPoint(t0, bottom, side)].join(' ');
}
/** 옆 창문(깊이 구간)과 뒷문(오른쪽 가까운 곳) */
const BUS_WINDOWS = [
  { side: -1, from: 0.02, to: 0.3 },
  { side: -1, from: 0.33, to: 0.62 },
  { side: -1, from: 0.65, to: 1 },
  { side: 1, from: 0.02, to: 0.3 },
  { side: 1, from: 0.33, to: 0.62 },
];
const BUS_DOOR = { from: 0.68, to: 0.98 };
/** 가로 봉과 기둥이 벽에서 떨어진 거리(가까울수록 크게) */
const railEdge = (p) => p.wall + 115 * p.s;

/** 창밖 거리: 하늘, 지나가는 건물과 가로수, 찻길(y 40~180 띠에 그린다) */
export function streetView(reduceMotion) {
  const g = svgEl('g');
  g.append(svgEl('rect', { x: 0, y: 40, width: 800, height: 140, fill: '#BFE3F5' }));
  const moving = svgEl('g', { class: reduceMotion ? '' : 'ride-scene-move' });
  for (let x = 0; x < 1600; x += 80) {
    const h = 40 + ((x * 11) % 50);
    moving.append(svgEl('rect', { x, y: 140 - h, width: 60, height: h, fill: '#AEB9C4' }));
    moving.append(svgEl('circle', { cx: x + 70, cy: 128, r: 10, fill: '#6FAE5E' }));
  }
  g.append(moving);
  g.append(svgEl('rect', { x: 0, y: 140, width: 800, height: 40, fill: '#7D8A96' }));
  return g;
}

/**
 * 버스 안 그림.
 * @param {object} p
 * @param {number} p.count 사람 그림 수(앉는 자리부터 찬다)
 * @param {string} p.color 노선 색(창문 위 띠)
 * @param {string} p.label 앞 전광판 글자(노선 이름이나 번호)
 * @param {SVGElement} [p.outside] 창밖 그림(y 40~180 띠). 없으면 거리
 * @param {boolean} [p.reduceMotion]
 */
export function busInteriorArt({ count, color, label, outside, reduceMotion = false }) {
  const svg = svgEl('svg', { class: 'ride-car', viewBox: '0 0 800 340', role: 'img' });

  // 창밖(옆 창문과 뒷문 유리로 보인다)
  const clip = svgEl('clipPath', { id: 'bus-windows' });
  for (const w of BUS_WINDOWS) clip.append(svgEl('polygon', { points: busPanel(w.from, w.to, 0.2, 0.52, w.side) }));
  clip.append(svgEl('polygon', { points: busPanel(BUS_DOOR.from + 0.03, BUS_DOOR.to - 0.03, 0.12, 0.9, 1) }));
  const defs = svgEl('defs');
  defs.append(clip);
  svg.append(defs);
  const view = svgEl('g', { 'clip-path': 'url(#bus-windows)' });
  view.append(svgEl('rect', { x: 0, y: 0, width: 800, height: 60, fill: '#BFE3F5' }));
  view.append(svgEl('rect', { x: 0, y: 170, width: 800, height: 170, fill: '#A9B1B7' }));
  view.append(outside ?? streetView(reduceMotion));
  svg.append(view);

  // 천장, 바닥, 벽
  svg.append(svgEl('polygon', { points: '0,0 800,0 550,110 250,110', fill: '#E4E6E1' }));
  svg.append(svgEl('polygon', { points: '0,340 800,340 550,215 250,215', fill: '#3C4148' }));
  for (const side of [-1, 1]) {
    svg.append(svgEl('polygon', { points: busPanel(0, 1, 0, 0.2, side), fill: '#D3D6CF' }));
    svg.append(svgEl('polygon', { points: busPanel(0, 1, 0.52, 1, side), fill: '#B9C4A0' }));
    svg.append(svgEl('polygon', { points: busPanel(0, 1, 0.52, 0.56, side), fill: BUS_POLE }));
    // 노선 색 띠: 창문 위를 따라 간다.
    svg.append(svgEl('polygon', { points: busPanel(0, 1, 0.16, 0.19, side), fill: color }));
  }
  for (const w of BUS_WINDOWS) {
    svg.append(svgEl('polygon', { points: busPanel(w.from, w.to, 0.2, 0.52, w.side), fill: 'none', stroke: '#7B8078', 'stroke-width': 3 }));
    svg.append(svgEl('polygon', { points: busPanel(w.from, w.to, 0.3, 0.31, w.side), fill: '#7B8078' }));
  }
  // 뒷문: 바닥까지 내려온 유리문 두 짝
  svg.append(svgEl('polygon', { points: busPanel(BUS_DOOR.from, BUS_DOOR.to, 0.08, 1, 1), fill: 'none', stroke: '#2B2F36', 'stroke-width': 8 }));
  svg.append(svgEl('polygon', { points: busPanel(BUS_DOOR.from + 0.15, BUS_DOOR.from + 0.16, 0.1, 0.98, 1), fill: '#2B2F36' }));

  busFront(svg, label, reduceMotion);
  busRails(svg);

  // 깊이 순서로 그린다: 먼 것부터 가까운 것까지(의자와 앉은 사람, 서 있는 사람, 기둥)
  const items = [];
  const seats = [];
  for (const t of [0.1, 0.27, 0.44, 0.61, 0.8]) seats.push({ side: -1, t });
  for (const t of [0.1, 0.27, 0.44]) seats.push({ side: 1, t });
  // 앉는 자리 차례는 흩어 놓아 고르게 찬다(늘 같은 차례).
  const seatOrder = [4, 1, 6, 2, 7, 0, 5, 3];
  const seatedAt = new Map();
  const stand = [];
  for (const t of [0.22, 0.36, 0.5, 0.64, 0.78, 0.92]) for (const off of [-0.45, 0.45]) stand.push({ t, off });
  for (const t of [0.3, 0.44, 0.58, 0.72, 0.86, 0.99]) stand.push({ t, off: 0 });
  // 서는 자리도 먼 곳과 가까운 곳이 섞이게 차례를 흩는다(늘 같은 차례).
  const standOrder = stand.map((_, i) => i).sort((x, y) => ((x * 7) % stand.length) - ((y * 7) % stand.length));
  for (let n = 0; n < Math.min(count, BUS_PEOPLE_MAX); n++) {
    const shirt = SHIRTS[(n * 5) % SHIRTS.length];
    if (n < seats.length) seatedAt.set(seatOrder[n], shirt);
    else {
      const spot = stand[standOrder[n - seats.length]];
      items.push({ t: spot.t, draw: () => busStanding(svg, spot, shirt) });
    }
  }
  for (const [i, seat] of seats.entries()) items.push({ t: seat.t, draw: () => busSeat(svg, seat, seatedAt.get(i)) });
  for (const t of [0.18, 0.52, 0.86]) items.push({ t: t + 0.001, draw: () => busPole(svg, t, -1) });
  for (const t of [0.18, 0.52]) items.push({ t: t + 0.001, draw: () => busPole(svg, t, 1) });
  items.push({ t: BUS_DOOR.from - 0.02, draw: () => busPole(svg, BUS_DOOR.from - 0.02, 1, true) });
  items.sort((a, b) => a.t - b.t);
  for (const item of items) item.draw();
  return svg;
}

/** 맨 앞: 앞 유리 너머 찻길, 행선지 전광판, 운전석 칸막이, 요금통 */
function busFront(svg, label, reduceMotion) {
  svg.append(svgEl('rect', { x: 250, y: 110, width: 300, height: 105, fill: '#C9CBC4' }));
  svg.append(svgEl('rect', { x: 262, y: 128, width: 276, height: 64, fill: '#BFE3F5' }));
  for (const [x, y, w, h] of [
    [266, 138, 26, 22],
    [296, 146, 20, 14],
    [480, 142, 24, 18],
    [506, 134, 30, 26],
  ]) {
    svg.append(svgEl('rect', { x, y, width: w, height: h, fill: '#AEB9C4' }));
  }
  svg.append(svgEl('polygon', { points: '262,160 380,160 262,192', fill: '#9CC58A' }));
  svg.append(svgEl('polygon', { points: '538,160 420,160 538,192', fill: '#9CC58A' }));
  svg.append(svgEl('polygon', { points: '262,192 538,192 420,160 380,160', fill: '#7D8A96' }));
  const lane = svgEl('g', { class: reduceMotion ? '' : 'road-ahead' });
  for (const [y, h, w] of [
    [163, 3, 2],
    [170, 5, 3],
    [180, 8, 4],
  ]) {
    lane.append(svgEl('rect', { x: 400 - w / 2, y, width: w, height: h, fill: '#F2F2F2' }));
  }
  svg.append(lane);
  svg.append(svgEl('rect', { x: 262, y: 128, width: 276, height: 64, fill: 'none', stroke: '#2B2F36', 'stroke-width': 4 }));
  // 행선지 전광판(검은 판에 주황 글자)
  svg.append(svgEl('rect', { x: 320, y: 113, width: 160, height: 13, rx: 2, fill: '#1D1F22' }));
  svg.append(svgEl('text', { x: 400, y: 123, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#F2A33A' }, label));
  // 계기판, 운전석 의자와 칸막이, 요금통과 카드 찍는 기계
  svg.append(svgEl('rect', { x: 262, y: 188, width: 276, height: 12, fill: '#55595F' }));
  svg.append(svgEl('rect', { x: 282, y: 172, width: 38, height: 43, rx: 6, fill: '#2B2F36' }));
  svg.append(svgEl('rect', { x: 326, y: 160, width: 26, height: 55, fill: '#A9ABA5', stroke: '#7B8078', 'stroke-width': 2 }));
  svg.append(svgEl('rect', { x: 356, y: 182, width: 18, height: 33, fill: '#3C4148' }));
  svg.append(svgEl('rect', { x: 377, y: 176, width: 10, height: 16, rx: 2, fill: '#2F6FC0' }));
}

/** 천장을 따라 가는 가로 봉과 손잡이 고리 */
function busRails(svg) {
  for (const side of [-1, 1]) {
    const at = (t) => {
      const p = busAt(t);
      return { x: side < 0 ? railEdge(p) : 800 - railEdge(p), y: p.ceil + 16 * p.s, s: p.s };
    };
    const near = at(1);
    const far = at(0);
    svg.append(svgEl('line', { x1: far.x, y1: far.y, x2: near.x, y2: near.y, stroke: BUS_POLE, 'stroke-width': 7, 'stroke-linecap': 'round' }));
    // 손잡이 고리: 파랑과 빨강이 번갈아 달려 있다(꾸밈일 뿐 뜻은 없다).
    for (const [i, t] of [0.12, 0.26, 0.4, 0.54, 0.68, 0.82].entries()) {
      const p = at(t);
      const strap = 26 * p.s;
      svg.append(svgEl('line', { x1: p.x, y1: p.y, x2: p.x, y2: p.y + strap, stroke: '#3C4148', 'stroke-width': 3 * p.s }));
      svg.append(
        svgEl('ellipse', {
          cx: p.x,
          cy: p.y + strap + 9 * p.s,
          rx: 6 * p.s,
          ry: 10 * p.s,
          fill: 'none',
          stroke: i % 2 === 0 ? '#2F6FC0' : '#D1495B',
          'stroke-width': 3.5 * p.s,
        }),
      );
    }
  }
}

/** 세로 기둥 하나. 하차벨(빨간 단추)이 달려 있고, 문 옆 기둥에는 카드 찍는 기계가 있다. */
function busPole(svg, t, side, reader = false) {
  const p = busAt(t);
  const x = side < 0 ? railEdge(p) : 800 - railEdge(p);
  const width = 9 * p.s;
  const top = p.ceil + 14 * p.s;
  svg.append(svgEl('rect', { x: x - width / 2, y: top, width, height: p.floor - top, fill: BUS_POLE, stroke: BUS_POLE_DARK, 'stroke-width': 1 }));
  const bellY = p.ceil + (p.floor - p.ceil) * 0.5;
  svg.append(svgEl('circle', { cx: x, cy: bellY, r: 7 * p.s, fill: '#D1495B', stroke: '#FFFFFF', 'stroke-width': 2 * p.s }));
  if (reader) {
    const y = p.ceil + (p.floor - p.ceil) * 0.58;
    svg.append(svgEl('rect', { x: x - 16 * p.s, y, width: 32 * p.s, height: 58 * p.s, rx: 8 * p.s, fill: '#2F6FC0', stroke: '#1D3F73', 'stroke-width': 2 }));
    svg.append(svgEl('rect', { x: x - 10 * p.s, y: y + 8 * p.s, width: 20 * p.s, height: 18 * p.s, rx: 3 * p.s, fill: '#1D1F22' }));
  }
}

/** 의자 하나와 앉은 사람(뒤에서 보여서 머리와 어깨만 보인다) */
function busSeat(svg, seat, shirt) {
  const p = busAt(seat.t);
  const x = seat.side < 0 ? p.wall + 58 * p.s : 800 - p.wall - 58 * p.s;
  if (shirt) svg.append(backOfPerson(x, p.floor - 100 * p.s, shirt, p.s, true));
  svg.append(svgEl('rect', { x: x - 26 * p.s, y: p.floor - 86 * p.s, width: 52 * p.s, height: 62 * p.s, rx: 10 * p.s, fill: '#2B2F36' }));
  svg.append(svgEl('rect', { x: x - 26 * p.s, y: p.floor - 86 * p.s, width: 52 * p.s, height: 8 * p.s, rx: 4 * p.s, fill: '#454B53' }));
  svg.append(svgEl('rect', { x: x - 30 * p.s, y: p.floor - 26 * p.s, width: 60 * p.s, height: 22 * p.s, rx: 4 * p.s, fill: '#24272C' }));
}

/** 통로에 서 있는 사람 */
function busStanding(svg, spot, shirt) {
  const p = busAt(spot.t);
  const half = 400 - railEdge(p);
  const scale = p.s * 1.05;
  svg.append(backOfPerson(400 + spot.off * half, p.floor - 4 - 116 * scale, shirt, scale, false));
}

/** 뒤에서 본 사람: 머리카락이 보이고, 서 있으면 한 손을 들어 손잡이를 잡는다. */
function backOfPerson(x, y, shirt, scale, seated) {
  const g = svgEl('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)})` });
  if (!seated) g.append(svgEl('line', { x1: 9, y1: 16, x2: 15, y2: -34, stroke: shirt, 'stroke-width': 6, 'stroke-linecap': 'round' }));
  g.append(svgEl('rect', { x: -14, y: 12, width: 28, height: seated ? 40 : 56, rx: 10, fill: shirt, stroke: '#1F3342', 'stroke-width': 1.5 }));
  g.append(svgEl('circle', { cx: -11, cy: 1, r: 3, fill: '#F2C9A0' }));
  g.append(svgEl('circle', { cx: 11, cy: 1, r: 3, fill: '#F2C9A0' }));
  g.append(svgEl('circle', { cx: 0, cy: 0, r: 11, fill: '#3A2E28', stroke: '#1F3342', 'stroke-width': 1.5 }));
  if (!seated) {
    g.append(svgEl('rect', { x: -11, y: 66, width: 9, height: 50, rx: 3, fill: '#34495E' }));
    g.append(svgEl('rect', { x: 2, y: 66, width: 9, height: 50, rx: 3, fill: '#34495E' }));
  }
  return g;
}

// ---------- 택시 안 ----------
/** 앞차 뒷모습 하나 */
function carAhead(g, x, y, w, body) {
  const h = w * 0.62;
  g.append(svgEl('rect', { x: x - w / 2, y: y - h * 0.55, width: w * 0.8, height: h * 0.4, rx: w * 0.1, fill: body, transform: `translate(${w * 0.1} 0)` }));
  g.append(svgEl('rect', { x: x - w * 0.34, y: y - h * 0.5, width: w * 0.68, height: h * 0.26, rx: w * 0.06, fill: '#46525E' }));
  g.append(svgEl('rect', { x: x - w / 2, y: y - h * 0.2, width: w, height: h * 0.55, rx: w * 0.08, fill: body }));
  for (const side of [-1, 1]) {
    g.append(svgEl('rect', { x: x + side * w * 0.36 - w * 0.1, y: y - h * 0.12, width: w * 0.2, height: h * 0.1, rx: 2, fill: '#C8323C' }));
  }
  g.append(svgEl('rect', { x: x - w * 0.14, y: y + h * 0.05, width: w * 0.28, height: h * 0.1, fill: '#F4F4F0', stroke: '#1F3342', 'stroke-width': 1 }));
  g.append(svgEl('rect', { x: x - w * 0.5, y: y + h * 0.33, width: w, height: h * 0.06, fill: '#1F2328' }));
}

/**
 * 택시 안 그림. 미터기 글자는 setMeter로 바꾼다.
 * @param {{reduceMotion?: boolean, meterText: string}} p
 * @returns {{svg: SVGSVGElement, setMeter: (text: string) => void}}
 */
export function taxiInteriorArt({ reduceMotion = false, meterText }) {
  const svg = svgEl('svg', { class: 'ride-car', viewBox: '0 0 800 340', role: 'img' });
  svg.setAttribute('aria-label', '택시 뒷자리에서 본 그림이에요. 앞에 운전하는 사람과 요금 미터기가 있어요.');

  // 앞 유리 너머: 하늘, 길가 건물, 찻길과 앞차들
  const clip = svgEl('clipPath', { id: 'taxi-glass' });
  clip.append(svgEl('polygon', { points: '30,30 800,30 800,170 60,160' }));
  const defs = svgEl('defs');
  defs.append(clip);
  svg.append(defs);
  const view = svgEl('g', { 'clip-path': 'url(#taxi-glass)' });
  view.append(svgEl('rect', { x: 0, y: 30, width: 800, height: 140, fill: '#D6ECF6' }));
  const buildings = svgEl('g', { class: reduceMotion ? '' : 'ride-scene-move' });
  for (let x = 0; x < 1600; x += 90) {
    const h = 30 + ((x * 7) % 45);
    buildings.append(svgEl('rect', { x, y: 108 - h, width: 70, height: h, fill: '#B9C2CA' }));
    buildings.append(svgEl('circle', { cx: x + 80, cy: 100, r: 9, fill: '#8DB872' }));
  }
  view.append(buildings);
  view.append(svgEl('polygon', { points: '0,170 800,170 800,112 0,112', fill: '#8E979F' }));
  const lane = svgEl('g', { class: reduceMotion ? '' : 'road-ahead' });
  for (const [x1, y1, x2, y2] of [
    [300, 118, 250, 150],
    [560, 118, 640, 150],
  ]) {
    lane.append(svgEl('line', { x1, y1, x2, y2, stroke: '#F2F2F2', 'stroke-width': 3, 'stroke-dasharray': '10 10' }));
  }
  view.append(lane);
  carAhead(view, 330, 120, 110, '#2E3238');
  carAhead(view, 560, 124, 120, '#C9CCCF');
  carAhead(view, 740, 116, 90, '#EDEDEA');
  svg.append(view);

  // 천장과 해 가리개, 뒷거울
  svg.append(svgEl('polygon', { points: '0,0 800,0 800,30 30,30 0,60', fill: '#CFC8BB' }));
  svg.append(svgEl('rect', { x: 330, y: 22, width: 180, height: 16, rx: 6, fill: '#BDB5A6' }));
  svg.append(svgEl('rect', { x: 620, y: 22, width: 180, height: 22, rx: 6, fill: '#BDB5A6' }));
  svg.append(svgEl('rect', { x: 598, y: 24, width: 10, height: 26, fill: '#2B2F36' }));
  svg.append(svgEl('rect', { x: 540, y: 48, width: 130, height: 34, rx: 12, fill: '#2B2F36' }));
  svg.append(svgEl('rect', { x: 548, y: 54, width: 114, height: 22, rx: 8, fill: '#9FA8B0' }));

  // 앞자리 아래와 문 안쪽
  svg.append(svgEl('polygon', { points: '0,250 800,235 800,340 0,340', fill: '#56595E' }));
  // 계기판 앞판과 길 안내 화면
  svg.append(svgEl('polygon', { points: '0,175 800,160 800,245 0,260', fill: '#3A3D42' }));
  svg.append(svgEl('polygon', { points: '0,175 800,160 800,168 0,183', fill: '#23262A' }));
  svg.append(svgEl('rect', { x: 400, y: 180, width: 190, height: 58, rx: 6, fill: '#1D1F22' }));
  svg.append(svgEl('rect', { x: 406, y: 185, width: 178, height: 48, rx: 3, fill: '#E7E4DA' }));
  for (const [x1, y1, x2, y2] of [
    [410, 200, 580, 196],
    [440, 186, 460, 232],
    [520, 186, 540, 232],
  ]) {
    svg.append(svgEl('line', { x1, y1, x2, y2, stroke: '#FFFFFF', 'stroke-width': 4 }));
  }
  svg.append(svgEl('polyline', { points: '450,230 452,200 530,198 540,188', fill: 'none', stroke: '#2F6FC0', 'stroke-width': 3 }));
  svg.append(svgEl('rect', { x: 290, y: 188, width: 100, height: 40, rx: 8, fill: '#1D1F22' }));
  svg.append(svgEl('circle', { cx: 325, cy: 210, r: 15, fill: 'none', stroke: '#5FB3D9', 'stroke-width': 3 }));
  // 가운데 받침(단추들)과 컵 자리
  svg.append(svgEl('polygon', { points: '470,245 610,242 640,340 440,340', fill: '#9DB0BF' }));
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      svg.append(svgEl('rect', { x: 472 + col * 26 - row * 4, y: 256 + row * 16, width: 18, height: 8, rx: 2, fill: '#6F8292' }));
    }
  }
  svg.append(svgEl('rect', { x: 490, y: 308, width: 90, height: 32, rx: 6, fill: '#3A3D42' }));

  // 요금 미터기(오른쪽 앞판 위): 검은 몸통에 빨간 숫자
  svg.append(svgEl('rect', { x: 652, y: 212, width: 140, height: 44, rx: 6, fill: '#1D1F22', stroke: '#55595F', 'stroke-width': 2 }));
  svg.append(svgEl('rect', { x: 660, y: 219, width: 78, height: 30, rx: 3, fill: '#0E1A12' }));
  const meter = svgEl(
    'text',
    { x: 734, y: 242, 'text-anchor': 'end', 'font-size': 20, 'font-weight': 700, 'font-family': 'monospace', fill: '#FF5A4E' },
    meterText,
  );
  svg.append(meter);
  for (let i = 0; i < 6; i++) svg.append(svgEl('rect', { x: 744 + (i % 3) * 14, y: 220 + Math.floor(i / 3) * 14, width: 10, height: 10, rx: 2, fill: '#C9CBC4' }));
  svg.append(svgEl('rect', { x: 700, y: 170, width: 34, height: 44, rx: 5, fill: '#2B2F36' }));

  // 운전대와 운전하는 사람(뒷모습)
  svg.append(svgEl('ellipse', { cx: 250, cy: 222, rx: 86, ry: 68, fill: 'none', stroke: '#CBC7C0', 'stroke-width': 16 }));
  svg.append(svgEl('ellipse', { cx: 250, cy: 236, rx: 36, ry: 26, fill: '#CBC7C0' }));
  svg.append(svgEl('path', { d: 'M40 340 C 50 250, 110 215, 190 212 C 270 212, 320 250, 330 340 Z', fill: '#6B5446' }));
  svg.append(svgEl('path', { d: 'M250 250 C 290 262, 310 300, 318 340 L 280 340 C 270 300, 255 280, 240 270 Z', fill: '#7F8FA6' }));
  svg.append(svgEl('rect', { x: 170, y: 175, width: 40, height: 45, fill: '#E4B894' }));
  svg.append(svgEl('ellipse', { cx: 188, cy: 150, rx: 50, ry: 58, fill: '#4A4744' }));
  svg.append(svgEl('ellipse', { cx: 240, cy: 160, rx: 8, ry: 14, fill: '#E4B894' }));

  // 앞자리 등받이와 머리 받침: 왼쪽(운전석)과 오른쪽 아래(옆자리)
  svg.append(svgEl('rect', { x: -30, y: 70, width: 130, height: 190, rx: 40, fill: '#D8CCB6', stroke: '#B8AA92', 'stroke-width': 3 }));
  svg.append(svgEl('rect', { x: 20, y: 255, width: 12, height: 50, fill: '#8A8F96' }));
  svg.append(svgEl('path', { d: 'M-10 340 L -10 290 C 60 280, 280 280, 360 340 Z', fill: '#D8CCB6', stroke: '#B8AA92', 'stroke-width': 3 }));
  svg.append(svgEl('path', { d: 'M680 340 C 700 300, 760 290, 800 290 L 800 340 Z', fill: '#8A8F96' }));

  return { svg, setMeter: (text) => (meter.textContent = text) };
}

// ---------- 걷기 ----------
/** 걷는 길의 소실점. 먼 것은 이 점으로 모인다. */
const WALK_VP = { x: 400, y: 125 };
/** 땅 위 점: 옆으로 떨어진 거리 side(가까운 곳 기준 픽셀)와 깊이 d(1 = 바로 앞, 0에 가까울수록 멀다) */
const ground = (side, d) => ({ x: WALK_VP.x + side * d, y: WALK_VP.y + 175 * d });
const pts = (list) => list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/** 가로수 하나(깊이 d) */
function streetTree(svg, side, d) {
  const base = ground(side, d);
  const s = d * 1.6;
  svg.append(svgEl('rect', { x: base.x - 5 * s, y: base.y - 120 * s, width: 10 * s, height: 120 * s, fill: '#6B5A48' }));
  for (const [dx, dy, r, fill] of [
    [0, -140, 42, '#5E9A4C'],
    [-30, -118, 30, '#6FAE5E'],
    [30, -120, 32, '#4F8A3F'],
    [8, -170, 28, '#7DB86A'],
  ]) {
    svg.append(svgEl('circle', { cx: base.x + dx * s, cy: base.y + dy * s, r: r * s, fill }));
  }
}

/**
 * 걷는 길 그림: 가로수 사이로 멀어지는 넓은 보도, 왼쪽 잔디와 찻길, 오른쪽 울타리 나무와 볼라드, 뒷모습으로 걷는 사람.
 * setProgress(0~1)로 사람이 앞으로 걸어가 점점 작아진다.
 * @returns {{svg: SVGSVGElement, setProgress: (t: number) => void}}
 */
export function walkSceneArt({ reduceMotion = false, shirt = '#D9CBB5' } = {}) {
  const svg = svgEl('svg', { class: 'journey-scene', viewBox: '0 0 800 300', role: 'img' });
  svg.setAttribute('aria-label', '가로수가 있는 넓은 보도를 걸어가는 뒷모습 그림이에요.');
  // 하늘과 먼 숲, 돌담
  svg.append(svgEl('rect', { x: 0, y: 0, width: 800, height: 300, fill: '#E3EEEA' }));
  svg.append(svgEl('rect', { x: 0, y: 70, width: 800, height: 60, fill: '#A9CC95' }));
  svg.append(svgEl('rect', { x: 120, y: 102, width: 220, height: 26, fill: '#B8B4A8' }));
  // 왼쪽 찻길과 앞 차들
  svg.append(svgEl('polygon', { points: pts([ground(-2000, 1), ground(-640, 1), ground(-640, 0.02), ground(-2000, 0.02)]), fill: '#8E979F' }));
  for (const d of [0.25, 0.45, 0.7]) {
    const a = ground(-1100, d);
    const b = ground(-1100, d + 0.08);
    svg.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#F2F2F2', 'stroke-width': 2 + 3 * d }));
  }
  for (const [side, d, body] of [
    [-1400, 0.3, '#F4F4F0'],
    [-900, 0.18, '#EDEDEA'],
  ]) {
    const p = ground(side, d);
    const s = d * 1.6;
    svg.append(svgEl('rect', { x: p.x - 40 * s, y: p.y - 50 * s, width: 80 * s, height: 44 * s, rx: 8 * s, fill: body, stroke: '#9AA5AE', 'stroke-width': 1 }));
    svg.append(svgEl('rect', { x: p.x - 32 * s, y: p.y - 44 * s, width: 64 * s, height: 14 * s, rx: 3 * s, fill: '#46525E' }));
    for (const dx of [-26, 26]) svg.append(svgEl('circle', { cx: p.x + dx * s, cy: p.y - 6 * s, r: 7 * s, fill: '#2B2F36' }));
  }
  // 잔디 띠와 낮은 줄 울타리
  svg.append(svgEl('polygon', { points: pts([ground(-640, 1), ground(-470, 1), ground(-470, 0.02), ground(-640, 0.02)]), fill: '#7DB35E' }));
  svg.append(svgEl('polygon', { points: pts([ground(-470, 1), ground(-455, 1), ground(-455, 0.02), ground(-470, 0.02)]), fill: '#B9B3A5' }));
  // 오른쪽 울타리 나무(낮게 다듬은 초록 줄)
  const hedgeTop = (d) => ({ x: ground(520, d).x, y: ground(520, d).y - 70 * d * 1.6 });
  svg.append(svgEl('polygon', { points: pts([ground(520, 1), ground(1400, 1), ground(1400, 0.02), ground(520, 0.02)]), fill: '#CFCBC0' }));
  svg.append(svgEl('polygon', { points: pts([ground(520, 1), hedgeTop(1), hedgeTop(0.02), ground(520, 0.02)]), fill: '#4F8A3F' }));
  // 넓은 보도와 네모 돌 줄눈
  svg.append(svgEl('polygon', { points: pts([ground(-455, 1), ground(520, 1), ground(520, 0.02), ground(-455, 0.02)]), fill: '#DCD8CF' }));
  for (let k = 0; k < 16; k++) {
    const d = 1 / (1 + 0.45 * k);
    const a = ground(-455, d);
    const b = ground(520, d);
    svg.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#BDB8AC', 'stroke-width': 1 + d }));
  }
  for (let side = -380; side < 520; side += 75) {
    const a = ground(side, 1);
    const b = ground(side, 0.02);
    svg.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#BDB8AC', 'stroke-width': 1 }));
  }
  // 먼 곳의 파란 표지판
  const sign = ground(260, 0.12);
  svg.append(svgEl('rect', { x: sign.x - 1.5, y: sign.y - 60, width: 3, height: 60, fill: '#8A8F96' }));
  svg.append(svgEl('rect', { x: sign.x - 9, y: sign.y - 64, width: 18, height: 16, fill: '#FFFFFF', stroke: '#2F6FC0', 'stroke-width': 3 }));
  // 가로수, 가로등, 볼라드: 먼 것부터
  for (const d of [0.08, 0.13, 0.2, 0.32, 0.55, 1.05]) {
    streetTree(svg, -520, d);
    streetTree(svg, 470, d);
  }
  for (const d of [0.1, 0.18, 0.3, 0.5, 0.9]) {
    const p = ground(420, d);
    const s = d * 1.6;
    svg.append(svgEl('rect', { x: p.x - 5 * s, y: p.y - 30 * s, width: 10 * s, height: 30 * s, rx: 4 * s, fill: '#8A8F96' }));
  }
  for (const d of [0.16, 0.4, 0.95]) {
    const p = ground(-440, d);
    const s = d * 1.6;
    svg.append(svgEl('rect', { x: p.x - 4 * s, y: p.y - 170 * s, width: 8 * s, height: 170 * s, fill: '#2B2F36' }));
  }

  // 뒷모습으로 걷는 사람: 긴 머리, 어깨에 멘 가방
  const who = svgEl('g');
  const body = svgEl('g', { class: reduceMotion ? '' : 'journey-walker' });
  body.append(svgEl('rect', { x: -10, y: -58, width: 9, height: 58, rx: 3, fill: '#1F2328', class: 'leg-a' }));
  body.append(svgEl('rect', { x: 1, y: -58, width: 9, height: 58, rx: 3, fill: '#1F2328', class: 'leg-b' }));
  body.append(svgEl('rect', { x: -17, y: -112, width: 34, height: 58, rx: 10, fill: shirt, stroke: '#1F3342', 'stroke-width': 1.2 }));
  body.append(svgEl('rect', { x: -22, y: -108, width: 7, height: 44, rx: 3, fill: shirt, stroke: '#1F3342', 'stroke-width': 1 }));
  body.append(svgEl('rect', { x: 15, y: -108, width: 7, height: 44, rx: 3, fill: shirt, stroke: '#1F3342', 'stroke-width': 1 }));
  body.append(svgEl('line', { x1: 12, y1: -110, x2: 20, y2: -74, stroke: '#1F2328', 'stroke-width': 2.5 }));
  body.append(svgEl('rect', { x: 14, y: -80, width: 14, height: 22, rx: 5, fill: '#2B3440' }));
  body.append(svgEl('ellipse', { cx: 0, cy: -124, rx: 12, ry: 13, fill: '#2A2320' }));
  body.append(svgEl('rect', { x: -12, y: -124, width: 24, height: 28, rx: 8, fill: '#2A2320' }));
  who.append(body);
  svg.append(who);
  const setProgress = (t) => {
    // 가까운 곳(d 0.95)에서 조금 먼 곳(d 0.55)까지 걸어간다.
    const d = 0.95 - 0.4 * Math.min(1, Math.max(0, t));
    const p = ground(-20, d);
    who.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${(d * 1.75).toFixed(3)})`);
  };
  setProgress(0);
  return { svg, setProgress };
}
