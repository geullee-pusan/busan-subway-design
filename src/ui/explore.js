// 부산 둘러보기 화면. 지도 + 범례 + 역 정보.
import { createMap } from './map.js';
import { legendBox, northArrow, scaleBar, zoomButtons } from './map-furniture.js';
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
  mapBox.append(legend, northArrow(), scale, zoomButtons(map), credit);
  main.append(mapBox, panel.element);
  screen.append(main);
  root.append(screen);

  function setView(view) {
    map.setView(view);
    legend.replaceChildren(legendBox({ view }));
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
