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
  'KTX-산천': { seat: '#9EA4AA', seatDark: '#878D93', cover: '#F2F3F4', coverShort: true, shellLower: '#E3E5E7', net: true, netFill: '#5B6055', glow: '#DCEFE2', pattern: 'rings', patternColor: '#BAC0C5', cushion: '#AEB4B9', wall: '#EDE6E1', ceiling: '#F6F4F2', floor: '#CBB89F', windows: 'small', screen: false, curtain: 'blind', reverseRows: false, display: 'lcd' },
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

/** 창밖 풍경(평평한 그림 두 장을 이어 왼쪽으로 흘린다). scene: city | field | mountain | river | sea | tunnel | station */
function outsideStrip(scene) {
  const g = svgEl('g', { class: 'tr-outside-strip' });
  for (const offset of [0, 800]) {
    const part = svgEl('g', { transform: `translate(${offset} 0)` });
    if (scene === 'tunnel') {
      part.append(svgEl('rect', { x: 0, y: 0, width: 800, height: 340, fill: '#15181B' }));
      for (let x = 40; x < 800; x += 200) part.append(svgEl('rect', { x, y: 150, width: 60, height: 6, rx: 3, fill: '#F2C76B', opacity: 0.85 }));
    } else {
      const sky = scene === 'sea' ? '#BFE0F2' : '#CFE6F4';
      part.append(svgEl('rect', { x: 0, y: 0, width: 800, height: 340, fill: sky }));
      // 먼 산
      part.append(svgEl('path', { d: 'M0 150 Q100 90 200 140 T400 130 T600 120 T800 150 L800 340 L0 340 Z', fill: '#9DB7A0' }));
      if (scene === 'sea') {
        part.append(svgEl('rect', { x: 0, y: 150, width: 800, height: 190, fill: '#3F84B8' }));
        for (let x = 20; x < 800; x += 70) part.append(svgEl('path', { d: `M${x} ${200 + (x % 3) * 18} q10 -6 20 0`, stroke: '#DDF0FA', fill: 'none', 'stroke-width': 2 }));
      } else if (scene === 'river') {
        part.append(svgEl('rect', { x: 0, y: 160, width: 800, height: 180, fill: '#4F8DB5' }));
        // 다리 트러스(가까이 휙휙 지나간다)
        for (let x = 0; x < 800; x += 100) {
          part.append(svgEl('path', { d: `M${x} 60 L${x + 50} 300 M${x + 100} 60 L${x + 50} 300`, stroke: '#7C8A96', 'stroke-width': 7 }));
        }
        part.append(svgEl('rect', { x: 0, y: 56, width: 800, height: 8, fill: '#7C8A96' }));
      } else if (scene === 'mountain') {
        part.append(svgEl('path', { d: 'M0 200 Q120 70 260 180 Q380 90 520 190 Q660 60 800 200 L800 340 L0 340 Z', fill: '#5E8F5C' }));
        for (let x = 30; x < 800; x += 60) part.append(svgEl('path', { d: `M${x} 250 l12 -34 l12 34 Z`, fill: '#3E6E41' }));
      } else if (scene === 'city' || scene === 'station') {
        for (let x = 0; x < 800; x += 46) {
          const h = 60 + ((x * 37) % 110);
          part.append(svgEl('rect', { x, y: 230 - h, width: 40, height: h + 110, fill: ['#A7B0BA', '#BBC2C9', '#929BA6'][x % 3] }));
          for (let wy = 240 - h; wy < 220; wy += 16) part.append(svgEl('rect', { x: x + 8, y: wy, width: 6, height: 7, fill: '#E8EEF4' }));
        }
        if (scene === 'station') part.append(svgEl('rect', { x: 0, y: 230, width: 800, height: 110, fill: '#C9C4BA' }));
      } else {
        // 들판: 논과 밭, 나무
        part.append(svgEl('rect', { x: 0, y: 170, width: 800, height: 170, fill: '#9CC46A' }));
        for (let y = 185; y < 340; y += 22) part.append(svgEl('line', { x1: 0, y1: y, x2: 800, y2: y, stroke: '#B9D68A', 'stroke-width': 3 }));
        for (let x = 50; x < 800; x += 140) {
          part.append(svgEl('rect', { x: x + 6, y: 190, width: 5, height: 20, fill: '#6B4A2F' }));
          part.append(svgEl('circle', { cx: x + 8, cy: 184, r: 13, fill: '#4F8A4A' }));
        }
      }
      // 전깃줄 기둥(전철화된 선로 옆)
      for (let x = 0; x < 800; x += 160) part.append(svgEl('rect', { x, y: 40, width: 5, height: 300, fill: '#6E7880' }));
    }
    g.append(part);
  }
  return g;
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
  const clip = svgEl('clipPath', { id: `${uid}-win` });
  defs.append(clip);
  svg.append(defs);
  paint = { defs, uid, cache: new Map(), seats: 0 };

  // 창밖(창 모양으로 잘라 보인다)
  const outside = svgEl('g', { 'clip-path': `url(#${uid}-win)` });
  const mover = svgEl('g', { class: reduceMotion ? '' : 'tr-outside-move' });
  outside.append(mover);
  svg.append(outside);

  // 벽, 천장, 바닥(창 자리는 뚫어 둔다: 창 위아래로 벽을 칠한다)
  svg.append(svgEl('polygon', { points: quad(P(-HALF, CEIL, NEAR), P(HALF, CEIL, NEAR), P(HALF, CEIL, FAR), P(-HALF, CEIL, FAR)), fill: look.ceiling }));
  svg.append(svgEl('polygon', { points: quad(P(-HALF, FLOOR, NEAR), P(HALF, FLOOR, NEAR), P(HALF, FLOOR, FAR), P(-HALF, FLOOR, FAR)), fill: look.floor }));
  for (const side of [-1, 1]) {
    const x = side * HALF;
    svg.append(svgEl('polygon', { points: quad(P(x, CEIL, NEAR), P(x, WIN_TOP, NEAR), P(x, WIN_TOP, FAR), P(x, CEIL, FAR)), fill: look.wall }));
    svg.append(svgEl('polygon', { points: quad(P(x, WIN_BOTTOM, NEAR), P(x, FLOOR, NEAR), P(x, FLOOR, FAR), P(x, WIN_BOTTOM, FAR)), fill: look.wall }));
  }
  // 창: 좌석마다 따로(청룡, 이음), 작은 창(KTX, 산천), 이어진 창 띠(나머지)
  const paneLen = look.windows === 'band' ? 2.4 : look.windows === 'each' ? 0.75 : 1.4;
  const paneGap = look.windows === 'band' ? 0.18 : look.windows === 'each' ? 0.3 : 0.35;
  for (const side of [-1, 1]) {
    const x = side * HALF;
    for (let z = NEAR + 0.2; z < FAR - 0.5; z += paneLen + paneGap) {
      const z1 = Math.min(FAR - 0.4, z + paneLen);
      const shape = quad(P(x, WIN_TOP, z), P(x, WIN_BOTTOM, z), P(x, WIN_BOTTOM, z1), P(x, WIN_TOP, z1));
      clip.append(svgEl('polygon', { points: shape }));
      // 창 사이 벽
      const z2 = Math.min(FAR - 0.4, z1 + paneGap);
      svg.append(svgEl('polygon', { points: quad(P(x, WIN_TOP, z1), P(x, WIN_BOTTOM, z1), P(x, WIN_BOTTOM, z2), P(x, WIN_TOP, z2)), fill: look.wall }));
      svg.append(svgEl('polygon', { points: shape, fill: 'none', stroke: '#9AA0A6', 'stroke-width': 1 }));
      if (look.curtain === 'blind') svg.append(svgEl('polygon', { points: quad(P(x, WIN_TOP, z), P(x, WIN_TOP + 0.12, z), P(x, WIN_TOP + 0.12, z1), P(x, WIN_TOP, z1)), fill: '#BFC3C6', stroke: '#9AA0A6', 'stroke-width': 0.6 }));
      else if (look.curtain) svg.append(svgEl('polygon', { points: quad(P(x, WIN_TOP, z), P(x, WIN_BOTTOM - 0.25, z), P(x, WIN_BOTTOM - 0.25, z + 0.25), P(x, WIN_TOP, z + 0.25)), fill: '#C9B98F', opacity: 0.9 }));
    }
  }
  // 줄무늬 천장(KTX-청룡)
  if (look.ceilingRibs) {
    for (let z = NEAR + 0.3; z < FAR; z += 0.35) svg.append(svgEl('line', { x1: P(-0.95, CEIL, z)[0], y1: P(-0.95, CEIL, z)[1], x2: P(0.95, CEIL, z)[0], y2: P(0.95, CEIL, z)[1], stroke: '#C9CBC7', 'stroke-width': 1 }));
  }
  // 짐 선반 아래 불빛(KTX-청룡: 민트빛)
  if (look.rackGlow) {
    for (const side of [-1, 1]) svg.append(svgEl('polygon', { points: quad(P(side * HALF, -0.74, NEAR), P(side * 1.05, -0.7, NEAR), P(side * 1.05, -0.7, FAR), P(side * HALF, -0.74, FAR)), fill: look.rackGlow, opacity: 0.8 }));
  }
  // 짐 선반
  for (const side of [-1, 1]) {
    svg.append(svgEl('polygon', { points: quad(P(side * HALF, -0.78, NEAR), P(side * 1.05, -0.74, NEAR), P(side * 1.05, -0.74, FAR), P(side * HALF, -0.78, FAR)), fill: '#C9CCCF', opacity: 0.9 }));
    if (look.trim) svg.append(svgEl('polygon', { points: quad(P(side * 1.05, -0.74, NEAR), P(side * 1.05, -0.69, NEAR), P(side * 1.05, -0.69, FAR), P(side * 1.05, -0.74, FAR)), fill: look.trim }));
  }
  // 천장 불빛(청룡은 은은한 초록빛 띠)
  for (const side of [-1, 1]) {
    svg.append(svgEl('polygon', { points: quad(P(side * 0.5, CEIL, NEAR), P(side * 0.62, CEIL, NEAR), P(side * 0.62, CEIL, FAR), P(side * 0.5, CEIL, FAR)), fill: look.glow ?? '#FFFFFF' }));
  }
  // 앞쪽 끝 벽, 문, 안내 화면
  const endTL = P(-HALF, CEIL, FAR);
  const endBR = P(HALF, FLOOR, FAR);
  svg.append(svgEl('rect', { x: endTL[0], y: endTL[1], width: endBR[0] - endTL[0], height: endBR[1] - endTL[1], fill: look.wall, stroke: '#A3A8AD', 'stroke-width': 1 }));
  const door = [P(-0.38, -0.55, FAR), P(0.38, FLOOR, FAR)];
  svg.append(svgEl('rect', { x: door[0][0], y: door[0][1], width: door[1][0] - door[0][0], height: door[1][1] - door[0][1], fill: look.door ?? '#B9C1C8', stroke: '#7F878E' }));
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
  // 통로 바닥 줄무늬
  svg.append(svgEl('polygon', { points: quad(P(-0.36, FLOOR, NEAR), P(0.36, FLOOR, NEAR), P(0.36, FLOOR, FAR), P(-0.36, FLOOR, FAR)), fill: '#000000', opacity: 0.08 }));
  // 차체 색 띠(문 위): 무슨 열차인지 한눈에
  svg.append(svgEl('rect', { x: 0, y: 0, width: 800, height: 6, fill: outer.accent }));

  let scene = null;
  const api = {
    svg,
    setScene(next) {
      if (next === scene) return;
      scene = next;
      mover.replaceChildren(outsideStrip(next));
    },
    setSpeed(kmh) {
      // 빠를수록 창밖이 빨리 지나간다. 서 있으면 멈춘다.
      if (reduceMotion) return;
      const seconds = kmh < 3 ? 0 : Math.max(0.35, 60 / Math.max(10, kmh));
      mover.style.animationDuration = seconds ? `${seconds.toFixed(2)}s` : '0s';
      mover.style.animationPlayState = seconds ? 'running' : 'paused';
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
