// 지도에 늘 붙어 있는 것들: 범례, 방위표, 축척 막대(SPEC 12장 Phase 1 완료 기준).
import { lines } from '../data.js';
import { CELL, DESIGN_COLOR, TERRAIN_COLORS } from './map.js';
import { wordWithCard } from './word-card.js';

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

/** @param {{view?: string, showDesign?: boolean}} options */
export function legendBox({ view = '실제 지도', showDesign = false } = {}) {
  const box = element('div', 'legend');
  box.append(element('h3', null, '지도 보는 법'));
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
    const badge = element('span', 'line-badge', line.label);
    badge.style.background = line.color ?? '#1F3342';
    item.append(badge, element('span', null, line.name));
    lineList.append(item);
  }
  if (showDesign) {
    const item = element('li');
    const badge = element('span', 'line-badge', '새');
    badge.style.background = DESIGN_COLOR;
    item.append(badge, element('span', null, '내가 그린 노선'));
    lineList.append(item);
  }
  box.append(lineList);
  box.append(element('p', 'legend-note', '지형: SRTM(USGS) · 경계: 통계청 SGIS · 역: 공공데이터포털'));
  return box;
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
