// 역 안(대합실)과 승강장 그림, 그리고 역 표지판(HTML). 여행 모드의 "지하철 기다리기"가 쓴다.
// 부산 도시철도 역 사진을 보고 새로 그린 그림이다. 사진을 그대로 쓰지 않는다.
//
// 역 안: 붉은 벽돌 둥근 기둥, 네모 타일 바닥과 노란 점자 블록, 천장의 긴 형광등, 멀리 개찰구.
//   위에 걸린 검은 방향 표지판: "← ① 다음 역 / 끝 역 | 타는 곳 | 다음 역 / 끝 역 ① →"
// 승강장: 오른쪽으로 늘어선 유리 안전문(스크린도어), 노란 점자 블록 앞에 줄 선 사람들, 왼쪽 끝 계단.
//   위에 노란 방면 표지판과 안전문 위 역 이름 띠. 열차가 먼 쪽에서 들어와 서고 안전문이 열린다.
import { backOfPerson, SHIRTS, walkerFigure } from './vehicle-art.js';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const pts = (list) => list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/** 호선 동그라미(번호 글자와 색). 밝은 색에는 진한 글자를 쓴다. */
function lineMark(label, color, ink) {
  const mark = element('span', 'st-mark', label);
  mark.style.background = color;
  mark.style.color = ink;
  return mark;
}

// ---------- 표지판 ----------
/**
 * 역 안 방향 표지판(검은 판). 양쪽에 다음 역과 끝 역(한국어, 영어), 가운데 "타는 곳".
 * @param {object} p
 * @param {string} p.label 호선 글자("1")
 * @param {string} p.color 노선 색
 * @param {string} p.ink 동그라미 글자 색
 * @param {{next: {ko: string, en: string}, end: {ko: string, en: string}, take: boolean}[]} p.sides 왼쪽, 오른쪽 차례
 */
export function concourseSign({ label, color, ink, sides }) {
  const sign = element('div', 'st-sign st-sign-dark');
  sign.setAttribute('role', 'img');
  const spoken = sides.map((side) => `${side.next.ko} 방면 ${side.end.ko}행${side.take ? '(우리가 탈 쪽)' : ''}`).join(', ');
  sign.setAttribute('aria-label', `역 안 표지판: 타는 곳, ${spoken}`);
  const half = (side, left) => {
    const box = element('div', `st-side${side.take ? ' is-take' : ''}${left ? ' is-left' : ''}`);
    const arrow = element('span', 'st-arrow', left ? '←' : '→');
    const names = element('div', 'st-names');
    names.append(element('span', 'st-next', side.next.ko));
    const en = element('span', 'st-en', side.next.en);
    en.lang = 'en';
    names.append(en);
    const end = element('span', 'st-end', `${side.end.ko}행`);
    const endEn = element('span', 'st-en', `for ${side.end.en}`);
    endEn.lang = 'en';
    names.append(end, endEn);
    box.append(...(left ? [arrow, lineMark(label, color, ink), names] : [names, lineMark(label, color, ink), arrow]));
    if (side.take) box.append(element('span', 'st-take', '이쪽으로 타요'));
    return box;
  };
  const middle = element('div', 'st-middle');
  middle.append(element('span', 'st-title', '타는 곳'));
  // 외국어 표기는 역 안 표지판 사진에 있는 그대로 적는다.
  const sub = element('span', 'st-sub', 'Tracks · のりば · 乘车处');
  middle.append(sub);
  const [a, b] = sides;
  if (sides.length === 1) {
    // 끝 역: 한쪽으로만 간다. 오른쪽에 둔다.
    sign.append(middle, half(a, false));
  } else {
    sign.append(half(a, true), middle, half(b, false));
  }
  return sign;
}

/**
 * 승강장 표지판: 노란 방면 표지판과 안전문 위 역 이름 띠.
 * @param {object} p
 * @param {{ko: string, en: string}} p.here 이 역
 * @param {{ko: string, en: string}|null} p.prev 지나온 쪽 역
 * @param {{ko: string, en: string}} p.next 다음 역
 * @param {{ko: string, en: string}} p.end 끝 역
 */
