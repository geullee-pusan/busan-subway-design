// 기차 실내 그림(통로 가운데에서 앞을 보는 모습)과 창밖 풍경.
// 사진(위키미디어 공용, data/SOURCES.md)을 보고 종류마다 다르게 새로 그렸다.
import { lookOf } from './train-art.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * 실내 모양. seat: 좌석 색, seatDark: 좌석 아래쪽, cover: 머리받침 덮개(없으면 null), pattern: 좌석 무늬,
 * cushion: 앉는 자리 색, wall/ceiling/floor, windows: 'each' | 'band', screen: 등받이 화면, curtain: 커튼,
 * reverseRows: 거꾸로 놓인 줄(원조 KTX는 돌지 않는 좌석이라 객차 절반이 역방향), display: 앞쪽 안내 화면 모양
 */
export const INTERIOR = {
  // KTX: 짙은 남회색 등받이, 흰 머리 덮개, 등받이 뒤에 안내 종이와 검은 그물 주머니, 짙은 회청색 바닥
  KTX: { seat: '#2B3140', seatDark: '#1F232E', cover: '#E6E6E2', net: true, pattern: null, cushion: '#2B3140', wall: '#E9E8E4', ceiling: '#F1F1EE', floor: '#3E4550', windows: 'small', screen: false, curtain: false, reverseRows: true, display: 'led' },
  // KTX-산천: 동그라미 잔무늬가 있는 회색 좌석, 흰 머리 덮개, 등받이 뒤 아래쪽은 밝은 판에 그물 주머니와 안내 종이,
  // 연한 분홍빛 벽, 베이지색 바닥, 창 위 가리개, 은은한 연두빛 선반 불빛, 천장 영상 화면
  'KTX-산천': { seat: '#9EA4AA', seatDark: '#878D93', cover: '#F2F3F4', coverShort: true, shellLower: '#E3E5E7', net: true, netFill: '#5B6055', glow: '#DCEFE2', rackGlow: '#CFEBDD', pattern: 'rings', patternColor: '#BAC0C5', cushion: '#AEB4B9', wall: '#EDE6E1', ceiling: '#F6F4F2', floor: '#CBB89F', windows: 'small', screen: false, curtain: 'blind', reverseRows: false, display: 'lcd' },
  // KTX-청룡: 베이지색 판 등받이(위에 회색 천과 흰 덮개, 가운데 잡지 주머니), 줄무늬 천장, 짐 선반 아래 민트빛 불빛, 좌석마다 창
  'KTX-청룡': { shell: '#D6CEBF', shellEdge: '#A99F8E', magazine: true, seat: '#8E9298', seatDark: '#7A7E84', cover: '#F1F1EE', pattern: null, cushion: '#A8A091', wall: '#EEF0EE', ceiling: '#E9EAE7', ceilingRibs: true, rackGlow: '#A8E3D0', floor: '#B19C7C', windows: 'each', screen: false, curtain: false, reverseRows: false, display: 'lcd', glow: '#BFE3D2' },
  // KTX-이음: 흰빛 판 등받이를 파란 천이 위와 옆으로 감싸고, 가운데 잡지 주머니, 짙은 남색 바닥, 짐 선반 아래 민트빛 불빛, 좌석마다 창
  'KTX-이음': { shell: '#E6E5E1', shellEdge: '#B9B8B3', shellInset: 0.05, magazine: true, door: '#4A3B31', doorArrows: true, seat: '#2F4FA8', seatDark: '#243F88', cover: null, pattern: null, cushion: '#2F5BA8', wall: '#EEF0F2', ceiling: '#F3F4F4', ceilingRibs: true, rackGlow: '#B5E8D8', floor: '#2C3550', windows: 'each', screen: false, curtain: false, reverseRows: false, display: 'lcd' },
  // ITX-새마을: 남색 천에 가는 빨강·회청색 물결 줄, 앞면에 산호색 머리 베개, 등받이 뒤 아래쪽에 검은 주머니
  'ITX-새마을': { seat: '#23264F', seatDark: '#1A1C3E', cover: '#EE7766', coverFrontOnly: true, pocket: '#15171C', pattern: 'waves', patternColor: '#E0453A', patternColor2: '#7D86A8', cushion: '#23264F', wall: '#EFEFEF', ceiling: '#FBFBFB', floor: '#5E6268', windows: 'band', screen: false, curtain: false, reverseRows: false, display: 'lcd' },
  'ITX-마음': { seat: '#3D403E', seatDark: '#2C2F2D', cover: null, pattern: 'line', patternColor: '#D2232A', cushion: '#3D403E', wall: '#ECECEA', ceiling: '#F8F8F6', floor: '#6E726E', windows: 'band', screen: false, curtain: false, reverseRows: false, display: 'lcd' },
  // 누리로: 남색 천에 노랑·파랑·빨강 잔점, 길게 덮은 연회색 덮개, 위에 검은 손잡이, 회색 바닥, 창 가리개
  누리로: { seat: '#1F2550', seatDark: '#171B3E', cover: '#D8D9DB', coverTall: true, knob: true, pattern: 'confetti', patternColors: ['#E5C34A', '#5C8FD6', '#D9534F', '#EDEDED'], cushion: '#1F2550', wall: '#F2F3F4', ceiling: '#F7F8F9', floor: '#5E6064', windows: 'band', screen: false, curtain: 'blind', reverseRows: false, display: 'lcd' },
  // 무궁화호: 남색 바탕에 잔무늬 좌석, 등받이 뒤는 밝은 회색 껍데기(그물 주머니, 위 손잡이),
  // 밝은 회색 벽, 창 위에 말아 올린 회색 가리개, 짐 선반 아래 청록색 띠
  무궁화호: { shell: '#C9CCD1', seat: '#26337A', seatDark: '#1C275F', cover: '#F4F4F2', pattern: 'sprinkle', patternColor: '#8FA8E0', cushion: '#26337A', wall: '#ECEEEE', ceiling: '#F6F7F7', floor: '#8E9296', windows: 'band', screen: false, curtain: 'blind', trim: '#2E9C8A', reverseRows: false, display: 'led' },
  새마을호: { seat: '#2A2F5A', seatDark: '#1E2246', cover: null, pattern: 'stripes', patternColor: '#B0305A', cushion: '#2A2F5A', wall: '#EFEFEF', ceiling: '#FBFBFB', floor: '#7D8086', windows: 'band', screen: false, curtain: false, reverseRows: false, display: 'lcd' },
  '종류 모름': { seat: '#5D6670', seatDark: '#4A525B', cover: null, pattern: null, cushion: '#5D6670', wall: '#EEEEEE', ceiling: '#FAFAFA', floor: '#8A8D91', windows: 'band', screen: false, curtain: false, reverseRows: false, display: 'led' },
};
export const interiorOf = (kind) => INTERIOR[kind] ?? INTERIOR['종류 모름'];

// 원근: 눈높이 0, 소실점 (400, 128). 가로 x(m), 세로 y(m, 아래가 +), 깊이 z(m)
const F = 470;
const VX = 400;
const VY = 128;
const P = (x, y, z) => [VX + (x * F) / z, VY + (y * F) / z];
const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const quad = (a, b, c, d) => pts([a, b, c, d]);

const HALF = 1.45; // 객실 반 너비
const FLOOR = 1.1;
const CEIL = -1.05;
const WIN_TOP = -0.62;
const WIN_BOTTOM = 0.12;
const NEAR = 1.05;
const FAR = 13;

/**
 * 창밖 풍경 한 벌(가로 800, 지평선이 y=0). 먼 산, 가운데(땅과 건물), 가까운 것(전깃줄 기둥, 다리)을 나눈다.
 * 창마다 깊이에 맞게 줄여 쓰고, 층마다 흐르는 빠르기를 다르게 해 입체감을 낸다.
 * scene: city | field | mountain | river | sea | tunnel | station
 * @returns {{sky: string, far: SVGElement[], mid: SVGElement[], near: SVGElement[]}}
 */
