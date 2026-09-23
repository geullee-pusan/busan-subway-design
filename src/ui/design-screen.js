// 설계 화면(docs/SPEC.md 6장 2번, 7.2절).
// 격자를 따라 선을 긋고 역을 놓는다. 공사비와 예산이 바로 보이고, 되돌리기는 무제한이다.
import { futureLines, grid, ruleTables, stations } from '../data.js';
import { BASE_YEAR, networkOfYear, rules, stationNameContext } from '../model.js';
import { TRAINS_PER_HOUR, checkDesign, designCost, headway, stationGaps } from '../sim/design.js';
import { extendPath } from '../sim/design.js';
import { cleanStationName, nameStations } from '../sim/station-names.js';
import { distanceText, durationText, moneyBlocks, moneyText, stationLabel } from './format.js';
import { createMap } from './map.js';
import { legendBox, mapCorners, northArrow, scaleBar, zoomButtons } from './map-furniture.js';
import { loadView, saveView } from './storage.js';
import { wordWithCard } from './word-card.js';

const MODES = ['그리기', '역 놓기', '지우기', '움직이기'];
/** 이름을 어디서 가져왔는지 아이 말로 */
const NAME_SOURCES = {
  동네: '동네 이름',
  중심지: '중심지 이름',
  '갈아타는 역': '갈아타는 역',
  직접: '내가 지은 이름',
  차례: '',
};

