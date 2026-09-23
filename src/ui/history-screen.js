// 옛날 부산 연표(docs/SPEC.md 12장 Phase 6, 4.1절 4사04-02·4사02-03).
// 연도 손잡이를 움직이면 그 해의 노선망이 지도에 나온다. 저절로 넘어가지 않는다.
import { lineById, stationById, stationInfo } from '../data.js';
import { BASE_YEAR, networkOfYear, rules } from '../model.js';
import { openingYears, yearOf } from '../sim/history.js';
import { buildRailGraph, timeBetween } from '../sim/rail.js';
import { yearLineChart } from './chart.js';
import { dateText, distanceText, durationText, stationLabel } from './format.js';
import { createMap } from './map.js';
import { legendBox, mapCorners, northArrow, scaleBar, zoomButtons } from './map-furniture.js';

/** 연표의 첫 해. 1호선이 열리기(1985년) 전, 도시철도가 없던 때부터 본다. */
const FIRST_YEAR = 1980;
/** 서면역. "서면까지 몇 분?"의 도착지다(SPEC 4.1절 4사04-02). */
const SEOMYEON = '119';
/** 출발지로 보여 줄 역: 노포(1), 다대포해수욕장(1), 장산(2), 해운대(2), 수영(3), 안평(4) */
const FROM_STATIONS = ['134', '95', '201', '203', '301', '414'];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, className, onClick) {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** 그 해 노선망으로 두 역 사이 시간을 잰다. 못 가면 null. */
function rideMinutes(network, fromId, toId) {
  const lineInfo = Object.fromEntries(
    network.lines.map((line) => [
      line.id,
      { dwellS: line.dwellS ?? 0, headwayMin: line.headwayMin ?? rules.defaultHeadwayMin },
    ]),
  );
  const graph = buildRailGraph(network.stations, network.links, network.transfers, lineInfo, rules);
  return timeBetween(graph, fromId, toId);
}

/** @param {{onHome: () => void, onDesign?: (year: number) => void}} actions  onDesign: 그 해 부산에 노선 그리기 */
export function renderHistory(root, { onHome, onDesign = null }) {
  root.replaceChildren();
  const screen = element('div', 'screen explore');

  const bar = element('header', 'top-bar');
  bar.append(element('h1', 'top-title', '옛날 부산'));
  bar.append(button('처음으로', 'button', onHome));
  screen.append(bar);

  const main = element('div', 'explore-main');
  const mapBox = element('div', 'map-box');
  const map = createMap({ onSelect: () => {} });
  mapBox.append(map.element);
  const legend = element('div', 'legend-holder');
  legend.append(legendBox({ view: '실제 지도' }));
  const scale = scaleBar();
  const credit = element('p', 'credit', '© OpenStreetMap contributors');
  mapBox.append(
    ...mapCorners({ topRight: [northArrow(), zoomButtons(map)], bottomRight: [scale, credit], bottomLeft: [legend] }),
  );

  const panel = element('aside', 'panel');
  main.append(mapBox, panel);
  screen.append(main);
  root.append(screen);

  // 해마다의 길이와 역 수는 한 번만 셈해 둔다.
  const years = [...openingYears(stationInfo).filter((y) => y >= FIRST_YEAR && y <= BASE_YEAR)];
  if (!years.includes(FIRST_YEAR)) years.unshift(FIRST_YEAR);
  if (!years.includes(BASE_YEAR)) years.push(BASE_YEAR);
  const sizes = years.map((y) => {
    const network = networkOfYear(y);
    return {
      year: y,
      km: network.links.reduce((sum, link) => sum + link.distanceM, 0) / 1000,
      stations: network.stations.length,
    };
  });

  let year = BASE_YEAR;

  // 해가 바뀌어도 손잡이는 그대로 둔다(끌다가 끊기지 않게).
  const title = element('h2');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(FIRST_YEAR);
  slider.max = String(BASE_YEAR);
  slider.step = '1';
  slider.value = String(year);
  slider.className = 'year-slider';
  slider.setAttribute('aria-label', '연도 고르기');
  slider.addEventListener('input', () => setYear(Number(slider.value)));

  const jump = element('div', 'tool-row');
  jump.setAttribute('role', 'group');
  jump.setAttribute('aria-label', '연도 바로 가기');
  const minus = button('−', 'button round', () => setYear(year - 1));
  minus.setAttribute('aria-label', '한 해 앞으로');
  const plus = button('+', 'button round', () => setYear(year + 1));
  plus.setAttribute('aria-label', '한 해 뒤로');
  jump.append(minus, plus);
  const marks = [FIRST_YEAR, 1985, 1999, 2011, BASE_YEAR];
  const markButtons = marks.map((mark) => {
    const node = button(`${mark}년`, 'button', () => setYear(mark));
    jump.append(node);
    return node;
  });

  // 그 해 부산에 새 노선 그리기(자유 설계)
  const designButton = onDesign ? button('', 'button big', () => onDesign(year)) : null;
  const info = element('div');
  panel.append(title, slider, jump);
  if (designButton) panel.append(designButton);
  panel.append(info);

  function setYear(next) {
    year = Math.min(BASE_YEAR, Math.max(FIRST_YEAR, next));
    if (slider.value !== String(year)) slider.value = String(year);
    marks.forEach((mark, i) => {
      markButtons[i].classList.toggle('is-on', mark === year);
      markButtons[i].setAttribute('aria-pressed', String(mark === year));
    });
    draw();
  }

  function draw() {
    const network = networkOfYear(year);
    map.setNetwork(network);
    title.textContent = `${year}년 부산`;
    if (designButton) designButton.textContent = `${year}년 부산에 노선 그리기`;
    info.replaceChildren();

    const meters = network.links.reduce((sum, link) => sum + link.distanceM, 0);
    const list = element('ul', 'panel-list');
    list.append(element('li', null, `노선 ${network.lines.length}개`));
    list.append(element('li', null, `역 ${network.stations.length}개`));
    list.append(element('li', null, `모두 이으면 ${distanceText(meters)}`));
    info.append(list);

    const names = network.lines.map((line) => `${line.label} ${line.name}`).join(', ');
    info.append(element('p', null, names ? `다니는 노선: ${names}` : '아직 도시철도가 없어요.'));

    // 그 해에 새로 문을 연 역
    const opened = network.stations.filter((station) => yearOf(stationInfo[station.id]?.openedOn) === year);
    if (opened.length > 0) {
      info.append(element('h3', null, `${year}년에 새로 생긴 역 ${opened.length}개`));
      info.append(element('p', null, opened.map((s) => stationLabel(s.name)).join(', ')));
      const days = [...new Set(opened.map((s) => stationInfo[s.id]?.openedOn).filter(Boolean))].sort();
      if (days.length > 0) {
        info.append(
          element('p', 'panel-note', days.length === 1 ? `${dateText(days[0])}에 문을 열었어요.` : `${dateText(days[0])}부터 ${dateText(days.at(-1))} 사이에 문을 열었어요.`),
        );
      }
    }

    // 서면까지 몇 분?
    info.append(element('h3', null, '서면역까지 몇 분 걸렸을까요?'));
    const openIds = new Set(network.stations.map((s) => s.id));
    if (!openIds.has(SEOMYEON)) {
      info.append(element('p', null, '아직 서면역이 없어요.'));
    } else {
      const rides = element('ul', 'panel-list');
      let found = 0;
      for (const id of FROM_STATIONS) {
        if (id === SEOMYEON) continue;
        const station = stationById.get(id);
        if (!station) continue;
        const lineName = lineById.get(station.line)?.name ?? '';
        found += 1;
        // 아직 없는 역도 보여 준다. 그래야 무엇이 달라졌는지 알 수 있다.
        if (!openIds.has(id)) {
          rides.append(element('li', null, `${stationLabel(station.name)}(${lineName})은 아직 없어요`));
          continue;
        }
        const minutes = rideMinutes(network, id, SEOMYEON);
        rides.append(
          element(
            'li',
            null,
            minutes === null
              ? `${stationLabel(station.name)}(${lineName})에서는 아직 도시철도로 못 가요`
              : `${stationLabel(station.name)}(${lineName})에서 ${durationText(minutes * 60)}`,
          ),
        );
      }
      if (found === 0) info.append(element('p', null, '아직 견줄 역이 없어요.'));
      else {
        info.append(rides);
        info.append(element('p', 'panel-note', '기다리는 시간은 빼고, 열차를 타고 가는 시간만 셈했어요.'));
      }
    }

    // 연도별 꺾은선
    info.append(element('h3', null, '해마다 얼마나 길어졌나요?'));
    info.append(
      yearLineChart(
        sizes.map((size) => ({ year: size.year, value: size.km })),
        { marked: year, valueText: (km) => `${Math.round(km)}km` },
      ),
    );
    info.append(element('h3', null, '해마다 역은 몇 개였나요?'));
    info.append(
      yearLineChart(
        sizes.map((size) => ({ year: size.year, value: size.stations })),
        { marked: year, valueText: (count) => `${count}개` },
      ),
    );

    info.append(element('p', 'panel-note', '역이 문을 연 날은 부산교통공사 건설연혁과 운영사 연혁에서 가져왔어요.'));
    info.append(element('p', 'panel-note', '앞으로 생길 노선은 여기에 넣지 않았어요.'));
  }

  map.resize();
  map.setView('실제 지도');
  setYear(BASE_YEAR);
  map.fit();
  scale.update(map.zoom);
  map.element.addEventListener('map-zoom', (event) => scale.update(event.detail.k));

  const onResize = () => {
    map.resize();
    scale.update(map.zoom);
  };
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}