function outsideLayers(scene) {
  const far = [];
  const mid = [];
  const near = [];
  if (scene === 'tunnel') {
    for (let x = 40; x < 800; x += 200) mid.push(svgEl('rect', { x, y: 0, width: 60, height: 6, rx: 3, fill: '#F2C76B', opacity: 0.85 }));
    for (let x = 0; x < 800; x += 100) near.push(svgEl('rect', { x, y: -400, width: 14, height: 800, fill: '#22272C' }));
    return { sky: '#15181B', far, mid, near };
  }
  const sky = scene === 'sea' ? '#BFE0F2' : '#CFE6F4';
  // 먼 산(아주 천천히 흐른다)
  far.push(svgEl('path', { d: scene === 'sea' ? 'M0 0 Q150 -14 300 -4 T600 -6 T800 0 L800 400 L0 400 Z' : 'M0 0 Q100 -60 200 -10 T400 -20 T600 -30 T800 0 L800 400 L0 400 Z', fill: '#9DB7A0' }));
  if (scene === 'sea') {
    mid.push(svgEl('rect', { x: 0, y: 0, width: 800, height: 400, fill: '#3F84B8' }));
    for (let x = 20; x < 800; x += 70) mid.push(svgEl('path', { d: `M${x} ${50 + (x % 3) * 18} q10 -6 20 0`, stroke: '#DDF0FA', fill: 'none', 'stroke-width': 2 }));
  } else if (scene === 'river') {
    mid.push(svgEl('rect', { x: 0, y: 10, width: 800, height: 400, fill: '#4F8DB5' }));
    for (let x = 30; x < 800; x += 90) mid.push(svgEl('path', { d: `M${x} ${40 + (x % 4) * 14} q12 -5 24 0`, stroke: '#CFE6F4', fill: 'none', 'stroke-width': 2 }));
    // 다리 트러스(가까이 휙휙 지나간다)
    for (let x = 0; x < 800; x += 100) near.push(svgEl('path', { d: `M${x} -90 L${x + 50} 150 M${x + 100} -90 L${x + 50} 150`, stroke: '#7C8A96', 'stroke-width': 7 }));
    near.push(svgEl('rect', { x: 0, y: -94, width: 800, height: 8, fill: '#7C8A96' }));
  } else if (scene === 'mountain') {
    mid.push(svgEl('path', { d: 'M0 50 Q120 -80 260 30 Q380 -60 520 40 Q660 -90 800 50 L800 400 L0 400 Z', fill: '#5E8F5C' }));
    for (let x = 30; x < 800; x += 60) mid.push(svgEl('path', { d: `M${x} 100 l12 -34 l12 34 Z`, fill: '#3E6E41' }));
  } else if (scene === 'city' || scene === 'station') {
    mid.push(svgEl('rect', { x: 0, y: 70, width: 800, height: 400, fill: '#8F969C' }));
    for (let x = 0; x < 800; x += 46) {
      const h = 60 + ((x * 37) % 110);
      mid.push(svgEl('rect', { x, y: 80 - h, width: 40, height: h + 110, fill: ['#A7B0BA', '#BBC2C9', '#929BA6'][x % 3] }));
      for (let wy = 90 - h; wy < 70; wy += 16) mid.push(svgEl('rect', { x: x + 8, y: wy, width: 6, height: 7, fill: '#E8EEF4' }));
    }
    if (scene === 'station') mid.push(svgEl('rect', { x: 0, y: 80, width: 800, height: 400, fill: '#C9C4BA' }));
  } else {
    // 들판: 논과 밭, 나무
    mid.push(svgEl('rect', { x: 0, y: 20, width: 800, height: 400, fill: '#9CC46A' }));
    for (let y = 35; y < 400; y += 22) mid.push(svgEl('line', { x1: 0, y1: y, x2: 800, y2: y, stroke: '#B9D68A', 'stroke-width': 3 }));
    for (let x = 50; x < 800; x += 140) {
      mid.push(svgEl('rect', { x: x + 6, y: 40, width: 5, height: 20, fill: '#6B4A2F' }));
      mid.push(svgEl('circle', { cx: x + 8, cy: 34, r: 13, fill: '#4F8A4A' }));
    }
  }
  // 전깃줄 기둥과 전깃줄(선로 바로 옆이라 가장 빨리 지나간다)
  if (scene !== 'station') {
    for (let x = 0; x < 800; x += 200) near.push(svgEl('rect', { x, y: -180, width: 9, height: 600, fill: '#6E7880' }));
    near.push(svgEl('line', { x1: 0, y1: -150, x2: 800, y2: -150, stroke: '#5A636B', 'stroke-width': 1.5 }));
  }
  return { sky, far, mid, near };
}

/** 색을 밝게(f > 1) 또는 어둡게(f < 1) */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('')}`;
}

// 좌석을 그리는 동안 쓰는 그림 도구(그라데이션, 잘라 내기). trainInteriorArt가 정한다.
let paint = null;

/** 위가 밝고 아래가 어두운 천 그라데이션 */
function fabric(color) {
  if (!paint.cache.has(color)) {
    const id = `${paint.uid}-g${paint.cache.size}`;
    const g = svgEl('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    g.append(svgEl('stop', { offset: 0, 'stop-color': shade(color, 1.18) }), svgEl('stop', { offset: 0.45, 'stop-color': color }), svgEl('stop', { offset: 1, 'stop-color': shade(color, 0.72) }));
    paint.defs.append(g);
    paint.cache.set(color, `url(#${id})`);
  }
  return paint.cache.get(color);
}

/** 둥근 네모(같은 깊이 z 위의 면은 화면에서 곧은 네모가 된다) */
function roundRect(x0, y0, x1, y1, z, attrs, round = 0.16) {
  const [ax, ay] = P(x0, y0, z);
  const [bx, by] = P(x1, y1, z);
  const w = bx - ax;
  return svgEl('rect', { x: ax, y: ay, width: w, height: by - ay, rx: w * round, ry: w * round, ...attrs });
}

/**
 * 등받이 모양: 어깨까지는 곧고, 위로 갈수록 살짝 좁아져 둥근 머리받침이 된다.
 * @returns {string} SVG path
 */
function seatOutline(x0, x1, top, bottom, z) {
  const [l, t] = P(x0, top, z);
  const [r, b] = P(x1, bottom, z);
  const w = r - l;
  const h = b - t;
  const sh = t + h * 0.34; // 어깨 높이
  const n = w * 0.07; // 머리받침이 좁아지는 만큼
  const c = w * 0.16; // 위 모서리 둥글기
  const f = (v) => v.toFixed(1);
  return [
    `M${f(l)},${f(b - w * 0.04)}`,
    `L${f(l)},${f(sh)}`,
    `C${f(l)},${f(sh - h * 0.08)} ${f(l + n)},${f(sh - h * 0.1)} ${f(l + n)},${f(t + c)}`,
    `Q${f(l + n)},${f(t)} ${f(l + n + c)},${f(t)}`,
    `L${f(r - n - c)},${f(t)}`,
    `Q${f(r - n)},${f(t)} ${f(r - n)},${f(t + c)}`,
    `C${f(r - n)},${f(sh - h * 0.1)} ${f(r)},${f(sh - h * 0.08)} ${f(r)},${f(sh)}`,
    `L${f(r)},${f(b - w * 0.04)}`,
    `Q${f(r)},${f(b)} ${f(r - w * 0.04)},${f(b)}`,
    `L${f(l + w * 0.04)},${f(b)}`,
    `Q${f(l)},${f(b)} ${f(l)},${f(b - w * 0.04)}Z`,
  ].join(' ');
}