export function platformSigns({ label, color, ink, here, prev, next, end }) {
  const box = element('div', 'st-platform-signs');
  const yellow = element('div', 'st-sign st-sign-yellow');
  yellow.setAttribute('role', 'img');
  yellow.setAttribute('aria-label', `승강장 표지판: ${next.ko} 방면, ${end.ko}행`);
  const words = element('div', 'st-names');
  words.append(element('span', 'st-next', `${next.ko} 방면`));
  const en = element('span', 'st-en', `To ${next.en}`);
  en.lang = 'en';
  words.append(en, element('span', 'st-end', `${end.ko}행 타는 곳`));
  yellow.append(lineMark(label, color, ink), words, element('span', 'st-arrow', '→'));
  box.append(yellow);

  // 안전문 위 역 이름 띠: ◀ 지나온 역 | 이 역 | 다음 역 ▶
  const strip = element('div', 'st-sign st-strip');
  strip.setAttribute('role', 'img');
  strip.setAttribute('aria-label', `역 이름 띠: 이 역은 ${here.ko}, 다음 역은 ${next.ko}`);
  strip.style.borderTopColor = color;
  const cell = (item, cls, text) => {
    const c = element('div', cls);
    if (!item) return c;
    c.append(element('span', 'st-strip-ko', text ?? item.ko));
    const e = element('span', 'st-en', item.en);
    e.lang = 'en';
    c.append(e);
    return c;
  };
  strip.append(
    cell(prev, 'st-strip-side', prev ? `◀ ${prev.ko}` : ''),
    cell(here, 'st-strip-here'),
    cell(next, 'st-strip-side is-next', `${next.ko} ▶`),
  );
  box.append(strip);
  return box;
}

// ---------- 역 안(대합실) ----------
const CONCOURSE_VP = { x: 400, y: 110 };
const cg = (side, h, d) => ({ x: CONCOURSE_VP.x + side * d, y: CONCOURSE_VP.y + h * d });

/** 붉은 벽돌 둥근 기둥 하나(깊이 d) */
function pillar(svg, side, d) {
  const top = cg(side, -150, d);
  const bottom = cg(side, 190, d);
  const r = 34 * d;
  svg.append(svgEl('rect', { x: top.x - r, y: top.y, width: 2 * r, height: bottom.y - top.y, fill: 'url(#st-brick)' }));
  // 벽돌 줄눈
  for (let y = top.y + 12 * d; y < bottom.y; y += 12 * d) {
    svg.append(svgEl('line', { x1: top.x - r, y1: y, x2: top.x + r, y2: y, stroke: '#8E3F37', 'stroke-width': Math.max(0.5, d) }));
  }
  svg.append(svgEl('rect', { x: top.x - r, y: bottom.y - 6 * d, width: 2 * r, height: 6 * d, fill: '#6E3029' }));
}

/**
 * 역 안 그림. setProgress(0~1)로 걸어가는 사람이 멀어진다.
 * @returns {{svg: SVGSVGElement, setProgress: (t: number) => void}}
 */