/** 화면에 쓰는 역 이름. "새 역 1"처럼 차례로 부른 이름에는 "역"을 붙이지 않는다. */
function shownName(entry) {
  return entry.source === '차례' ? entry.name : stationLabel(entry.name);
}
const KINDS = ['경전철', '지하철'];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, onClick, className = 'button') {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** 이미 있는 역이 놓인 칸(환승역이 되는 칸) */
function existingStationCells(list = stations) {
  const cells = new Set();
  for (const station of list) {
    if (station.inGrid) cells.add(station.row * grid.cols + station.col);
  }
  return cells;
}

/** @param {{onHome: () => void, onRun: (design: object) => void, runsLeft: number|null, mission: object|null}} actions */
export function renderDesign(root, { onHome, onRun, runsLeft = null, mission = null }) {
  root.replaceChildren();
  const screen = element('div', 'screen design');
  const baseYear = mission?.baseYear ?? BASE_YEAR;
  // 옛날 부산이면 그 해에 있던 역만 이미 있는 역으로 친다.
  const past = baseYear < BASE_YEAR ? networkOfYear(baseYear) : null;
  const existing = existingStationCells(past?.stations ?? stations);
  const budget = mission?.budget100M ?? rules.freeDesignBudget100M;
  const showFuture = baseYear >= 2027;

  let design = { path: [], stations: [], kind: '경전철', trainsPerHour: 8, names: {} };
  // 새 역 이름을 지을 때 쓰는 자료(그 해의 기존 역, 행정동, 중심지)
  const nameContext = stationNameContext(baseYear);
  /** 지금 이름을 고치고 있는 역의 칸. 없으면 null */
  let editing = null;

  /** 설계의 역마다 이름을 정한다(선을 따라 차례로). */
  function namesOf(d) {
    return nameStations({ design: d, ...nameContext, auto: loadView().autoNames });
  }

  /** 지도와 운행에 넘길 설계: 정한 이름을 함께 싣는다. */
  function withNames(d) {
    return { ...d, stationNames: Object.fromEntries(namesOf(d).map((entry) => [entry.cell, entry.name])) };
  }
  const history = [];
  let mode = '그리기';

  const bar = element('header', 'top-bar');
  bar.append(element('h1', 'top-title', mission ? `${mission.number}. ${mission.title}` : '노선 설계'));
  bar.append(button('처음으로', onHome));
  screen.append(bar);

  const main = element('div', 'explore-main');
  const mapBox = element('div', 'map-box');
  const panel = element('aside', 'panel');
  const map = createMap({
    onSelect: () => {},
    onCell: (cell) => onCellTap(cell),
    // 움직이기에서 새 역이나 그 이름을 누르면 이름 고치기를 연다.
    onDesignStation: (cell) => startEditing(cell),
  });
  mapBox.append(map.element);
  const legend = element('div', 'legend-holder');
  legend.append(legendBox({ view: '실제 지도', showDesign: true, future: showFuture }));
  const scale = scaleBar();
  const credit = element('p', 'credit', '© OpenStreetMap contributors');
  mapBox.append(
    ...mapCorners({ topRight: [northArrow(), zoomButtons(map)], bottomRight: [scale, credit], bottomLeft: [legend] }),
  );
  map.element.addEventListener('map-zoom', (event) => scale.update(event.detail.k));
  main.append(mapBox, panel);
  screen.append(main);
  root.append(screen);

  function remember() {
    history.push({ ...design, path: [...design.path], stations: [...design.stations], names: { ...design.names } });
  }

  function startEditing(cell) {
    if (!design.stations.includes(cell)) return;
    editing = cell;
    renderPanel();
  }

  /** 고친 이름을 저장한다. 빈 칸이면 저절로 지은 이름으로 돌아간다. */
  function saveName(cell, text) {
    const name = cleanStationName(text);
    const current = design.names?.[cell] ?? null;
    editing = null;
    if (name === current) {
      update();
      return;
    }
    remember();
    const names = { ...design.names };
    if (name) names[cell] = name;
    else delete names[cell];
    design = { ...design, names };
    update();
  }

  function onCellTap(cell) {
    if (mode === '그리기') {
      const next = extendPath(grid, design.path, cell);
      if (next === design.path) return;
      remember();
      design = { ...design, path: next, stations: design.stations.filter((s) => next.includes(s)) };
    } else if (mode === '역 놓기') {
      if (!design.path.includes(cell)) return;
      remember();
      const has = design.stations.includes(cell);
      design = {
        ...design,
        stations: has ? design.stations.filter((s) => s !== cell) : [...design.stations, cell],
      };
    } else if (mode === '지우기') {
      if (!design.path.includes(cell)) return;
      remember();
      if (design.stations.includes(cell)) {
        design = { ...design, stations: design.stations.filter((s) => s !== cell) };
      } else {
        const cut = design.path.slice(0, design.path.indexOf(cell) + 1);
        design = { ...design, path: cut, stations: design.stations.filter((s) => cut.includes(s)) };
      }
    }
    update();
  }

  function undo() {
    const previous = history.pop();
    if (!previous) return;
    design = previous;
    update();
  }

  function clearAll() {
    if (design.path.length === 0) return;
    remember();
    design = { ...design, path: [], stations: [] };
    update();
  }

  function setMode(next) {
    mode = next;
    map.setMode(next === '움직이기' ? '역' : '칸');
    update();
  }

  function update() {
    // 지운 역의 고친 이름은 버린다(그 칸에 다시 역을 놓으면 새로 짓는다).
    const names = design.names ?? {};
    const kept = Object.fromEntries(Object.entries(names).filter(([cell]) => design.stations.includes(Number(cell))));
    if (Object.keys(kept).length !== Object.keys(names).length) design = { ...design, names: kept };
    if (editing !== null && !design.stations.includes(editing)) editing = null;
    map.setDesign(withNames(design));
    renderPanel();
  }

  /** 역 이름 목록. 이름을 누르면 그 자리에서 고칠 수 있다. */
  function renderNames(named) {
    panel.append(element('h3', null, '역 이름'));
    const auto = loadView().autoNames;
    const toggle = button(auto ? '이름 저절로 짓기: 켬' : '이름 저절로 짓기: 끔', () => {
      saveView({ autoNames: !auto });
      update();
    });
    toggle.classList.toggle('is-on', auto);
    toggle.setAttribute('aria-pressed', String(auto));
    panel.append(toggle);
    panel.append(
      element(
        'p',
        'panel-note',
        auto ? '가까운 역, 중심지, 동네 이름을 보고 지어요.' : '저절로 짓지 않아요. 차례대로 새 역 1, 2 …로 불러요.',
      ),
    );
    panel.append(element('p', 'panel-note guide', '이름을 누르면 고칠 수 있어요.'));
    panel.append(element('p', 'panel-note guide', '움직이기를 고르고 지도의 새 역 이름을 눌러도 돼요.'));

    const list = element('ol', 'name-list');
    for (const entry of named) {
      const item = element('li');
      if (editing === entry.cell) {
        item.append(nameEditor(entry));
      } else {
        const open = button('', () => startEditing(entry.cell), 'name-button');
        open.append(element('span', 'name-order', `${entry.order}`), element('span', 'name-text', shownName(entry)));
        const from = NAME_SOURCES[entry.source];
        if (from) open.append(element('span', 'name-source', from));
        open.setAttribute('aria-label', `${entry.order}번째 역 ${shownName(entry)}, 눌러서 이름 고치기`);
        item.append(open);
      }
      list.append(item);
    }
    panel.append(list);
  }

  /** 이름 고치는 칸 */
  function nameEditor(entry) {
    const box = element('div', 'name-editor');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'text-input';
    input.maxLength = 12;
    input.value = entry.source === '차례' ? '' : entry.name;
    input.placeholder = entry.name;
    input.setAttribute('aria-label', `${entry.order}번째 역 이름`);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') saveName(entry.cell, input.value);
      if (event.key === 'Escape') {
        editing = null;
        renderPanel();
      }
    });
    const row = element('div', 'tool-row');
    row.append(
      button('저장', () => saveName(entry.cell, input.value)),
      button('취소', () => {
        editing = null;
        renderPanel();
      }),
    );
    if (design.names?.[entry.cell]) row.append(button('처음 이름으로', () => saveName(entry.cell, '')));
    box.append(input, row);
    box.append(element('p', 'panel-note', '끝의 "역"은 저절로 붙어요. 비워 두면 처음 이름으로 돌아가요.'));
    // 그린 뒤에 입력 칸으로 옮겨 간다.
    requestAnimationFrame(() => {
      box.scrollIntoView({ block: 'center' });
      input.focus();
      input.select();
    });
    return box;
  }

  function renderPanel() {
    panel.replaceChildren();
    const cost = designCost(design, grid, rules, ruleTables, existing);

    // 과제 카드 또는 자유 설계 안내
    if (mission) {
      const card = element('div', 'mission-brief');
      card.append(element('h2', null, mission.title));
      card.append(element('p', 'mission-question', mission.question));
      card.append(element('p', 'panel-note guide', mission.hint));
      if (showFuture) card.append(element('p', 'panel-note', '점선은 앞으로 생길 노선이에요.'));
      if (mission.dayType !== '평일') {
        card.append(element('p', 'panel-note', `이 과제는 ${mission.dayType} 자료로 하루를 돌려요.`));
      }
      if (past) {
        card.append(element('p', 'panel-note', `지도에 ${baseYear}년 노선만 있어요.`));
        card.append(element('p', 'panel-note', '사는 사람과 가는 곳은 지금 자료를 써요. 그때 자료를 구하지 못했어요.'));
      }
      panel.append(card);
    } else {
      panel.append(element('h2', null, '노선 만들기'));
    }
    panel.append(element('p', 'panel-note guide', '지도에서 칸을 눌러 선을 그어요. 한 칸은 1km예요.'));

    // 모드 고르기
    const modeBox = element('div', 'tool-row');
    modeBox.setAttribute('role', 'group');
    modeBox.setAttribute('aria-label', '무엇을 할지 고르기');
    for (const name of MODES) {
      const node = button(name, () => setMode(name), 'button tool');
      node.setAttribute('aria-pressed', String(name === mode));
      if (name === mode) node.classList.add('is-on');
      modeBox.append(node);
    }
    panel.append(modeBox);

    const undoRow = element('div', 'tool-row');
    const undoButton = button(`되돌리기${history.length ? ` (${history.length})` : ''}`, undo);
    undoButton.disabled = history.length === 0;
    undoRow.append(undoButton, button('다 지우기', clearAll));
    panel.append(undoRow);

    // 공사비와 예산
    panel.append(element('h3', null, '공사비'));
    const used = Math.min(1, cost.total / budget);
    const barOuter = element('div', 'budget-bar');
    const barInner = element('div', 'budget-fill');
    barInner.style.width = `${(used * 100).toFixed(1)}%`;
    if (cost.total > budget) barInner.classList.add('over');
    barOuter.append(barInner);
    panel.append(barOuter);
    panel.append(element('p', null, `예산 ${moneyText(budget)} 가운데 ${moneyText(cost.total)}을 썼어요.`));
    if (cost.total > budget) panel.append(element('p', 'warn', '예산을 넘었어요. 선을 줄이거나 역을 빼 보세요.'));

    // 벽돌 그림(1블록 = 100억 원)
    const blocks = element('div', 'blocks');
    const count = Math.min(moneyBlocks(cost.total), 200);
    for (let i = 0; i < count; i++) blocks.append(element('span', 'block'));
    panel.append(blocks);
    panel.append(element('p', 'panel-note', '벽돌 한 개는 100억 원이에요.'));

    // 내역
    const list = element('ul', 'panel-list');
    list.append(element('li', null, `길이: ${distanceText(cost.lengthKm * 1000)} (${cost.lengthKm}칸)`));
    const transfers = cost.stations.filter((s) => s.transfer).length;
    list.append(
      element('li', null, `역: ${design.stations.length}개${transfers > 0 ? ` (갈아타는 역 ${transfers}개)` : ''}`),
    );
    list.append(element('li', null, `선 공사비: ${moneyText(cost.lineCost)}`));
    list.append(element('li', null, `역 공사비: ${moneyText(cost.stationCost)}`));
    for (const [terrain, value] of Object.entries(cost.byTerrain)) {
      const card = ruleTables.terrainCost[terrain];
      if (!card) continue;
      list.append(element('li', 'panel-note', `${card.card} → ${moneyText(value)}`));
    }
    panel.append(list);

    // 노선 종류
    panel.append(element('h3', null, '노선 종류'));
    const kindBox = element('div', 'tool-row');
    for (const kind of KINDS) {
      const node = button(kind, () => {
        remember();
        design = { ...design, kind };
        update();
      });
      node.setAttribute('aria-pressed', String(kind === design.kind));
      if (kind === design.kind) node.classList.add('is-on');
      kindBox.append(node);
    }
    panel.append(kindBox);
    panel.append(element('p', 'panel-note', ruleTables.lineKinds[design.kind].card));

    // 열차 수와 배차 간격
    panel.append(element('h3', null, '한 시간에 오는 열차'));
    const trainBox = element('div', 'tool-row');
    for (const count of TRAINS_PER_HOUR) {
      const node = button(`${count}대`, () => {
        remember();
        design = { ...design, trainsPerHour: count };
        update();
      });
      node.setAttribute('aria-pressed', String(count === design.trainsPerHour));
      if (count === design.trainsPerHour) node.classList.add('is-on');
      trainBox.append(node);
    }
    panel.append(trainBox);
    const gap = headway(design.trainsPerHour);
    panel.append(
      element('p', null, `60분 ÷ ${design.trainsPerHour}대 = ${durationText(gap.minutes * 60 + gap.seconds)}마다 한 대씩 와요.`),
    );

    // 역 이름
    const named = namesOf(design);
    if (named.length > 0) renderNames(named);

    // 역 사이 거리와 시간
    const gaps = stationGaps(design, grid, ruleTables);
    if (gaps.length > 0) {
      panel.append(element('h3', null, '역 사이'));
      const gapList = element('ul', 'panel-list');
      for (const [index, item] of gaps.entries()) {
        const from = named[index] ? shownName(named[index]) : `${index + 1}번째 역`;
        const to = named[index + 1] ? shownName(named[index + 1]) : `${index + 2}번째 역`;
        gapList.append(element('li', null, `${from}에서 ${to}까지: ${distanceText(item.meters)}, ${durationText(item.seconds)}`));
      }
      panel.append(gapList);
    }

    // 모자란 곳 알려 주기와 하루 운행
    const check = checkDesign(design);
    if (!check.ok) {
      const hints = element('ul', 'panel-list');
      for (const problem of check.problems) hints.append(element('li', null, problem));
      panel.append(element('h3', null, '아직 할 일'), hints);
    }
    const overBudget = cost.total > budget;
    const noRuns = runsLeft === 0;
    // 운행 단추는 패널 아래에 늘 붙여 둔다. 세로 화면에서 패널이 길어도 스크롤하지 않고 누를 수 있다.
    const dock = element('div', 'run-dock');
    const runButton = button('하루 운행 해 보기', () => onRun(withNames(design)), 'button big');
    runButton.disabled = !check.ok || overBudget || noRuns;
    dock.append(runButton);
    if (noRuns) {
      dock.append(element('p', 'warn', '오늘 운행은 모두 끝났어요. 내일 첫차는 05:30이에요.'));
    } else if (runsLeft !== null) {
      const left = element('p', 'panel-note');
      left.append(element('span', null, '오늘 남은 '), wordWithCard('운행', '운행'), element('span', null, `: ${runsLeft}번`));
      dock.append(left);
    }
    panel.append(dock);
  }

  map.resize();
  map.setView('실제 지도');
  if (past) map.setNetwork(past);
  if (showFuture) map.setFuture(futureLines);
  if (mission?.focus) map.focusOn(mission.focus.col, mission.focus.row, 2);
  else map.fit();
  setMode('그리기');
  scale.update(map.zoom);

  const onResize = () => {
    map.resize();
    scale.update(map.zoom);
  };
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}