/** 등받이가 둥글게 보이도록 양옆을 어둡게 하는 덧칠(한 번만 만든다) */
function roundness() {
  if (!paint.round) {
    const id = `${paint.uid}-round`;
    const g = svgEl('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 0 });
    g.append(
      svgEl('stop', { offset: 0, 'stop-color': '#000000', 'stop-opacity': 0.32 }),
      svgEl('stop', { offset: 0.18, 'stop-color': '#000000', 'stop-opacity': 0.05 }),
      svgEl('stop', { offset: 0.5, 'stop-color': '#FFFFFF', 'stop-opacity': 0.08 }),
      svgEl('stop', { offset: 0.82, 'stop-color': '#000000', 'stop-opacity': 0.05 }),
      svgEl('stop', { offset: 1, 'stop-color': '#000000', 'stop-opacity': 0.32 }),
    );
    paint.defs.append(g);
    paint.round = `url(#${id})`;
  }
  return paint.round;
}

/**
 * 좌석 하나(앞을 보는 좌석의 등받이, 또는 거꾸로 놓인 좌석의 앞면).
 * 등받이는 두께가 있는 판이라 통로 쪽 옆면과 윗면이 보이고, 팔걸이와 앉는 자리 옆이 통로 쪽으로 보인다.
 */
function seat(svg, look, x0, x1, z, reverse) {
  const back = reverse ? z + 0.05 : z;
  // 등받이는 눈높이보다 낮다(통로에 서서 보는 눈높이). 위쪽이 0.18, 아래쪽이 0.95
  const top = 0.18;
  const bottom = 0.95;
  const depth = 0.16; // 등받이 두께
  // 통로 쪽 옆(통로 옆 좌석만 옆면이 보인다. 창가 좌석의 옆은 이웃 좌석에 가린다)
  const aisleSeat = Math.min(Math.abs(x0), Math.abs(x1)) < 0.5;
  const aisle = (x0 + x1) / 2 > 0 ? x0 : x1;
  const frame = look.shell ? look.seat : look.seatDark;
  const arm = look.arm ?? (look.shell ? shade(look.shell, 0.8) : shade(look.seatDark, 0.85));

  // 바닥 그림자
  const [sx, sy] = P((x0 + x1) / 2, FLOOR, z + 0.35);
  const sw = P(x1, FLOOR, z + 0.35)[0] - P(x0, FLOOR, z + 0.35)[0];
  svg.append(svgEl('ellipse', { cx: sx, cy: sy, rx: sw * 0.55, ry: Math.max(1, sw * 0.08), fill: '#000000', opacity: 0.18 }));

  // 앉는 자리 옆과 팔걸이(통로 쪽). 앞을 보는 좌석은 등받이 너머, 거꾸로 놓인 좌석은 등받이 앞(보는 사람 쪽)에 있다.
  const near = reverse ? z - 0.5 : back + depth;
  const far = reverse ? back : back + 0.62;
  const drawSide = () => {
    if (!aisleSeat) return;
    svg.append(svgEl('polygon', { points: quad(P(aisle, 0.6, near), P(aisle, 0.6, far), P(aisle, 0.78, far), P(aisle, 0.78, near)), fill: shade(look.cushion, 0.7) }));
    svg.append(svgEl('polygon', { points: quad(P(aisle, 0.78, near + 0.08), P(aisle, 0.78, far - 0.1), P(aisle, FLOOR, far - 0.1), P(aisle, FLOOR, near + 0.08)), fill: '#3A3D42', opacity: 0.55 }));
    const armX = aisle + (aisle === x0 ? -0.02 : 0.02);
    svg.append(svgEl('polygon', { points: quad(P(armX, 0.5, near), P(armX, 0.5, far), P(armX, 0.56, far), P(armX, 0.56, near)), fill: arm, stroke: shade(arm, 0.7), 'stroke-width': 0.4 }));
    svg.append(svgEl('polygon', { points: quad(P(armX, 0.56, near + 0.05), P(armX, 0.56, near + 0.12), P(armX, 0.64, near + 0.12), P(armX, 0.64, near + 0.05)), fill: shade(arm, 0.75) }));
  };
  // 등받이 통로 쪽 옆면과 윗면
  const drawSlab = () => {
    if (aisleSeat) svg.append(svgEl('polygon', { points: quad(P(aisle, top + 0.05, back), P(aisle, top + 0.05, back + depth), P(aisle, bottom, back + depth), P(aisle, bottom, back)), fill: shade(frame, 0.62) }));
    svg.append(svgEl('polygon', { points: quad(P(x0 + 0.07, top, back), P(x1 - 0.07, top, back), P(x1 - 0.07, top, back + depth), P(x0 + 0.07, top, back + depth)), fill: shade(frame, 1.25) }));
  };

  if (reverse) {
    // 앞면이 보인다: 등받이 앞면, 앉는 자리, 머리 덮개. 팔걸이는 보는 사람 쪽에 있어 나중에 그린다.
    drawSlab();
    svg.append(roundRect(x0, top, x1, bottom, back, { fill: fabric(look.seat), stroke: shade(look.seat, 0.5), 'stroke-width': 0.8 }));
    svg.append(svgEl('polygon', { points: quad(P(x0 + 0.02, 0.62, back), P(x1 - 0.02, 0.62, back), P(x1 - 0.02, 0.68, z - 0.45), P(x0 + 0.02, 0.68, z - 0.45)), fill: fabric(look.cushion), stroke: shade(look.cushion, 0.5), 'stroke-width': 0.6 }));
    svg.append(roundRect(x0 + 0.05, top, x1 - 0.05, top + 0.2, back, { fill: look.cover ?? shade(look.seat, 0.85), opacity: 0.95 }, 0.08));
    drawSide();
    return;
  }

  drawSide();
  drawSlab();
  // 등받이 뒷면(둥근 모서리, 위가 밝은 천)
  const outline = seatOutline(x0, x1, top, bottom, back);
  svg.append(svgEl('path', { d: outline, fill: fabric(frame), stroke: shade(frame, 0.45), 'stroke-width': 0.8 }));
  const clipId = `${paint.uid}-s${paint.seats++}`;
  const clip = svgEl('clipPath', { id: clipId });
  clip.append(svgEl('path', { d: outline }));
  paint.defs.append(clip);
  const face = svgEl('g', { 'clip-path': `url(#${clipId})` });
  svg.append(face);

  if (look.shell) {
    // 판 등받이: 가장자리로 천(좌석 색)이 조금 보인다
    const inset = look.shellInset ?? 0.025;
    face.append(roundRect(x0 + inset, top + (look.shellInset ? 0.05 : 0), x1 - inset, bottom - 0.02, back, { fill: fabric(look.shell), stroke: look.shellEdge ?? '#8E939A', 'stroke-width': 0.6 }, 0.12));
    if (look.magazine) {
      // 위 가장자리 회색 천과 흰 덮개, 가운데 잡지(흰 표지에 빨간 그림), 아래 안내 카드
      if (!look.shellInset) face.append(svgEl('polygon', { points: quad(P(x0 + 0.04, top, back), P(x1 - 0.04, top, back), P(x1 - 0.04, top + 0.04, back), P(x0 + 0.04, top + 0.04, back)), fill: look.seat }));
      if (look.cover) face.append(svgEl('polygon', { points: quad(P(x0 + 0.1, top, back), P(x1 - 0.1, top, back), P(x1 - 0.1, top + 0.05, back), P(x0 + 0.1, top + 0.05, back)), fill: look.cover }));
      face.append(roundRect(x0 + 0.07, 0.36, x1 - 0.07, 0.9, back, { fill: shade(look.shell, 0.94), stroke: look.shellEdge, 'stroke-width': 0.6 }, 0.06));
      const m0 = P(x0 + 0.13, 0.4, back);
      const m1 = P(x1 - 0.13, 0.66, back);
      face.append(svgEl('rect', { x: m0[0], y: m0[1], width: m1[0] - m0[0], height: m1[1] - m0[1], fill: '#F7F7F5', stroke: '#9A9A96', 'stroke-width': 0.4 }));
      const mw = m1[0] - m0[0];
      const mh = m1[1] - m0[1];
      // 잡지 표지: 위에 제목, 아래에 빨간 그림
      face.append(svgEl('rect', { x: m0[0], y: m0[1] + mh * 0.45, width: mw, height: mh * 0.55, fill: '#7FB3DD' }));
      face.append(svgEl('polygon', { points: `${m0[0]},${m1[1]} ${m1[0]},${m1[1]} ${m0[0] + mw * 0.75},${m0[1] + mh * 0.5}`, fill: '#D8262E' }));
      if (mw > 12) face.append(svgEl('text', { x: m0[0] + mw * 0.5, y: m0[1] + mh * 0.3, 'font-size': mw * 0.26, 'font-weight': 800, 'font-style': 'italic', 'text-anchor': 'middle', fill: '#1E3A78' }, 'KTX'));
      const k0 = P(x0 + 0.16, 0.7, back);
      const k1 = P(x1 - 0.16, 0.86, back);
      face.append(svgEl('rect', { x: k0[0], y: k0[1], width: k1[0] - k0[0], height: k1[1] - k0[1], fill: '#2C2E33' }));
      // 안내 카드의 흰 글줄
      for (let i = 0; i < 3; i++) face.append(svgEl('rect', { x: k0[0] + (k1[0] - k0[0]) * 0.12, y: k0[1] + (k1[1] - k0[1]) * (0.25 + 0.22 * i), width: (k1[0] - k0[0]) * (i === 2 ? 0.5 : 0.76), height: Math.max(0.5, (k1[1] - k0[1]) * 0.07), fill: '#D9DADC' }));
      face.append(svgEl('rect', { x: P(x0, top, back)[0], y: P(x0, top, back)[1], width: P(x1, top, back)[0] - P(x0, top, back)[0], height: P(x0, bottom, back)[1] - P(x0, top, back)[1], fill: roundness() }));
      return;
    }
    // 그물 주머니와 위 명판, 손잡이
    face.append(roundRect(x0 + 0.09, 0.6, x1 - 0.09, 0.85, back, { fill: '#7C8188', stroke: '#5E636A', 'stroke-width': 0.5, opacity: 0.85 }, 0.05));
    face.append(svgEl('polygon', { points: quad(P(x0 + 0.17, 0.3, back), P(x1 - 0.17, 0.3, back), P(x1 - 0.17, 0.34, back), P(x0 + 0.17, 0.34, back)), fill: '#FFFFFF', stroke: '#6E737A', 'stroke-width': 0.4 }));
    face.append(svgEl('rect', { x: P(x0, top, back)[0], y: P(x0, top, back)[1], width: P(x1, top, back)[0] - P(x0, top, back)[0], height: P(x0, bottom, back)[1] - P(x0, top, back)[1], fill: roundness() }));
    svg.append(roundRect(x0 + 0.12, top - 0.05, x1 - 0.12, top + 0.01, back, { fill: '#6E737A' }, 0.08));
    return;
  }
  // 천 등받이: 가운데가 조금 볼록하게 보이도록 안쪽 판을 하나 더 그린다
  face.append(svgEl('path', { d: seatOutline(x0 + 0.03, x1 - 0.03, top + 0.03, bottom - 0.04, back), fill: fabric(look.seat) }));
  // 무늬
  const [ax, ay] = P(x0, top, back);
  const [cx, cy] = P(x1, bottom, back);
  const w = cx - ax;
  const h = cy - ay;
  if (look.pattern === 'stripes') {
    for (let k = 1; k < 5; k++) face.append(svgEl('line', { x1: ax + 2, y1: ay + (h * k) / 5, x2: cx - 2, y2: ay + (h * k) / 5 + h * 0.05, stroke: look.patternColor, 'stroke-width': Math.max(0.6, w * 0.02) }));
  } else if (look.pattern === 'dots') {
    for (let k = 0; k < 6; k++) face.append(svgEl('circle', { cx: ax + w * (0.2 + 0.12 * k), cy: ay + h * (0.4 + 0.1 * (k % 3)), r: Math.max(0.5, w * 0.025), fill: look.patternColor }));
  } else if (look.pattern === 'waves') {
    // 가는 물결 줄: 비스듬히 길게 휘어진 빨강 줄이 많고, 회청색 줄이 사이사이
    for (let k = 0; k < 9; k++) {
      const y0 = ay + h * (0.18 + 0.085 * k);
      const tilt = h * (k % 2 ? 0.08 : -0.05);
      const d = `M${(ax + 1).toFixed(1)},${y0.toFixed(1)} C${(ax + w * 0.35).toFixed(1)},${(y0 - h * 0.07).toFixed(1)} ${(ax + w * 0.65).toFixed(1)},${(y0 + h * 0.08 + tilt).toFixed(1)} ${(cx - 1).toFixed(1)},${(y0 + tilt).toFixed(1)}`;
      face.append(svgEl('path', { d, fill: 'none', stroke: k % 3 === 1 ? look.patternColor2 : look.patternColor, 'stroke-width': Math.max(0.5, w * (k % 3 === 1 ? 0.01 : 0.018)) }));
    }
  } else if (look.pattern === 'rings') {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) face.append(svgEl('circle', { cx: ax + w * (0.25 + 0.25 * i), cy: ay + h * (0.45 + 0.13 * j), r: Math.max(0.6, w * 0.06), fill: 'none', stroke: look.patternColor, 'stroke-width': Math.max(0.4, w * 0.012) }));
  } else if (look.pattern === 'confetti') {
    for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) face.append(svgEl('circle', { cx: ax + w * (0.12 + 0.19 * i + (j % 2) * 0.08), cy: ay + h * (0.3 + 0.11 * j), r: Math.max(0.5, w * 0.022), fill: look.patternColors[(i * 3 + j * 2) % look.patternColors.length] }));
  } else if (look.pattern === 'sprinkle') {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) face.append(svgEl('circle', { cx: ax + w * (0.18 + 0.21 * i + (j % 2) * 0.1), cy: ay + h * (0.3 + 0.13 * j), r: Math.max(0.4, w * 0.018), fill: look.patternColor }));
  } else if (look.pattern === 'diamonds') {
    for (let k = 0; k < 4; k++) face.append(svgEl('rect', { x: ax + w * (0.2 + 0.18 * k), y: ay + h * 0.5, width: w * 0.08, height: w * 0.08, fill: look.patternColor, transform: `rotate(45 ${ax + w * (0.24 + 0.18 * k)} ${ay + h * 0.54})` }));
  } else if (look.pattern === 'line') {
    face.append(svgEl('line', { x1: ax + 2, y1: ay + h * 0.32, x2: cx - 2, y2: ay + h * 0.32, stroke: look.patternColor, 'stroke-width': Math.max(0.8, w * 0.03) }));
  }
  // 등받이 뒤 주머니(ITX-새마을: 반짝이는 검은 주머니)
  if (look.pocket) {
    face.append(roundRect(x0 + 0.08, 0.6, x1 - 0.08, 0.9, back, { fill: look.pocket, stroke: '#000000', 'stroke-width': 0.5 }, 0.06));
    face.append(svgEl('polygon', { points: quad(P(x0 + 0.1, 0.62, back), P(x1 - 0.1, 0.62, back), P(x1 - 0.1, 0.65, back), P(x0 + 0.1, 0.65, back)), fill: '#5A5F6A' }));
  }
  // 등받이 뒤 아래쪽 밝은 판(KTX-산천)
  if (look.shellLower) face.append(roundRect(x0 + 0.08, 0.5, x1 - 0.08, 0.93, back, { fill: fabric(look.shellLower), stroke: '#A9AEB3', 'stroke-width': 0.5 }, 0.08));
  // 그물 주머니(KTX, KTX-산천): 검은 그물 안에 잡지, 위에 열차 이름이 적힌 안내 종이
  if (look.net) {
    const [nx0, ny0] = P(x0 + 0.1, 0.57, back);
    const [nx1, ny1] = P(x1 - 0.1, 0.9, back);
    face.append(svgEl('rect', { x: nx0, y: ny0, width: nx1 - nx0, height: ny1 - ny0, fill: look.netFill ?? '#8A6A55' }));
    const step = Math.max(2, (nx1 - nx0) / 7);
    for (let t = -(ny1 - ny0); t < nx1 - nx0; t += step) {
      face.append(svgEl('line', { x1: nx0 + Math.max(0, t), y1: ny0 + Math.max(0, -t), x2: nx0 + Math.min(nx1 - nx0, t + (ny1 - ny0)), y2: ny0 + Math.min(ny1 - ny0, nx1 - nx0 - t), stroke: '#111111', 'stroke-width': 0.6 }));
      face.append(svgEl('line', { x1: nx1 - Math.max(0, t), y1: ny0 + Math.max(0, -t), x2: nx1 - Math.min(nx1 - nx0, t + (ny1 - ny0)), y2: ny0 + Math.min(ny1 - ny0, nx1 - nx0 - t), stroke: '#111111', 'stroke-width': 0.6 }));
    }
    face.append(svgEl('rect', { x: nx0, y: ny0, width: nx1 - nx0, height: ny1 - ny0, fill: 'none', stroke: '#111111', 'stroke-width': 0.8 }));
    const [lx0, ly0] = P(x0 + 0.13, 0.4, back);
    const [lx1, ly1] = P(x1 - 0.13, 0.6, back);
    face.append(svgEl('rect', { x: lx0, y: ly0, width: lx1 - lx0, height: ly1 - ly0, fill: '#F4F4F2', stroke: '#B9BCC0', 'stroke-width': 0.4 }));
    const bw = (lx1 - lx0) * 0.42;
    face.append(svgEl('rect', { x: (lx0 + lx1) / 2 - bw / 2, y: ly0 + (ly1 - ly0) * 0.2, width: bw, height: (ly1 - ly0) * 0.32, fill: '#1E2A44' }));
    if (bw > 14) face.append(svgEl('text', { x: (lx0 + lx1) / 2, y: ly0 + (ly1 - ly0) * 0.46, 'font-size': bw * 0.32, 'font-weight': 800, 'text-anchor': 'middle', fill: '#FFFFFF' }, 'KTX'));
  }
  // 등받이 화면(청룡)
  if (look.screen) face.append(svgEl('polygon', { points: quad(P(x0 + 0.1, 0.42, back), P(x1 - 0.1, 0.42, back), P(x1 - 0.1, 0.6, back), P(x0 + 0.1, 0.6, back)), fill: '#2B4A6B', stroke: '#11161C', 'stroke-width': 0.5 }));
  // 둥근 느낌(양옆 그늘)과 머리받침·허리 바느질 선
  const [fl, ft] = P(x0, top, back);
  const [fr, fb] = P(x1, bottom, back);
  if (!look.shell) {
    for (const k of [0.3, 0.62]) face.append(svgEl('line', { x1: fl + 2, y1: ft + (fb - ft) * k, x2: fr - 2, y2: ft + (fb - ft) * k, stroke: '#000000', 'stroke-opacity': 0.22, 'stroke-width': Math.max(0.5, (fr - fl) * 0.012) }));
  }
  face.append(svgEl('rect', { x: fl, y: ft, width: fr - fl, height: fb - ft, fill: roundness() }));
  // 등받이 위 손잡이(누리로)
  if (look.knob) {
    const [kx, ky] = P((x0 + x1) / 2, top - 0.03, back);
    const kw = P(x1, top, back)[0] - P(x0, top, back)[0];
    svg.append(svgEl('ellipse', { cx: kx, cy: ky, rx: Math.max(1, kw * 0.09), ry: Math.max(1, kw * 0.06), fill: '#222428' }));
  }
  // 머리 덮개: 등받이 윗면을 넘어 뒤로 걸쳐진다(앞면에만 있는 베개는 뒤에서 보이지 않는다)
  if (look.cover && !look.coverFrontOnly) {
    const coverH = look.coverShort ? 0.1 : look.coverTall ? 0.3 : 0.2;
    svg.append(svgEl('polygon', { points: quad(P(x0 + 0.07, top, back), P(x1 - 0.07, top, back), P(x1 - 0.07, top, back + depth), P(x0 + 0.07, top, back + depth)), fill: shade(look.cover, 1.05) }));
    svg.append(roundRect(x0 + 0.07, top, x1 - 0.07, top + coverH, back, { fill: look.cover, stroke: shade(look.cover, 0.8), 'stroke-width': 0.4 }, 0.04));
  }
}

