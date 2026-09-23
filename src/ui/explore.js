// 부산 둘러보기 화면. 지도 + 범례 + 역 정보.
import { grid, lines } from '../data.js';
import { CELL, TERRAIN_COLORS, createMap } from './map.js';
import { createStationPanel } from './station-panel.js';
import { wordWithCard } from './word-card.js';

const TERRAIN_LABELS = [
  ['sea', '바다'],
  ['river', '강'],
  ['mountain', '산'],
  ['hill', '언덕'],
  ['flat', '평지'],
  ['field', '들판'],
];
const VIEWS = ['실제 지도', '노선도'];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function legendBox(view) {
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
  box.append(lineList);
  box.append(element('p', 'legend-note', '지형: SRTM(USGS) · 경계: 통계청 SGIS · 역: 공공데이터포털'));
  return box;
}

/** 축척 막대: 확대 배율에 따라 1, 2, 5, 10km 가운데 알맞은 것을 고른다. */
function scaleBar() {
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

function northArrow() {
  const box = element('div', 'north');
  box.innerHTML =
    '<svg viewBox="0 0 24 34" width="24" height="34" aria-hidden="true"><path d="M12 0 L20 24 L12 19 L4 24 Z" fill="#1F3342"/></svg>';
  box.append(element('span', null, '북'));
  return box;
}

/** @param {() => void} onHome 첫 화면으로 돌아가기 */
export function renderExplore(root, { onHome }) {
  root.replaceChildren();
  const screen = element('div', 'screen explore');

  // 위쪽 줄
  const bar = element('header', 'top-bar');
  bar.append(element('h1', 'top-title', '부산 둘러보기'));
  const viewGroup = element('div', 'view-group');
  viewGroup.setAttribute('role', 'group');
  viewGroup.setAttribute('aria-label', '지도 보기 고르기');
  bar.append(viewGroup);
  const homeButton = element('button', 'button', '처음으로');
  homeButton.type = 'button';
  homeButton.addEventListener('click', onHome);
  bar.append(homeButton);
  screen.append(bar);

  // 지도와 패널
  const main = element('div', 'explore-main');
  const mapBox = element('div', 'map-box');
  const panel = createStationPanel({});
  const map = createMap({ onSelect: (id) => panel.show(id) });
  mapBox.append(map.element);

  const legend = element('div', 'legend-holder');
  const scale = scaleBar();
  const zoomBox = element('div', 'zoom-box');
  const zoomIn = element('button', 'button round', '+');
  zoomIn.type = 'button';
  zoomIn.setAttribute('aria-label', '크게 보기');
  zoomIn.addEventListener('click', () => map.zoomIn());
  const zoomOut = element('button', 'button round', '−');
  zoomOut.type = 'button';
  zoomOut.setAttribute('aria-label', '작게 보기');
  zoomOut.addEventListener('click', () => map.zoomOut());
  const fitButton = element('button', 'button', '전체');
  fitButton.type = 'button';
  fitButton.addEventListener('click', () => map.fit());
  zoomBox.append(zoomIn, zoomOut, fitButton);

  const credit = element('p', 'credit', '© OpenStreetMap contributors');
  mapBox.append(legend, northArrow(), scale, zoomBox, credit);
  main.append(mapBox, panel.element);
  screen.append(main);
  root.append(screen);

  function setView(view) {
    map.setView(view);
    legend.replaceChildren(legendBox(view));
    for (const button of viewGroup.children) {
      const on = button.textContent === view;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', String(on));
    }
  }

  for (const view of VIEWS) {
    const button = element('button', 'button view-button', view);
    button.type = 'button';
    button.addEventListener('click', () => setView(view));
    viewGroup.append(button);
  }

  map.element.addEventListener('map-zoom', (event) => scale.update(event.detail.k));

  // 크기를 맞춘 뒤 그린다.
  map.resize();
  setView('실제 지도');
  map.fit();
  scale.update(map.zoom);

  const onResize = () => {
    map.resize();
    scale.update(map.zoom);
  };
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}
