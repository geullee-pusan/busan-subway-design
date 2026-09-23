// 부산 둘러보기 화면. 지도 + 범례 + 역 정보.
// 기준 연도를 2026년과 2027년으로 바꿔 볼 수 있다(2027년에는 양산선과 사상–하단선이 있다).
import { futureLines } from '../data.js';
import { createMap } from './map.js';
import { legendBox, mapCorners, northArrow, scaleBar, zoomButtons } from './map-furniture.js';
import { createStationPanel } from './station-panel.js';

const VIEWS = ['실제 지도', '노선도'];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {{onHome: () => void}} actions */
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
  const yearGroup = element('div', 'view-group');
  yearGroup.setAttribute('role', 'group');
  yearGroup.setAttribute('aria-label', '어느 해의 부산인지 고르기');
  bar.append(yearGroup);
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
  const credit = element('p', 'credit', '© OpenStreetMap contributors');
  mapBox.append(
    ...mapCorners({ topRight: [northArrow(), zoomButtons(map)], bottomRight: [scale, credit], bottomLeft: [legend] }),
  );
  main.append(mapBox, panel.element);
  screen.append(main);
  root.append(screen);

  let year = 2026;
  let currentView = '실제 지도';

  function setView(view) {
    currentView = view;
    map.setView(view);
    if (year >= 2027) map.setFuture(futureLines);
    legend.replaceChildren(legendBox({ view, future: year >= 2027 }));
    for (const button of viewGroup.children) {
      const on = button.textContent === view;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', String(on));
    }
  }

  function setYear(next) {
    year = next;
    map.setFuture(year >= 2027 ? futureLines : null);
    legend.replaceChildren(legendBox({ view: currentView, future: year >= 2027 }));
    for (const button of yearGroup.children) {
      const on = button.textContent === `${next}년`;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', String(on));
    }
    panel.showNote(
      year >= 2027
        ? '2027년 부산이에요. 점선은 앞으로 생길 양산선과 사상–하단선이에요.'
        : '2026년 부산이에요. 지금 다니는 노선만 있어요.',
    );
  }

  for (const value of [2026, 2027]) {
    const button = element('button', 'button', `${value}년`);
    button.type = 'button';
    button.addEventListener('click', () => setYear(value));
    yearGroup.append(button);
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
  setYear(2026);
  map.fit();
  scale.update(map.zoom);

  const onResize = () => {
    map.resize();
    scale.update(map.zoom);
  };
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}