/**
 * 기차 실내.
 * @returns {{svg: SVGSVGElement, setScene: (s: string) => void, setSpeed: (kmh: number) => void, setDisplay: (lines: string[]) => void}}
 */
export function trainInteriorArt({ kind, reduceMotion = false }) {
  const look = interiorOf(kind);
  const outer = lookOf(kind);
  const svg = svgEl('svg', { class: 'ride-car tr-interior', viewBox: '0 0 800 340', role: 'img' });
  svg.setAttribute('aria-label', `${kind ?? '기차'} 안 그림이에요. 가운데 통로 양쪽에 좌석이 있고, 창밖 풍경이 지나가요.`);
  const uid = `tr${Math.floor(performance.now() * 1000) % 1e9}`;
  const defs = svgEl('defs');
  svg.append(defs);
  paint = { defs, uid, cache: new Map(), seats: 0 };

  // 창밖(창 모양으로 잘라 보인다)
  // 창밖: 창마다 따로 그린다. 지평선은 모든 창에서 눈높이에 있고, 먼 창일수록 풍경이 작고 느리게 지나간다(원근).
  // 풍경은 세 층(먼 산, 가운데, 가까운 기둥)으로 나눠 가까운 것일수록 빨리 흐르게 한다.
  // 앞을 보고 달리므로 왼쪽 창은 왼쪽으로, 오른쪽 창은 오른쪽으로 흐른다(오른쪽은 좌우로 뒤집는다).
  // 풍경 한 벌은 defs에 한 번만 두고 창마다 <use>로 불러 쓴다.
  const outsideRoot = svgEl('g');
  svg.append(outsideRoot);
  const skyRect = svgEl('rect', { id: `${uid}-sky`, x: -4000, y: -4000, width: 8000, height: 8000 });
  const layerDefs = { far: svgEl('g', { id: `${uid}-far` }), mid: svgEl('g', { id: `${uid}-mid` }), near: svgEl('g', { id: `${uid}-near` }) };
  defs.append(skyRect, layerDefs.far, layerDefs.mid, layerDefs.near);
  const LAYER_TIME = { far: 8, mid: 1.6, near: 0.7 }; // 한 바퀴 도는 시간의 배수(작을수록 빠르다)
  const movers = [];
  let windowCount = 0;
  const addWindow = (side, glassPoints, zc) => {
    const id = `${uid}-w${windowCount++}`;
    const shape = svgEl('clipPath', { id });
    shape.append(svgEl('polygon', { points: glassPoints }));
    defs.append(shape);
    const win = svgEl('g', { 'clip-path': `url(#${id})` });
    win.append(svgEl('use', { href: `#${uid}-sky` }));
    const scale = 1.8 / zc;
    // 풍경의 지평선은 창 가운데보다 조금 아래(어림: 눈높이보다 0.25m 위로 보이게 해 창에 땅과 하늘이 함께 보인다)
    const [cx, hy] = P(side * (HALF + GLASS), -0.25, zc);
    for (const layer of ['far', 'mid', 'near']) {
      const place = svgEl('g', { transform: `translate(${cx.toFixed(1)} ${hy.toFixed(1)}) scale(${(side < 0 ? scale : -scale).toFixed(3)} ${scale.toFixed(3)})` });
      const mover = svgEl('g', { class: reduceMotion ? '' : 'tr-outside-move' });
      for (const x of [-800, 0, 800]) mover.append(svgEl('use', { href: `#${uid}-${layer}`, x }));
      place.append(mover);
      win.append(place);
      movers.push({ mover, factor: LAYER_TIME[layer] });
    }
    outsideRoot.append(win);
  };

  // ---- 객실 몸통 ----
  // 단면(바깥에서 안으로): 바닥 → 아래 벽(난방 틈) → 창 띠(창은 벽보다 조금 바깥에 있어 창틀 두께가 보인다)
  // → 창 위 벽 → 짐 선반(밑면에 불빛, 좌석마다 독서등) → 선반 위 벽 → 둥근 불빛 홈 → 천장(가운데 조명, 바람 구멍)
  const RACK_Y = -0.74; // 짐 선반 밑면 높이
  const RACK_X = 1.06; // 짐 선반 앞 끝(통로 쪽)
  const COVE_Y = -0.93; // 선반 위 벽이 천장으로 꺾이는 높이
  const CEIL_X = 1.0; // 천장 가운데 판의 끝
  const GLASS = 0.07; // 창 유리가 벽보다 바깥에 있는 만큼
  const sideWall = (side, y0, y1, fill, zFrom = NEAR, zTo = FAR) =>
    svgEl('polygon', { points: quad(P(side * HALF, y0, zFrom), P(side * HALF, y1, zFrom), P(side * HALF, y1, zTo), P(side * HALF, y0, zTo)), fill });

  // 벽 빛: 가까운 쪽이 밝고 먼 쪽(가운데)이 조금 어둡다
  const wallGrads = new Map();
  const wallGrad = (side) => {
    if (wallGrads.has(side)) return wallGrads.get(side);
    const id = `${uid}-wall${side}`;
    const g = svgEl('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: side < 0 ? 0 : 800, y1: 0, x2: VX, y2: 0 });
    g.append(svgEl('stop', { offset: 0, 'stop-color': shade(look.wall, 1.06) }), svgEl('stop', { offset: 1, 'stop-color': shade(look.wall, 0.86) }));
    defs.append(g);
    wallGrads.set(side, `url(#${id})`);
    return wallGrads.get(side);
  };
  const floorGrad = (() => {
    const id = `${uid}-floor`;
    const g = svgEl('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 340, x2: 0, y2: VY });
    g.append(svgEl('stop', { offset: 0, 'stop-color': shade(look.floor, 1.1) }), svgEl('stop', { offset: 1, 'stop-color': shade(look.floor, 0.7) }));
    defs.append(g);
    return `url(#${id})`;
  })();
  const ceilGrad = (() => {
    const id = `${uid}-ceil`;
    const g = svgEl('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 0, y2: VY });
    g.append(svgEl('stop', { offset: 0, 'stop-color': shade(look.ceiling, 1.02) }), svgEl('stop', { offset: 1, 'stop-color': shade(look.ceiling, 0.88) }));
    defs.append(g);
    return `url(#${id})`;
  })();

  // 천장 가운데 판, 둥근 불빛 홈, 선반 위 벽
  svg.append(svgEl('polygon', { points: quad(P(-CEIL_X, CEIL, NEAR), P(CEIL_X, CEIL, NEAR), P(CEIL_X, CEIL, FAR), P(-CEIL_X, CEIL, FAR)), fill: ceilGrad }));
  for (const side of [-1, 1]) {
    const cove = look.coveGlow ?? '#FFFDF6';
    svg.append(svgEl('polygon', { points: quad(P(side * CEIL_X, CEIL, NEAR), P(side * HALF, COVE_Y, NEAR), P(side * HALF, COVE_Y, FAR), P(side * CEIL_X, CEIL, FAR)), fill: cove }));
    // 불빛 홈의 그늘진 가장자리
    svg.append(svgEl('polygon', { points: quad(P(side * CEIL_X, CEIL, NEAR), P(side * (CEIL_X + 0.05), CEIL + 0.015, NEAR), P(side * (CEIL_X + 0.05), CEIL + 0.015, FAR), P(side * CEIL_X, CEIL, FAR)), fill: shade(look.ceiling, 0.8) }));
    svg.append(sideWall(side, COVE_Y, RACK_Y - 0.06, wallGrad(side)));
  }
  // 천장 가운데: 줄무늬 판(청룡·이음) 또는 이어진 조명, 바람 구멍
  if (look.ceilingRibs) {
    for (let z = NEAR + 0.3; z < FAR; z += 0.3) svg.append(svgEl('line', { x1: P(-CEIL_X, CEIL, z)[0], y1: P(-CEIL_X, CEIL, z)[1], x2: P(CEIL_X, CEIL, z)[0], y2: P(CEIL_X, CEIL, z)[1], stroke: shade(look.ceiling, 0.82), 'stroke-width': 1 }));
  } else {
    for (let z = NEAR + 0.4; z < FAR - 0.6; z += 1.6) {
      for (const side of [-1, 1]) svg.append(svgEl('polygon', { points: quad(P(side * 0.42, CEIL, z), P(side * 0.7, CEIL, z), P(side * 0.7, CEIL, z + 1.2), P(side * 0.42, CEIL, z + 1.2)), fill: look.glow ?? '#FFFFFF', stroke: shade(look.ceiling, 0.85), 'stroke-width': 0.6 }));
    }
  }
  svg.append(svgEl('polygon', { points: quad(P(-0.12, CEIL, NEAR), P(0.12, CEIL, NEAR), P(0.12, CEIL, FAR), P(-0.12, CEIL, FAR)), fill: shade(look.ceiling, 0.9) }));
  for (let z = NEAR + 0.6; z < FAR; z += 0.5) svg.append(svgEl('line', { x1: P(-0.1, CEIL, z)[0], y1: P(-0.1, CEIL, z)[1], x2: P(0.1, CEIL, z)[0], y2: P(0.1, CEIL, z)[1], stroke: shade(look.ceiling, 0.7), 'stroke-width': 0.8 }));
  // 천장 스피커
  for (let z = 2.5; z < FAR; z += 3.2) {
    const [cx, cy] = P(-0.75, CEIL, z);
    svg.append(svgEl('ellipse', { cx, cy, rx: 60 / z, ry: 12 / z, fill: shade(look.ceiling, 0.75) }));
  }

  // 바닥: 카펫과 가운데 통로 깔개
  svg.append(svgEl('polygon', { points: quad(P(-HALF, FLOOR, NEAR), P(HALF, FLOOR, NEAR), P(HALF, FLOOR, FAR), P(-HALF, FLOOR, FAR)), fill: floorGrad }));
  svg.append(svgEl('polygon', { points: quad(P(-0.34, FLOOR, NEAR), P(0.34, FLOOR, NEAR), P(0.34, FLOOR, FAR), P(-0.34, FLOOR, FAR)), fill: shade(look.floor, 0.85) }));
  for (const x of [-0.34, 0.34]) svg.append(svgEl('line', { x1: P(x, FLOOR, NEAR)[0], y1: P(x, FLOOR, NEAR)[1], x2: P(x, FLOOR, FAR)[0], y2: P(x, FLOOR, FAR)[1], stroke: shade(look.floor, 1.25), 'stroke-width': 1.2 }));

  // 아래 벽(창 아래)과 난방 틈
  for (const side of [-1, 1]) {
    svg.append(sideWall(side, WIN_BOTTOM, FLOOR, wallGrad(side)));
    svg.append(sideWall(side, 0.94, 1.04, shade(look.wall, 0.55)));
    for (let z = NEAR; z < FAR; z += 0.25) svg.append(svgEl('line', { x1: P(side * HALF, 0.94, z)[0], y1: P(side * HALF, 0.94, z)[1], x2: P(side * HALF, 1.04, z)[0], y2: P(side * HALF, 1.04, z)[1], stroke: shade(look.wall, 0.35), 'stroke-width': 0.6 }));
    svg.append(sideWall(side, 1.04, FLOOR, shade(look.floor, 0.6)));
    // 창 아래 턱(창턱)
    svg.append(svgEl('polygon', { points: quad(P(side * HALF, WIN_BOTTOM, NEAR), P(side * (HALF - 0.08), WIN_BOTTOM + 0.02, NEAR), P(side * (HALF - 0.08), WIN_BOTTOM + 0.02, FAR), P(side * HALF, WIN_BOTTOM, FAR)), fill: shade(look.wall, 1.08), stroke: shade(look.wall, 0.75), 'stroke-width': 0.5 }));
    // 창 위 벽
    svg.append(sideWall(side, RACK_Y, WIN_TOP, wallGrad(side)));
  }

  // 창: 좌석마다 따로(청룡, 이음), 작은 창(KTX, 산천), 이어진 창 띠(나머지).
  // 유리는 벽보다 바깥에 있어 창틀 두께(위, 아래, 먼 쪽 옆)가 보인다.
  const paneLen = look.windows === 'band' ? 2.4 : look.windows === 'each' ? 0.75 : 1.4;
  const paneGap = look.windows === 'band' ? 0.18 : look.windows === 'each' ? 0.3 : 0.35;
  for (const side of [-1, 1]) {
    const xw = side * HALF;
    const xg = side * (HALF + GLASS);
    // 첫 창 앞 벽 조각
    svg.append(svgEl('polygon', { points: quad(P(xw, WIN_TOP, NEAR), P(xw, WIN_BOTTOM, NEAR), P(xw, WIN_BOTTOM, NEAR + 0.2), P(xw, WIN_TOP, NEAR + 0.2)), fill: wallGrad(side) }));
    for (let z = NEAR + 0.2; z < FAR - 0.5; z += paneLen + paneGap) {
      const z1 = Math.min(FAR - 0.4, z + paneLen);
      // 유리 모서리는 둥글다(벽 면 위에서 네 모서리를 작은 호로 잇는다)
      const r = 0.1;
      const corners = [
        [WIN_TOP + r, z + r, Math.PI, 1.5 * Math.PI],
        [WIN_TOP + r, z1 - r, 1.5 * Math.PI, 2 * Math.PI],
        [WIN_BOTTOM - r, z1 - r, 0, 0.5 * Math.PI],
        [WIN_BOTTOM - r, z + r, 0.5 * Math.PI, Math.PI],
      ];
      const ring = [];
      for (const [cy, cz, t0, t1] of corners) {
        for (let k = 0; k <= 5; k++) {
          const t = t0 + ((t1 - t0) * k) / 5;
          ring.push(P(xg, cy + r * Math.sin(t), cz + r * Math.cos(t)));
        }
      }
      const glass = pts(ring);
      addWindow(side, glass, (z + z1) / 2);
      // 유리 비침(엷은 빛)
      svg.append(svgEl('polygon', { points: glass, fill: '#FFFFFF', opacity: 0.08 }));
      // 창틀 두께: 위(그늘), 아래(밝음), 먼 쪽 옆
      svg.append(svgEl('polygon', { points: quad(P(xw, WIN_TOP, z), P(xg, WIN_TOP, z), P(xg, WIN_TOP, z1), P(xw, WIN_TOP, z1)), fill: shade(look.wall, 0.72) }));
      svg.append(svgEl('polygon', { points: quad(P(xw, WIN_BOTTOM, z), P(xg, WIN_BOTTOM, z), P(xg, WIN_BOTTOM, z1), P(xw, WIN_BOTTOM, z1)), fill: shade(look.wall, 1.1) }));
      svg.append(svgEl('polygon', { points: quad(P(xw, WIN_TOP, z1), P(xg, WIN_TOP, z1), P(xg, WIN_BOTTOM, z1), P(xw, WIN_BOTTOM, z1)), fill: shade(look.wall, 0.82) }));
      // 고무 틀
      svg.append(svgEl('polygon', { points: glass, fill: 'none', stroke: '#4A4F55', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }));
      // 창 사이 기둥 벽(이음매 선)
      const z2 = Math.min(FAR - 0.4, z1 + paneGap);
      svg.append(svgEl('polygon', { points: quad(P(xw, WIN_TOP, z1), P(xw, WIN_BOTTOM, z1), P(xw, WIN_BOTTOM, z2), P(xw, WIN_TOP, z2)), fill: wallGrad(side) }));
      svg.append(svgEl('line', { x1: P(xw, RACK_Y, (z1 + z2) / 2)[0], y1: P(xw, RACK_Y, (z1 + z2) / 2)[1], x2: P(xw, 0.94, (z1 + z2) / 2)[0], y2: P(xw, 0.94, (z1 + z2) / 2)[1], stroke: shade(look.wall, 0.8), 'stroke-width': 0.6 }));
      // 가리개: 말아 올린 가리개(위 띠) 또는 옆 커튼
      if (look.curtain === 'blind') svg.append(svgEl('polygon', { points: quad(P(xg, WIN_TOP, z), P(xg, WIN_TOP + 0.13, z), P(xg, WIN_TOP + 0.13, z1), P(xg, WIN_TOP, z1)), fill: '#C3C7CA', stroke: '#9AA0A6', 'stroke-width': 0.6 }));
      else if (look.curtain) svg.append(svgEl('polygon', { points: quad(P(xw, WIN_TOP, z), P(xw, WIN_BOTTOM - 0.25, z), P(xw, WIN_BOTTOM - 0.25, z + 0.25), P(xw, WIN_TOP, z + 0.25)), fill: '#C9B98F', opacity: 0.9 }));
    }
    // 마지막 창 뒤 벽 조각
    svg.append(svgEl('polygon', { points: quad(P(xw, WIN_TOP, FAR - 0.5), P(xw, WIN_BOTTOM, FAR - 0.5), P(xw, WIN_BOTTOM, FAR), P(xw, WIN_TOP, FAR)), fill: wallGrad(side) }));
  }

  // 짐 선반: 밑면(불빛 띠), 앞 끝 테, 좌석마다 독서등과 바람 구멍
  for (const side of [-1, 1]) {
    svg.append(svgEl('polygon', { points: quad(P(side * HALF, RACK_Y, NEAR), P(side * RACK_X, RACK_Y, NEAR), P(side * RACK_X, RACK_Y, FAR), P(side * HALF, RACK_Y, FAR)), fill: shade(look.ceiling, 0.92) }));
    svg.append(svgEl('polygon', { points: quad(P(side * (HALF - 0.04), RACK_Y, NEAR), P(side * (HALF - 0.1), RACK_Y, NEAR), P(side * (HALF - 0.1), RACK_Y, FAR), P(side * (HALF - 0.04), RACK_Y, FAR)), fill: look.rackGlow ?? '#FFFFFF', opacity: 0.9 }));
    for (let z = 2.1; z < FAR - 0.5; z += 0.95) {
      const [px, py] = P(side * (RACK_X + 0.12), RACK_Y, z);
      svg.append(svgEl('ellipse', { cx: px, cy: py, rx: 22 / z, ry: 7 / z, fill: '#3B3F45' }));
      const [lx, ly] = P(side * (RACK_X + 0.12), RACK_Y, z + 0.3);
      svg.append(svgEl('ellipse', { cx: lx, cy: ly, rx: 9 / z, ry: 4 / z, fill: '#FFF6D8', stroke: '#8E939A', 'stroke-width': 0.4 }));
    }
    svg.append(svgEl('polygon', { points: quad(P(side * RACK_X, RACK_Y - 0.08, NEAR), P(side * RACK_X, RACK_Y, NEAR), P(side * RACK_X, RACK_Y, FAR), P(side * RACK_X, RACK_Y - 0.08, FAR)), fill: shade(look.wall, 0.9), stroke: shade(look.wall, 0.65), 'stroke-width': 0.5 }));
    if (look.trim) svg.append(svgEl('polygon', { points: quad(P(side * RACK_X, RACK_Y - 0.03, NEAR), P(side * RACK_X, RACK_Y, NEAR), P(side * RACK_X, RACK_Y, FAR), P(side * RACK_X, RACK_Y - 0.03, FAR)), fill: look.trim }));
    // 짐 선반 위 가방 몇 개(늘 같은 자리)
    for (const z of [3.2, 6.1, 9.4]) {
      const zz = side < 0 ? z : z + 1.3;
      svg.append(svgEl('polygon', { points: quad(P(side * (RACK_X + 0.05), RACK_Y - 0.08, zz), P(side * (RACK_X + 0.05), RACK_Y - 0.2, zz), P(side * (RACK_X + 0.05), RACK_Y - 0.2, zz + 0.45), P(side * (RACK_X + 0.05), RACK_Y - 0.08, zz + 0.45)), fill: ['#5A6B7D', '#8A5A44', '#4C5A4A'][Math.round(z) % 3] }));
    }
  }

  // 앞쪽 끝 벽: 벽, 문틀, 문(위에 유리), 문 위 안내 화면과 비상구 표시
  const endTL = P(-HALF, CEIL, FAR);
  const endBR = P(HALF, FLOOR, FAR);
  svg.append(svgEl('rect', { x: endTL[0], y: endTL[1], width: endBR[0] - endTL[0], height: endBR[1] - endTL[1], fill: shade(look.wall, 0.95), stroke: '#A3A8AD', 'stroke-width': 1 }));
  const frame = [P(-0.48, -0.66, FAR), P(0.48, FLOOR, FAR)];
  svg.append(svgEl('rect', { x: frame[0][0], y: frame[0][1], width: frame[1][0] - frame[0][0], height: frame[1][1] - frame[0][1], fill: shade(look.wall, 0.7) }));
  const door = [P(-0.38, -0.58, FAR), P(0.38, FLOOR, FAR)];
  svg.append(svgEl('rect', { x: door[0][0], y: door[0][1], width: door[1][0] - door[0][0], height: door[1][1] - door[0][1], fill: look.door ?? '#B9C1C8', stroke: '#7F878E' }));
  if (!look.doorArrows) {
    const g0 = P(-0.26, -0.48, FAR);
    const g1 = P(0.26, 0.05, FAR);
    svg.append(svgEl('rect', { x: g0[0], y: g0[1], width: g1[0] - g0[0], height: g1[1] - g0[1], rx: 2, fill: '#5E6A75', stroke: '#3A4048', 'stroke-width': 0.6 }));
    svg.append(svgEl('rect', { x: g0[0] + 2, y: g0[1] + 2, width: (g1[0] - g0[0]) * 0.3, height: g1[1] - g0[1] - 4, fill: '#FFFFFF', opacity: 0.15 }));
  }
  const sign0 = P(-0.36, -0.8, FAR);
  const sign1 = P(0.36, -0.68, FAR);
  svg.append(svgEl('rect', { x: sign0[0], y: sign0[1], width: sign1[0] - sign0[0], height: sign1[1] - sign0[1], fill: '#15181C' }));
  svg.append(svgEl('rect', { x: sign0[0] + 2, y: sign0[1] + 1.5, width: (sign1[0] - sign0[0]) * 0.55, height: sign1[1] - sign0[1] - 3, fill: look.display === 'lcd' ? '#3B6E9E' : '#C8501E', opacity: 0.85 }));
  const exit0 = P(0.62, -0.62, FAR);
  const exit1 = P(0.86, -0.5, FAR);
  svg.append(svgEl('rect', { x: exit0[0], y: exit0[1], width: exit1[0] - exit0[0], height: exit1[1] - exit0[1], fill: '#1E9E5A' }));
  if (look.doorArrows) {
    // 문 가운데 흰 화살표 띠(KTX-이음)
    const [dx0, dy0] = door[0];
    const [dx1, dy1] = door[1];
    const cy = dy0 + (dy1 - dy0) * 0.55;
    const hh = (dy1 - dy0) * 0.05;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const x = dx0 + ((dx1 - dx0) * (i + 0.3)) / n;
      const ww = ((dx1 - dx0) / n) * 0.5;
      svg.append(svgEl('polygon', { points: `${x},${cy - hh} ${x + ww},${cy - hh} ${x + ww * 1.5},${cy} ${x + ww},${cy + hh} ${x},${cy + hh} ${x + ww * 0.5},${cy}`, fill: '#F2F2F2' }));
    }
  }
  // 안내 화면: 가까이 크게 보이도록 천장에 단다(z=4)
  const s0 = P(-1.0, -0.98, 4);
  const s1 = P(1.0, -0.58, 4);
  for (const x of [-0.6, 0.6]) {
    const [hx, hy] = P(x, CEIL, 4);
    svg.append(svgEl('rect', { x: hx - 2, y: hy, width: 4, height: s0[1] - hy, fill: '#8E939A' }));
  }
  svg.append(svgEl('rect', { x: s0[0] - 3, y: s0[1] - 3, width: s1[0] - s0[0] + 6, height: s1[1] - s0[1] + 6, rx: 5, fill: '#C9CDD1', stroke: '#8E939A', 'stroke-width': 1 }));
  svg.append(svgEl('rect', { x: s0[0], y: s0[1], width: s1[0] - s0[0], height: s1[1] - s0[1], rx: 3, fill: look.display === 'lcd' ? '#0F1E2E' : '#111111', stroke: '#2B2F35', 'stroke-width': 2 }));
  const displayText = svgEl('text', { x: (s0[0] + s1[0]) / 2, y: (s0[1] + s1[1]) / 2 + 5, 'font-size': 15, 'font-weight': 700, 'text-anchor': 'middle', fill: look.display === 'lcd' ? '#FFFFFF' : '#FF8A3D' });
  svg.append(displayText);
  // 좌석: 먼 줄부터 그린다. 원조 KTX는 객차 앞쪽 절반이 거꾸로 놓여 있다.
  const rows = [];
  for (let z = FAR - 1; z >= 2.1; z -= 0.95) rows.push(z);
  rows.forEach((z, i) => {
    // 먼 쪽 절반 줄이 거꾸로 놓여 앞면(앉는 자리)이 보인다.
    const reverse = look.reverseRows && i < rows.length / 2;
    // 창가 좌석을 먼저, 통로 옆 좌석을 나중에 그린다(통로 옆 좌석의 옆면이 앞에 보인다)
    for (const [x0, x1] of [
      [-1.38, -0.92],
      [-0.9, -0.44],
      [0.92, 1.38],
      [0.44, 0.9],
    ]) {
      seat(svg, look, x0, x1, z, reverse);
    }
  });
  // 차체 색 띠(문 위): 무슨 열차인지 한눈에
  svg.append(svgEl('rect', { x: 0, y: 0, width: 800, height: 6, fill: outer.accent }));

  let scene = null;
  const api = {
    svg,
    setScene(next) {
      if (next === scene) return;
      scene = next;
      const layers = outsideLayers(next);
      skyRect.setAttribute('fill', layers.sky);
      for (const layer of ['far', 'mid', 'near']) layerDefs[layer].replaceChildren(...layers[layer]);
    },
    setSpeed(kmh) {
      // 빠를수록 창밖이 빨리 지나간다. 서 있으면 멈춘다.
      if (reduceMotion) return;
      const seconds = kmh < 3 ? 0 : Math.max(0.35, 60 / Math.max(10, kmh));
      for (const { mover, factor } of movers) {
        mover.style.animationDuration = seconds ? `${(seconds * factor).toFixed(2)}s` : '0s';
        mover.style.animationPlayState = seconds ? 'running' : 'paused';
      }
    },
    setDisplay(lines) {
      displayText.replaceChildren();
      lines.forEach((line, k) => {
        const t = svgEl('tspan', { x: displayText.getAttribute('x'), dy: k === 0 ? (lines.length > 1 ? -9 : 0) : 19 }, line);
        displayText.append(t);
      });
    },
  };
  api.setScene('station');
  api.setSpeed(0);
  return api;
}
