// 지도에 늘 붙어 있는 것들: 범례, 방위표, 축척 막대(SPEC 12장 Phase 1 완료 기준).
import { lines } from '../data.js';
import { CELL, DESIGN_COLOR, FUTURE_COLOR, TERRAIN_COLORS } from './map.js';
import { legendStartsOpen, rememberLegend } from './view.js';
import { wordWithCard } from './word-card.js';

/** 범례마다 다른 id를 붙이려고 센다(접기 단추가 가리키는 곳). */
let legendCount = 0;

const TERRAIN_LABELS = [
  ['sea', '바다'],
  ['river', '강'],
  ['mountain', '산'],
  ['hill', '언덕'],
  ['flat', '평지'],
  ['field', '들판'],
];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {{view?: string, showDesign?: boolean, future?: boolean}} options */
/**
 * @param {{view?: string, showDesign?: boolean, future?: boolean, designLines?: {label: string, name: string, color: string}[]}} p
 *   designLines가 있으면 새 노선마다 한 줄씩 보여 준다(색과 이름은 설계 화면에서 정한 것).
 */
export function legendBox({ view = '실제 지도', showDesign = false, future = false, designLines = null } = {}) {
  const outer = element('div', 'legend');
  // 범례는 지도를 가린다. 좁은 화면에서는 접어서 시작하고, 아이가 고른 대로 기억한다.
  const toggle = element('button', 'legend-toggle');
  toggle.type = 'button';
  const box = element('div', 'legend-body');
  legendCount += 1;
  box.id = `legend-${legendCount}`;
  toggle.setAttribute('aria-controls', box.id);
  const setOpen = (open) => {
    box.hidden = !open;
    outer.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? '지도 보는 법 ▾' : '지도 보는 법 ▸';
  };
  toggle.addEventListener('click', () => {
    const open = box.hidden;
    setOpen(open);
    rememberLegend(open);
  });
  outer.append(toggle, box);
  setOpen(legendStartsOpen());
  if (view === '실제 지도') {
    const terrain = element('ul', 'legend-terrain');
    for (const [key, label] of TERRAIN_LABELS) {
      const item = element('li');
      const swatch = element('span', 'swatch');
      swatch.style.background = TERRAIN_COLORS[key];
      item.append(swatch, element('span', null, label));
      terrain.append(item);
    }
    box.append(terrain);
    box.append(element('p', 'legend-note', '한 칸은 1km예요. 점선은 구·군 경계예요.'));
  } else {
    const note = element('p', 'legend-note');
    note.append(wordWithCard('노선도', '노선도'), element('span', null, '는 역 사이를 고르게 편 지도예요. 실제 거리와 달라요.'));
    box.append(note);
  }
  const lineList = element('ul', 'legend-lines');
  for (const line of lines) {
    const item = element('li');
    const tag = element('span', 'line-tag', line.label);
    tag.style.background = line.color ?? '#1F3342';
    item.append(tag, element('span', null, line.name));
    lineList.append(item);
  }
  if (designLines) {
    for (const line of designLines) {
      const item = element('li');
      const tag = element('span', 'line-tag design-line-tag', line.label);
      tag.style.background = line.color;
      item.append(tag, element('span', 'design-line-name', line.name));
      lineList.append(item);
    }
  } else if (showDesign) {
    const item = element('li');
    const tag = element('span', 'line-tag design-line-tag', '새');
    tag.style.background = DESIGN_COLOR;
    item.append(tag, element('span', 'design-line-name', '내가 그린 노선'));
    lineList.append(item);
  }
  if (future) {
    const item = element('li');
    const tag = element('span', 'line-tag', '예정');
    tag.style.background = FUTURE_COLOR;
    item.append(tag, element('span', null, '앞으로 생길 노선'));
    lineList.append(item);
  }
  box.append(lineList);
  box.append(element('p', 'legend-note', '지형: SRTM(USGS) · 경계: 통계청 SGIS · 역: 공공데이터포털'));
  return outer;
}

/**
 * 지도 귀퉁이에 도구를 모아 둔다. 한 귀퉁이 안에서는 세로로 쌓아서 서로 겹치지 않는다.
 * 귀퉁이 상자 자체는 손가락을 통과시켜서, 도구 사이 빈 곳으로도 지도를 끌 수 있다.
 */
export function mapCorners({ topLeft = [], topRight = [], bottomRight = [], bottomLeft = [] }) {
  const corner = (name, items) => {
    const box = element('div', `map-corner ${name}`);
    box.append(...items);
    return box;
  };
  const boxes = [corner('top-right', topRight), corner('bottom-right', bottomRight), corner('bottom-left', bottomLeft)];
  // 왼쪽 위는 쓸 때만 만든다(다른 화면에는 없다).
  return topLeft.length > 0 ? [corner('top-left', topLeft), ...boxes] : boxes;
}

/** 축척 막대: 확대 배율에 따라 1, 2, 5, 10, 20km 가운데 알맞은 것을 고른다. */
export function scaleBar() {
  const box = element('div', 'scale-bar');
  const bar = element('div', 'scale-bar-line');
  const label = element('span', 'scale-bar-label', '5km');
  box.append(bar, label);
  box.update = (k) => {
    const options = [1, 2, 5, 10, 20];
    const km = options.find((value) => value * CELL * k >= 70) ?? 20;
    bar.style.width = `${(km * CELL * k).toFixed(0)}px`;
    label.textContent = `${km}km (${km}칸)`;
  };
  return box;
}

export function northArrow() {
  const box = element('div', 'north');
  box.innerHTML =
    '<svg viewBox="0 0 24 34" width="24" height="34" aria-hidden="true"><path d="M12 0 L20 24 L12 19 L4 24 Z" fill="#1F3342"/></svg>';
  box.append(element('span', null, '북'));
  return box;
}

/** 확대·축소 단추 */
export function zoomButtons(map) {
  const box = element('div', 'zoom-box');
  const make = (label, aria, onClick, className = 'button round') => {
    const node = element('button', className, label);
    node.type = 'button';
    if (aria) node.setAttribute('aria-label', aria);
    node.addEventListener('click', onClick);
    return node;
  };
  box.append(
    make('+', '크게 보기', () => map.zoomIn()),
    make('−', '작게 보기', () => map.zoomOut()),
    make('전체', null, () => map.fit(), 'button'),
  );
  return box;
}