export function concourseArt({ reduceMotion = false } = {}) {
  const svg = svgEl('svg', { class: 'journey-scene', viewBox: '0 0 800 300', role: 'img' });
  svg.setAttribute('aria-label', '역 안 그림이에요. 붉은 기둥 사이로 타는 곳까지 걸어가요.');
  const defs = svgEl('defs');
  const brick = svgEl('linearGradient', { id: 'st-brick', x1: 0, x2: 1, y1: 0, y2: 0 });
  for (const [offset, color] of [
    [0, '#8E3F37'],
    [0.35, '#C0594D'],
    [0.6, '#B5534A'],
    [1, '#7A352E'],
  ]) {
    brick.append(svgEl('stop', { offset, 'stop-color': color }));
  }
  defs.append(brick);
  svg.append(defs);

  // 천장, 바닥, 멀리 벽과 개찰구
  svg.append(svgEl('rect', { x: 0, y: 0, width: 800, height: 300, fill: '#D9D4C8' }));
  svg.append(svgEl('polygon', { points: pts([cg(-900, -150, 1), cg(900, -150, 1), cg(900, -150, 0.05), cg(-900, -150, 0.05)]), fill: '#CFC9BC' }));
  svg.append(svgEl('polygon', { points: pts([cg(-900, 190, 1), cg(900, 190, 1), cg(900, 190, 0.05), cg(-900, 190, 0.05)]), fill: '#C9C4B8' }));
  svg.append(svgEl('rect', { x: 330, y: 100, width: 140, height: 20, fill: '#E6E1D6' }));
  for (let i = 0; i < 7; i++) {
    const p = cg(-60 + i * 20, 190, 0.1);
    svg.append(svgEl('rect', { x: p.x - 3, y: p.y - 9, width: 6, height: 9, fill: '#7E8790' }));
  }
  // 바닥 타일 줄눈
  for (let side = -880; side <= 880; side += 110) {
    const a = cg(side, 190, 1);
    const b = cg(side, 190, 0.05);
    svg.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#B3AEA2', 'stroke-width': 1 }));
  }
  for (let k = 0; k < 18; k++) {
    const d = 1 / (1 + 0.4 * k);
    const a = cg(-900, 190, d);
    const b = cg(900, 190, d);
    svg.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#B3AEA2', 'stroke-width': 0.5 + d }));
  }
  // 노란 점자 블록
  svg.append(svgEl('polygon', { points: pts([cg(120, 190, 1.2), cg(165, 190, 1.2), cg(165, 190, 0.08), cg(120, 190, 0.08)]), fill: '#F2C230' }));
  // 천장 형광등 두 줄
  for (const side of [-200, 200]) {
    for (let k = 0; k < 12; k++) {
      const d0 = 1 / (1 + 0.5 * k);
      const d1 = 1 / (1 + 0.5 * k + 0.3);
      svg.append(svgEl('polygon', { points: pts([cg(side - 14, -150, d0), cg(side + 14, -150, d0), cg(side + 14, -150, d1), cg(side - 14, -150, d1)]), fill: '#FFFDF4' }));
    }
  }
  // 멀리 사람들
  for (const [side, d, shirt] of [
    [-120, 0.16, '#4F5D75'],
    [-60, 0.13, '#EDAE49'],
    [80, 0.18, '#2F6690'],
    [220, 0.2, '#3A7D44'],
  ]) {
    const p = cg(side, 190, d);
    svg.append(backOfPerson(p.x, p.y - 116 * d * 1.6, shirt, d * 1.6, false, false));
  }
  // 기둥: 먼 것부터
  for (const d of [0.14, 0.2, 0.3, 0.48, 0.9]) {
    pillar(svg, -270, d);
    pillar(svg, 270, d);
  }
  // 걸어가는 사람(이 여행을 하는 사람)
  const who = svgEl('g');
  who.append(walkerFigure({ shirt: '#2F6690', reduceMotion }));
  svg.append(who);
  const setProgress = (t) => {
    const d = 0.95 - 0.5 * Math.min(1, Math.max(0, t));
    const p = cg(60, 190, d);
    who.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${(d * 1.7).toFixed(3)})`);
  };
  setProgress(0);
  return { svg, setProgress };
}

// ---------- 승강장 ----------
const PLATFORM_VP = { x: 330, y: 105 };
const pg = (side, h, d) => ({ x: PLATFORM_VP.x + side * d, y: PLATFORM_VP.y + h * d });
/** 안전문 칸의 깊이(가까운 것부터) */
const DOOR_DEPTHS = Array.from({ length: 16 }, (_, k) => 1.08 / (1 + 0.3 * k));
const DOOR_SIDE = 470;
const TRAIN_SIDE = 510;

/**
 * 승강장 그림. arrive()를 부르면 열차가 먼 쪽에서 들어와 서고, openDoors()로 안전문이 열린다.
 * @param {{color: string, reduceMotion?: boolean}} p color: 노선 색(열차 띠)
 * @returns {{svg: SVGSVGElement, arrive: (ms: number) => Promise<void>, openDoors: () => void}}
 */
export function platformArt({ color, reduceMotion = false }) {
  const svg = svgEl('svg', { class: 'journey-scene', viewBox: '0 0 800 300', role: 'img' });
  svg.setAttribute('aria-label', '승강장 그림이에요. 오른쪽에 유리 안전문이 있고, 사람들이 줄을 서서 기다려요.');
  const defs = svgEl('defs');
  const clip = svgEl('clipPath', { id: 'st-train-clip' });
  const clipShape = svgEl('polygon', { points: '0,0 0,0 0,0' });
  clip.append(clipShape);
  defs.append(clip);
  svg.append(defs);

  // 벽, 천장, 바닥
  svg.append(svgEl('rect', { x: 0, y: 0, width: 800, height: 300, fill: '#E3E1DA' }));
  svg.append(svgEl('polygon', { points: pts([pg(-500, -130, 1.2), pg(900, -130, 1.2), pg(900, -130, 0.05), pg(-500, -130, 0.05)]), fill: '#F1EFEA' }));
  svg.append(svgEl('polygon', { points: pts([pg(-500, 195, 1.2), pg(DOOR_SIDE, 195, 1.2), pg(DOOR_SIDE, 195, 0.05), pg(-500, 195, 0.05)]), fill: '#D8D5CE' }));
  // 반짝이는 바닥 타일
  for (let side = -460; side < DOOR_SIDE; side += 90) {
    const a = pg(side, 195, 1.2);
    const b = pg(side, 195, 0.05);
    svg.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#C2BEB5', 'stroke-width': 1 }));
  }
  for (let k = 0; k < 16; k++) {
    const d = 1.2 / (1 + 0.35 * k);
    const a = pg(-500, 195, d);
    const b = pg(DOOR_SIDE, 195, d);
    svg.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#C2BEB5', 'stroke-width': 0.5 + d }));
  }
  // 천장 형광등
  for (const side of [-150, 180]) {
    for (let k = 0; k < 12; k++) {
      const d0 = 1.2 / (1 + 0.45 * k);
      const d1 = 1.2 / (1 + 0.45 * k + 0.25);
      svg.append(svgEl('polygon', { points: pts([pg(side - 12, -130, d0), pg(side + 12, -130, d0), pg(side + 12, -130, d1), pg(side - 12, -130, d1)]), fill: '#FFFFFF' }));
    }
  }
  // 왼쪽 끝 계단(위로 올라간다)
  for (let i = 0; i < 8; i++) {
    const d = 0.2 - i * 0.008;
    const a = pg(-420, 195 - i * 18, d);
    const b = pg(-250, 195 - i * 18, d);
    svg.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#9A968E', 'stroke-width': 2 }));
  }
  svg.append(svgEl('polygon', { points: pts([pg(-430, 60, 0.2), pg(-420, 195, 0.2), pg(-420, 195, 0.13), pg(-430, 60, 0.13)]), fill: '#B9B5AC' }));

  // 열차(안전문 뒤). 먼 쪽부터 가까운 쪽으로 보이는 곳을 넓혀 들어오는 것처럼 보인다.
  const train = svgEl('g', { 'clip-path': 'url(#st-train-clip)' });
  const near = 1.3;
  const far = 0.04;
  train.append(svgEl('polygon', { points: pts([pg(TRAIN_SIDE, -45, near), pg(TRAIN_SIDE, -45, far), pg(TRAIN_SIDE, 180, far), pg(TRAIN_SIDE, 180, near)]), fill: '#D6DBE0' }));
  train.append(svgEl('polygon', { points: pts([pg(TRAIN_SIDE, 60, near), pg(TRAIN_SIDE, 60, far), pg(TRAIN_SIDE, 78, far), pg(TRAIN_SIDE, 78, near)]), fill: color }));
  const trainDoors = [];
  for (let k = 0; k + 1 < DOOR_DEPTHS.length; k++) {
    const d0 = DOOR_DEPTHS[k];
    const d1 = DOOR_DEPTHS[k + 1];
    const mid0 = d0 - (d0 - d1) * 0.3;
    const mid1 = d0 - (d0 - d1) * 0.7;
    // 창문과 문
    train.append(svgEl('polygon', { points: pts([pg(TRAIN_SIDE, -25, mid0), pg(TRAIN_SIDE, -25, mid1), pg(TRAIN_SIDE, 40, mid1), pg(TRAIN_SIDE, 40, mid0)]), fill: '#3C4650' }));
    const door = svgEl('polygon', { points: pts([pg(TRAIN_SIDE, -35, mid0), pg(TRAIN_SIDE, -35, mid1), pg(TRAIN_SIDE, 180, mid1), pg(TRAIN_SIDE, 180, mid0)]), fill: '#AEB6BE' });
    trainDoors.push(door);
    train.append(door);
  }
  svg.append(train);

  // 안전문: 칸마다 초록 틀과 유리 두 짝
  const glass = [];
  for (let k = 0; k + 1 < DOOR_DEPTHS.length; k++) {
    const d0 = DOOR_DEPTHS[k];
    const d1 = DOOR_DEPTHS[k + 1];
    svg.append(svgEl('polygon', { points: pts([pg(DOOR_SIDE, -75, d0), pg(DOOR_SIDE, -75, d1), pg(DOOR_SIDE, -55, d1), pg(DOOR_SIDE, -55, d0)]), fill: '#F7F7F4' }));
    svg.append(svgEl('polygon', { points: pts([pg(DOOR_SIDE, -55, d0), pg(DOOR_SIDE, -55, d1), pg(DOOR_SIDE, 195, d1), pg(DOOR_SIDE, 195, d0)]), fill: 'none', stroke: '#2B8C88', 'stroke-width': 3 }));
    const cut = (share) => d0 - (d0 - d1) * share;
    for (const [a, b] of [
      [0.08, 0.5],
      [0.5, 0.92],
    ]) {
      const pane = svgEl('polygon', {
        points: pts([pg(DOOR_SIDE, -50, cut(a)), pg(DOOR_SIDE, -50, cut(b)), pg(DOOR_SIDE, 188, cut(b)), pg(DOOR_SIDE, 188, cut(a))]),
        fill: '#CFE6E8',
        'fill-opacity': 0.45,
        stroke: '#6FB3B0',
        'stroke-width': 1,
      });
      pane.dataset.a = a;
      pane.dataset.b = b;
      pane.dataset.k = k;
      glass.push(pane);
      svg.append(pane);
    }
    // 문 위 빨간 띠(유리문 가운데)
    svg.append(svgEl('line', { ...lineOf(pg(DOOR_SIDE, 70, cut(0.1)), pg(DOOR_SIDE, 70, cut(0.9))), stroke: '#D1495B', 'stroke-width': Math.max(1, 3 * d0) }));
  }
  // 노란 점자 블록(안전문 앞)
  svg.append(svgEl('polygon', { points: pts([pg(395, 195, 1.2), pg(440, 195, 1.2), pg(440, 195, 0.05), pg(395, 195, 0.05)]), fill: '#F2C230' }));

  // 줄 선 사람들: 먼 것부터
  const queue = [];
  // 문마다 한두 명씩, 가까운 문 앞은 비워 둔다(이 여행을 하는 사람이 설 자리).
  for (const k of [2, 3, 5, 6, 8]) {
    const d = (DOOR_DEPTHS[k] + DOOR_DEPTHS[k + 1]) / 2;
    const count = k % 2;
    for (let i = 0; i <= count; i++) queue.push({ d: d * (1 + i * 0.08), side: 330 - i * 60, shirt: SHIRTS[(k * 3 + i) % SHIRTS.length] });
  }
  // 이 여행을 하는 사람(역 안 그림과 같은 파란 옷): 가장 가까운 문 앞
  queue.push({ d: (DOOR_DEPTHS[1] + DOOR_DEPTHS[2]) / 2, side: 340, shirt: '#2F6690' });
  queue.sort((a, b) => a.d - b.d);
  for (const person of queue) {
    const p = pg(person.side, 195, person.d);
    const scale = person.d * 1.5;
    svg.append(backOfPerson(p.x, p.y - 116 * scale, person.shirt, scale, false, false));
  }

  const setTrainFront = (front) => {
    clipShape.setAttribute('points', pts([pg(TRAIN_SIDE, -60, far), pg(TRAIN_SIDE, -60, front), pg(TRAIN_SIDE, 200, front), pg(TRAIN_SIDE, 200, far)]));
  };
  setTrainFront(far);

  /** 열차가 들어온다(ms 동안). 끝나면 풀린다. */
  const arrive = (ms) =>
    new Promise((resolve) => {
      const steps = reduceMotion ? 1 : 30;
      let n = 0;
      const tick = () => {
        n += 1;
        // 처음에는 빠르게, 설 때는 느리게
        const t = 1 - (1 - n / steps) ** 2;
        setTrainFront(far + (near - far) * t);
        if (n >= steps) resolve();
        else setTimeout(tick, ms / steps);
      };
      setTimeout(tick, reduceMotion ? 0 : ms / steps);
    });

  /** 안전문과 열차 문이 열린다: 유리문이 양옆으로 비켜서고 열차 안 불빛이 보인다. */
  const openDoors = () => {
    for (const pane of glass) {
      const k = Number(pane.dataset.k);
      const d0 = DOOR_DEPTHS[k];
      const d1 = DOOR_DEPTHS[k + 1];
      const cut = (share) => d0 - (d0 - d1) * share;
      const a = Number(pane.dataset.a);
      const [na, nb] = a < 0.5 ? [0.04, 0.22] : [0.78, 0.96];
      pane.setAttribute('points', pts([pg(DOOR_SIDE, -50, cut(na)), pg(DOOR_SIDE, -50, cut(nb)), pg(DOOR_SIDE, 188, cut(nb)), pg(DOOR_SIDE, 188, cut(na))]));
    }
    for (const door of trainDoors) door.setAttribute('fill', '#FFF4D6');
  };

  return { svg, arrive, openDoors };
}

function lineOf(a, b) {
  return { x1: a.x.toFixed(1), y1: a.y.toFixed(1), x2: b.x.toFixed(1), y2: b.y.toFixed(1) };
}
