// 설계 화면(docs/SPEC.md 6장 2번, 7.2절).
// 격자를 따라 선을 긋고 역을 놓는다. 공사비와 예산이 바로 보이고, 되돌리기는 무제한이다.
import { futureLines, grid, ruleTables, stations } from '../data.js';
import { BASE_YEAR, canUseThenPopulation, designStationInfo, networkOfYear, rules, stationNameContext } from '../model.js';
import { TRAINS_PER_HOUR, connectStations, headway, stationGaps } from '../sim/design.js';
import { MAX_LINES, asPlan, checkPlan, lineIdAt, planCost } from '../sim/plan.js';
import { extendPath } from '../sim/design.js';
import { cleanStationName, nameStations } from '../sim/station-names.js';
import { countText, distanceText, durationText, moneyText, stationLabel } from './format.js';
import { DESIGN_COLOR, createMap, labelInk, looseStations } from './map.js';
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

/** 화면에 쓰는 역 이름. "새 역 1"처럼 차례로 부른 이름에는 "역"을 붙이지 않는다. 버스 노선이면 "○○ 정류장" */
function shownNameOf(entry, kind) {
  if (kind === '버스') return entry.source === '차례' ? entry.name.replace('새 역', '새 정류장') : `${entry.name.replace(/역$/, '')} 정류장`;
  return entry.source === '차례' ? entry.name : stationLabel(entry.name);
}
const KINDS = ['경전철', '지하철', '버스'];
/** 예상 승객 단계(1~5)를 아이 말로 */
const RIDER_WORDS = ['', '아주 조금', '조금', '보통', '많이', '아주 많이'];
/** 새 노선 이름의 기본값과 가장 긴 길이 */
const DEFAULT_LINE_NAME = '새 노선';
/** 새 노선마다 처음 색(노선 번호 "새1, 새2 …"도 함께 붙인다. 색만으로 가르지 않는다) */
const LINE_COLORS = [DESIGN_COLOR, '#1E6FD9', '#2E8B3E', '#8E44AD', '#C77C0E'];

/** 새 노선 하나(빈 것) */
function emptyLine(index) {
  return {
    path: [],
    stations: [],
    kind: '경전철',
    trainsPerHour: 8,
    names: {},
    color: LINE_COLORS[index % LINE_COLORS.length],
    lineName: index === 0 ? DEFAULT_LINE_NAME : `${DEFAULT_LINE_NAME} ${index + 1}`,
  };
}

/** 노선 번호 글자: 새1, 새2 … */
function lineLabel(index) {
  return `새${index + 1}`;
}
const LINE_NAME_MAX = 12;
/** 색 손잡이: 빨강, 초록, 파랑(0~255) */
const RGB = [
  { key: 'r', label: '빨강 R' },
  { key: 'g', label: '초록 G' },
  { key: 'b', label: '파랑 B' },
];

/** "#C0392B" → {r, g, b} */
function hexToRgb(hex) {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1] ?? DESIGN_COLOR.slice(1);
  return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) };
}

/** {r, g, b} → "#C0392B" */
function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** 노선 이름 다듬기: 앞뒤 빈칸을 빼고 길이를 줄인다. 비면 기본 이름 */
function cleanLineName(text) {
  const name = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, LINE_NAME_MAX);
  return name || DEFAULT_LINE_NAME;
}

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

/**
 * @param {{onHome: () => void, onRun: (design: object) => void, onRide?: (design: object) => void,
 *   runsLeft: number|null, mission: object|null, baseYear?: number|null, initialDesign?: object|null}} actions
 *   baseYear: 옛날 부산에서 고른 해(자유 설계). initialDesign: 시승이나 어림하기에서 돌아왔을 때 이어서 고칠 설계
 */
export function renderDesign(root, { onHome, onRun, onRide = null, runsLeft = null, mission = null, baseYear: freeYear = null, initialDesign = null }) {
  root.replaceChildren();
  const screen = element('div', 'screen design');
  // 기준 연도: 과제 카드의 해, 옛날 부산에서 고른 해(자유 설계), 아니면 지금
  const baseYear = mission?.baseYear ?? freeYear ?? BASE_YEAR;
  // 옛날 부산이면 그 해에 있던 역만 이미 있는 역으로 친다.
  const past = baseYear < BASE_YEAR ? networkOfYear(baseYear) : null;
  const existing = existingStationCells(past?.stations ?? stations);
  const budget = mission?.budget100M ?? rules.freeDesignBudget100M;
  const showFuture = baseYear >= 2027;

  // 새 노선 여러 개. design은 지금 고치고 있는 노선(lines[active])이다. 고친 것은 sync()로 lines에 적는다.
  let lines = [emptyLine(0)];
  if (initialDesign) {
    lines = asPlan(initialDesign).lines.map((line, index) => ({
      ...emptyLine(index),
      path: [...line.path],
      stations: [...line.stations],
      kind: line.kind ?? '경전철',
      trainsPerHour: line.trainsPerHour ?? 8,
      names: { ...(line.names ?? {}) },
      color: line.color ?? LINE_COLORS[index % LINE_COLORS.length],
      lineName: line.lineName ?? emptyLine(index).lineName,
    }));
  }
  let active = 0;
  let design = lines[0];

  /** 고치고 있는 노선을 lines에 적는다. */
  function sync() {
    lines[active] = design;
  }
  /** 지금 고치는 노선의 역 이름(버스면 정류장) */
  const shownName = (entry) => shownNameOf(entry, design.kind);
  /** 역 잇기에서 길을 찾지 못한 역이 있으면 알려 줄 말 */
  let connectNote = null;
  // 새 역 이름을 지을 때 쓰는 자료(그 해의 기존 역, 행정동, 중심지)
  const nameContext = stationNameContext(baseYear);
  /** 지금 이름을 고치고 있는 역의 칸. 없으면 null */
  let editing = null;
  /** 마지막으로 놓은 역의 칸. 지도 왼쪽 위에 그 역의 정보 단추를 띄운다. */
  let lastPlaced = null;
  /** 역 정보는 설계가 바뀔 때만 다시 센다(하루를 한 번 돌린다). */
  let infoCache = { key: null, info: null };

  /**
   * 모든 노선의 역 이름과 자리를 정한다(노선 차례대로).
   * 뒤 노선의 역이 앞 노선 역과 같은 칸이면 그 이름을 쓰고(갈아타는 역) 그 자리에 겹쳐 그린다.
   * 이미 쓴 이름은 다른 역이 쓰지 않는다.
   * @returns {{lines: object[], entries: object[][]}} lines는 지도와 운행에 넘길 노선들, entries는 노선마다 이름 목록
   */
  function nameAll() {
    sync();
    const extra = []; // 앞 노선의 새 역: {name, cell, x, y}
    const out = [];
    const entries = [];
    const center = (cell) => ({ x: (cell % grid.cols) + 0.5, y: Math.floor(cell / grid.cols) + 0.5 });
    lines.forEach((line, index) => {
      const named = nameStations({
        design: line,
        ...nameContext,
        existing: [...nameContext.existing, ...extra],
        auto: loadView().autoNames,
      });
      const points = new Map(transferPoints);
      for (const e of extra) if (!points.has(e.cell)) points.set(e.cell, { x: e.x, y: e.y });
      const stationPoints = Object.fromEntries(line.stations.filter((cell) => points.has(cell)).map((cell) => [cell, points.get(cell)]));
      out.push({
        ...line,
        id: lineIdAt(index),
        stationNames: Object.fromEntries(named.map((entry) => [entry.cell, entry.name])),
        stationPoints,
      });
      entries.push(named);
      for (const entry of named) {
        const point = stationPoints[entry.cell] ?? center(entry.cell);
        extra.push({ name: entry.name, cell: entry.cell, x: point.x, y: point.y });
      }
    });
    return { lines: out, entries };
  }

  /** 지금 고치는 노선의 역 이름 목록 */
  function namesOf() {
    return nameAll().entries[active];
  }

  /** 운행과 시승에 넘길 설계 묶음 */
  function planOut() {
    return { lines: nameAll().lines };
  }
  /** 칸 → 그 칸에 처음 나온 기존 역의 자리(칸 단위 좌표) */
  const transferPoints = new Map();
  for (const station of nameContext.existing) {
    if (!transferPoints.has(station.cell)) transferPoints.set(station.cell, { x: station.x, y: station.y });
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
  // 새 노선이 여럿이면 paintLineColor가 범례를 다시 그린다.
  const scale = scaleBar();
  const credit = element('p', 'credit', '© OpenStreetMap contributors');
  // 마지막으로 놓은 역의 정보 단추(역을 놓으면 뜬다)
  const infoSpot = element('div', 'map-info-spot');
  mapBox.append(
    ...mapCorners({
      topLeft: [infoSpot],
      topRight: [northArrow(), zoomButtons(map)],
      bottomRight: [scale, credit],
      bottomLeft: [legend],
    }),
  );
  map.element.addEventListener('map-zoom', (event) => scale.update(event.detail.k));
  main.append(mapBox, panel);
  screen.append(main);
  root.append(screen);

  function remember() {
    sync();
    history.push({
      active,
      lines: lines.map((line) => ({ ...line, path: [...line.path], stations: [...line.stations], names: { ...line.names } })),
    });
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
      design = { ...design, path: next };
    } else if (mode === '역 놓기') {
      // 선이 없는 칸에도 놓을 수 있다. 나중에 역 잇기로 선로를 놓는다.
      remember();
      const has = design.stations.includes(cell);
      lastPlaced = has ? null : cell;
      design = {
        ...design,
        stations: has ? design.stations.filter((s) => s !== cell) : [...design.stations, cell],
      };
    } else if (mode === '지우기') {
      if (design.stations.includes(cell)) {
        remember();
        design = { ...design, stations: design.stations.filter((s) => s !== cell) };
      } else if (design.path.includes(cell)) {
        remember();
        const cut = design.path.slice(0, design.path.indexOf(cell) + 1);
        design = { ...design, path: cut };
      } else {
        return;
      }
    }
    connectNote = null;
    update();
  }

  function undo() {
    const previous = history.pop();
    if (!previous) return;
    sync();
    // 노선 이름과 색은 되돌리기와 따로 둔다(색 손잡이를 움직일 때마다 기록하지 않는다).
    lines = previous.lines.map((line, index) => ({
      ...line,
      color: lines[index]?.color ?? line.color,
      lineName: lines[index]?.lineName ?? line.lineName,
    }));
    active = Math.min(previous.active, lines.length - 1);
    design = lines[active];
    connectNote = null;
    update();
  }

  function clearAll() {
    if (design.path.length === 0 && design.stations.length === 0) return;
    remember();
    design = { ...design, path: [], stations: [] };
    connectNote = null;
    update();
  }

  /** 떨어진 역을 선로로 잇는다(src/sim/design.js connectStations). */
  function connectAll() {
    if (looseStations(design).length === 0) return;
    const { path, missed } = connectStations(grid, design, ruleTables);
    if (path.length !== design.path.length) {
      remember();
      design = { ...design, path };
    }
    connectNote = missed.length > 0 ? `선로를 놓을 길이 없는 역이 ${missed.length}개 있어요. 선이 둘러싸고 있어요.` : null;
    update();
  }

  /** 노선 색을 지도, 범례, 목록에 바로 칠한다. 패널은 다시 그리지 않는다(손잡이를 끄는 중이라). */
  function paintLineColor() {
    screen.style.setProperty('--design-color', design.color);
    screen.style.setProperty('--design-ink', labelInk(design.color));
    sync();
    legend.replaceChildren(
      legendBox({
        view: '실제 지도',
        future: showFuture,
        designLines: lines.map((line, index) => ({ label: lineLabel(index), name: line.lineName, color: line.color })),
      }),
    );
    map.setPlan(nameAll().lines, active);
  }

  /** 노선 고르기, 더하기, 지우기 */
  function chooseLine(index) {
    if (index === active) return;
    sync();
    active = index;
    design = lines[active];
    editing = null;
    lastPlaced = null;
    connectNote = null;
    update();
  }

  function addLine() {
    if (lines.length >= MAX_LINES) return;
    remember();
    lines = [...lines, emptyLine(lines.length)];
    active = lines.length - 1;
    design = lines[active];
    editing = null;
    lastPlaced = null;
    connectNote = null;
    setMode('그리기');
  }

  function removeLine() {
    if (lines.length <= 1) return;
    remember();
    lines = lines.filter((_, index) => index !== active);
    active = Math.max(0, active - 1);
    design = lines[active];
    editing = null;
    lastPlaced = null;
    connectNote = null;
    update();
  }

  /** 옛날 부산: 사는 사람 자료 고르기(기본은 지금 인구) */
  function renderPopulationChoice() {
    if (!canUseThenPopulation(baseYear)) {
      panel.append(element('p', 'panel-note', '사는 사람과 가는 곳은 지금 자료를 써요. 그때 자료를 구하지 못했어요.'));
      return;
    }
    const choice = loadView().historyPopulation;
    panel.append(element('h3', null, '사는 사람'));
    const row = element('div', 'tool-row');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', '사는 사람 자료 고르기');
    for (const [value, label] of [
      ['now', '지금 인구'],
      ['then', `${baseYear}년 인구`],
    ]) {
      const node = button(label, () => {
        if (choice === value) return;
        saveView({ historyPopulation: value });
        infoCache = { key: null, info: null };
        update();
      });
      node.classList.toggle('is-on', choice === value);
      node.setAttribute('aria-pressed', String(choice === value));
      row.append(node);
    }
    panel.append(row);
    panel.append(
      element(
        'p',
        'panel-note',
        choice === 'then' ? '인구총조사로 구마다 그때 사람 수를 어림했어요.' : '지금 사는 사람으로 계산해요.',
      ),
    );
    if (choice === 'then') panel.append(element('p', 'panel-note', '가는 곳(중심지)은 지금 자료를 써요.'));
  }

  /** 패널 위쪽: 새 노선 고르기 */
  function renderLinePicker() {
    panel.append(element('h3', null, '내 노선'));
    const row = element('div', 'tool-row line-picker');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', '고칠 노선 고르기');
    lines.forEach((line, index) => {
      const node = button('', () => chooseLine(index), 'button line-pick');
      const tag = element('span', 'line-tag', lineLabel(index));
      tag.style.background = line.color;
      node.append(tag, element('span', 'line-pick-name', line.lineName));
      node.classList.toggle('is-on', index === active);
      node.setAttribute('aria-pressed', String(index === active));
      row.append(node);
    });
    panel.append(row);
    const tools = element('div', 'tool-row');
    const add = button('노선 더하기', addLine);
    add.disabled = lines.length >= MAX_LINES;
    tools.append(add);
    if (lines.length > 1) tools.append(button('이 노선 지우기', removeLine));
    panel.append(tools);
    panel.append(
      element(
        'p',
        'panel-note guide',
        lines.length >= MAX_LINES ? `노선은 ${MAX_LINES}개까지 만들 수 있어요.` : '노선을 눌러 고르고, 고른 노선을 고쳐요.',
      ),
    );
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
    if (lastPlaced !== null && !design.stations.includes(lastPlaced)) lastPlaced = null;
    paintLineColor();
    renderPanel();
    renderInfoSpot();
  }

  /** 노선 이름과 색 */
  function renderLineLook() {
    panel.append(element('h3', null, '노선 이름과 색'));
    const nameRow = element('div', 'line-name-row');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'text-input';
    input.maxLength = LINE_NAME_MAX;
    input.value = design.lineName;
    input.placeholder = DEFAULT_LINE_NAME;
    input.setAttribute('aria-label', '노선 이름');
    const saveLineName = () => {
      const name = cleanLineName(input.value);
      input.value = name;
      if (name === design.lineName) return;
      design = { ...design, lineName: name };
      paintLineColor();
    };
    input.addEventListener('change', saveLineName);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.blur();
    });
    nameRow.append(input);
    panel.append(nameRow);
    panel.append(element('p', 'panel-note guide', `이름은 ${LINE_NAME_MAX}글자까지 쓸 수 있어요.`));

    // 색 견본: 선 모양 그림과 함께
    const swatch = element('div', 'line-swatch');
    const sample = element('span', 'line-sample');
    const tag = element('span', 'line-tag design-line-tag', lineLabel(active));
    swatch.append(tag, sample);
    const code = element('span', 'line-code');
    swatch.append(code);
    panel.append(swatch);
    const light = element('p', 'warn', '밝은 색은 지도에서 잘 안 보여요.');
    const rgb = hexToRgb(design.color);
    const sliders = RGB.map(({ key, label }) => {
      const row = element('label', 'rgb-row');
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '255';
      slider.step = '1';
      slider.value = String(rgb[key]);
      slider.className = `rgb-slider rgb-${key}`;
      const value = element('span', 'rgb-value', String(rgb[key]));
      row.append(element('span', 'rgb-label', label), slider, value);
      slider.addEventListener('input', () => {
        rgb[key] = Number(slider.value);
        value.textContent = slider.value;
        design = { ...design, color: rgbToHex(rgb) };
        showColor();
      });
      panel.append(row);
      return slider;
    });
    function showColor() {
      tag.style.background = design.color;
      sample.style.background = design.color;
      code.textContent = design.color;
      light.hidden = labelInk(design.color) === design.color;
      paintLineColor();
    }
    panel.append(light);
    panel.append(
      button('처음 색으로', () => {
        Object.assign(rgb, hexToRgb(DESIGN_COLOR));
        sliders.forEach((slider, index) => {
          slider.value = String(rgb[RGB[index].key]);
          slider.parentElement.querySelector('.rgb-value').textContent = slider.value;
        });
        design = { ...design, color: DESIGN_COLOR };
        showColor();
      }),
    );
    panel.append(element('p', 'panel-note guide', '세 가지 빛(빨강, 초록, 파랑)을 섞어서 색을 만들어요.'));
    showColor();
  }

  /** 지도 왼쪽 위: 마지막으로 놓은 역의 정보 단추 */
  function renderInfoSpot() {
    infoSpot.replaceChildren();
    if (lastPlaced === null) return;
    const entry = namesOf().find((item) => item.cell === lastPlaced);
    if (!entry) return;
    const open = button(`ⓘ ${shownName(entry)} 정보`, () => openInfo(entry.cell), 'button info-button');
    open.setAttribute('aria-label', `${shownName(entry)} 정보 보기`);
    infoSpot.append(open);
  }

  /** 설계의 역 정보(칸 → 정보). 같은 설계면 다시 세지 않는다. */
  function stationInfo() {
    sync();
    const key = JSON.stringify([active, loadView().historyPopulation, lines.map((l) => [l.path, l.stations, l.kind, l.trainsPerHour])]);
    if (infoCache.key !== key) {
      infoCache = {
        key,
        info: designStationInfo(planOut(), { year: baseYear, dayType: mission?.dayType ?? '평일', population: loadView().historyPopulation }, active),
      };
    }
    return infoCache.info;
  }

  /** 막대 한 줄: 이름, 막대, 값 */
  function barRow(label, value, max, text) {
    const row = element('div', 'info-bar-row');
    const track = element('div', 'run-bar');
    const fill = element('div', 'run-bar-fill');
    fill.style.width = `${max > 0 ? Math.min(100, (value / max) * 100).toFixed(1) : 0}%`;
    fill.style.background = 'var(--design-ink, #c0392b)';
    track.append(fill);
    row.append(element('span', 'info-bar-name', label), track, element('span', 'info-bar-value', text));
    return row;
  }

  /** 역 정보 창을 연다. */
  function openInfo(cell) {
    const entry = namesOf().find((item) => item.cell === cell);
    if (!entry) return;
    const info = stationInfo()[cell];
    if (!info) return;
    // 열려 있던 창은 닫는다(한 번에 하나만).
    for (const old of screen.querySelectorAll('.info-dialog')) old.remove();
    const dialog = element('dialog', 'info-dialog');
    const shut = () => {
      if (dialog.open) dialog.close();
      dialog.remove();
    };
    dialog.setAttribute('aria-label', `${shownName(entry)} 정보`);
    const head = element('div', 'info-head');
    head.append(element('span', 'name-order', `${entry.order}`), element('h2', null, shownName(entry)));
    dialog.append(head);

    if (info.transfers.length > 0) {
      const line = element('p');
      const where = info.transfers.map((t) => `${stationLabel(t.name)}(${t.line})`).join(', ');
      line.append(wordWithCard('환승', '갈아탈'), element('span', null, ` 수 있어요: ${where}`));
      dialog.append(line);
    }

    // 둘레에 사는 사람
    const walkMin = rules.walkMaxMin;
    dialog.append(element('h3', null, '둘레에 사는 사람'));
    dialog.append(element('p', 'panel-note guide', `걸어서 ${walkMin}분 안에 사는 사람을 세요.`));
    const max = info.walkPeople;
    dialog.append(
      barRow('걸어서 올 수 있어요', info.walkPeople, max, countText(info.walkPeople)),
      barRow('이 역이 가장 가까워요', info.closestPeople, max, countText(info.closestPeople)),
      barRow('처음으로 역이 생겨요', info.newPeople, max, countText(info.newPeople)),
    );
    if (info.newPeople === 0 && info.walkPeople > 0) {
      dialog.append(element('p', 'panel-note', '여기 사는 사람은 이미 걸어갈 역이 있어요.'));
    }

    // 예상 승객: 숫자 없이 그림으로만(어림하기는 아이가 직접 한다)
    dialog.append(element('h3', null, '예상 승객'));
    if (!design.path.includes(cell)) {
      dialog.append(element('p', null, '선로로 이으면 알 수 있어요.'));
    } else if (info.riderLevel === null) {
      dialog.append(element('p', null, '역을 두 개 넘게 놓으면 알 수 있어요.'));
    } else if (info.riderLevel === 0) {
      dialog.append(element('p', null, '타는 사람이 거의 없어요.'));
    } else {
      const icons = element('div', 'rider-icons');
      icons.setAttribute('role', 'img');
      icons.setAttribute('aria-label', `사람 5개 가운데 ${info.riderLevel}개`);
      for (let i = 1; i <= 5; i++) {
        const on = i <= info.riderLevel;
        icons.append(element('span', on ? 'rider-icon on' : 'rider-icon', on ? '●' : '○'));
      }
      dialog.append(icons);
      dialog.append(element('p', null, `부산의 다른 역과 견주면 "${RIDER_WORDS[info.riderLevel]}" 타요.`));
      dialog.append(element('p', 'panel-note', '몇 명인지는 하루 운행을 해 보면 알 수 있어요.'));
    }

    // 걸어갈 수 있는 중심지
    const placesTitle = element('h3');
    placesTitle.append(element('span', null, '걸어갈 수 있는 '), wordWithCard('중심지', '중심지'));
    dialog.append(placesTitle);
    if (info.places.length === 0) {
      dialog.append(element('p', null, '걸어갈 수 있는 중심지는 없어요.'));
    } else {
      for (const place of info.places.slice(0, 4)) {
        const minutes = Math.max(1, Math.round(place.walkMin));
        dialog.append(barRow(place.name, minutes, walkMin, `걸어서 ${durationText(minutes * 60)}`));
      }
    }

    const close = button('닫기', shut, 'button big');
    dialog.append(close);
    dialog.addEventListener('close', () => dialog.remove());
    // 창 밖(어두운 곳)을 눌러도 닫힌다.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) shut();
    });
    screen.append(dialog);
    dialog.showModal();
    close.focus();
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
    panel.append(element('p', 'panel-note guide', '정보를 누르면 둘레에 사는 사람과 예상 승객을 볼 수 있어요.'));

    const list = element('ol', 'name-list');
    for (const entry of named) {
      const item = element('li');
      if (editing === entry.cell) {
        item.append(nameEditor(entry));
      } else {
        item.className = 'name-row';
        const open = button('', () => startEditing(entry.cell), 'name-button');
        open.append(element('span', 'name-order', `${entry.order}`), element('span', 'name-text', shownName(entry)));
        const from = !design.path.includes(entry.cell) ? '선로 없음' : design.kind === '버스' && entry.source === '갈아타는 역' ? '갈아타는 곳' : NAME_SOURCES[entry.source];
        if (from) open.append(element('span', 'name-source', from));
        open.setAttribute('aria-label', `${entry.order}번째 역 ${shownName(entry)}, 눌러서 이름 고치기`);
        const info = button('ⓘ 정보', () => openInfo(entry.cell), 'button info-button');
        info.setAttribute('aria-label', `${shownName(entry)} 정보 보기`);
        item.append(open, info);
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
    sync();
    const all = planCost({ lines: nameAll().lines }, grid, rules, ruleTables, existing);
    /** 모든 노선을 더한 공사비와, 지금 고치는 노선의 공사비 */
    const totalCost = all.total;
    const cost = all.lines[active];

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
      panel.append(element('h2', null, past ? `${baseYear}년 부산에 노선 만들기` : '노선 만들기'));
      if (past) {
        const note = past.stations.length === 0 ? `${baseYear}년에는 아직 도시철도가 없어요.` : `지도에 ${baseYear}년 노선만 있어요.`;
        panel.append(element('p', 'panel-note', note));
        renderPopulationChoice();
      }
    }
    renderLinePicker();
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

    // 떨어진 역을 선로로 잇기
    const loose = looseStations(design);
    const connectRow = element('div', 'tool-row');
    const connectButton = button(loose.length > 0 ? `역 잇기 (${loose.length})` : '역 잇기', connectAll, 'button connect-button');
    connectButton.disabled = loose.length === 0;
    connectButton.setAttribute('aria-label', `선로로 잇지 않은 역 ${loose.length}개를 선로로 잇기`);
    connectRow.append(connectButton);
    panel.append(connectRow);
    panel.append(element('p', 'panel-note guide', '역은 아무 칸에나 놓을 수 있어요. 역 잇기를 누르면 가까운 역부터 선로로 이어요.'));
    if (loose.length > 0) {
      panel.append(element('p', 'panel-note', `점선 동그라미는 아직 선로가 없는 역이에요. ${loose.length}개 있어요.`));
    }
    if (connectNote) panel.append(element('p', 'warn', connectNote));

    // 공사비와 예산
    panel.append(element('h3', null, lines.length > 1 ? '공사비(모든 노선)' : '공사비'));
    const used = Math.min(1, totalCost / budget);
    const barOuter = element('div', 'budget-bar');
    const barInner = element('div', 'budget-fill');
    barInner.style.width = `${(used * 100).toFixed(1)}%`;
    if (totalCost > budget) barInner.classList.add('over');
    barOuter.append(barInner);
    panel.append(barOuter);
    panel.append(element('p', null, `예산 ${moneyText(budget)} 가운데 ${moneyText(totalCost)}을 썼어요.`));
    if (totalCost > budget) panel.append(element('p', 'warn', '예산을 넘었어요. 선을 줄이거나 역을 빼 보세요.'));

    // 벽돌 그림. 예산이 크면 벽돌 한 개를 1,000억 원으로 센다(그림이 너무 많아지지 않게).
    const brick = budget >= 50000 ? 1000 : 100;
    const blocks = element('div', 'blocks');
    const count = Math.min(Math.ceil(totalCost / brick), 200);
    for (let i = 0; i < count; i++) blocks.append(element('span', 'block'));
    panel.append(blocks);
    panel.append(element('p', 'panel-note', `벽돌 한 개는 ${moneyText(brick)}이에요.`));
    if (lines.length > 1) panel.append(element('h3', null, `${lineLabel(active)} ${design.lineName} 내역`));

    // 내역
    const list = element('ul', 'panel-list');
    list.append(element('li', null, `길이: ${distanceText(cost.lengthKm * 1000)} (${cost.lengthKm}칸)`));
    const transfers = cost.stations.filter((s) => s.transfer).length;
    list.append(
      element(
        'li',
        null,
        design.kind === '버스'
          ? `정류장: ${design.stations.length}개${transfers > 0 ? ` (갈아타는 곳 ${transfers}개)` : ''}`
          : `역: ${design.stations.length}개${transfers > 0 ? ` (갈아타는 역 ${transfers}개)` : ''}`,
      ),
    );
    if (lines.length > 1) list.append(element('li', null, `이 노선 공사비: ${moneyText(cost.total)}`));
    list.append(element('li', null, `선 공사비: ${moneyText(cost.lineCost)}`));
    list.append(element('li', null, `역 공사비: ${moneyText(cost.stationCost)}`));
    if (design.kind === '버스') {
      // 버스 값은 작은 수라 어림하지 않고 그대로 쓴다.
      const eok = (value) => `${value.toLocaleString('ko-KR')}억 원`;
      list.append(element('li', null, `버스 ${cost.buses}대 × ${eok(rules.busPrice100M)} = ${eok(cost.vehicleCost)}`));
      list.append(element('li', 'panel-note', '버스가 한 바퀴 도는 동안 배차 간격마다 한 대씩 떠나야 해요.'));
      list.append(element('li', 'panel-note', '버스 한 대 값은 우리가 정한 값이에요.'));
    }
    for (const [terrain, value] of Object.entries(cost.byTerrain)) {
      const card = ruleTables.terrainCost[terrain];
      if (!card || value === 0) continue;
      list.append(element('li', 'panel-note', `${card.card} → ${moneyText(value)}`));
    }
    panel.append(list);

    renderLineLook();

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
    panel.append(element('h3', null, design.kind === '버스' ? '한 시간에 오는 버스' : '한 시간에 오는 열차'));
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
    const named = namesOf();
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
    const check = checkPlan({ lines });
    if (!check.ok) {
      const hints = element('ul', 'panel-list');
      for (const problem of check.problems) hints.append(element('li', null, problem));
      panel.append(element('h3', null, '아직 할 일'), hints);
    }
    const overBudget = totalCost > budget;
    const noRuns = runsLeft === 0;
    // 운행 단추는 패널 아래에 늘 붙여 둔다. 세로 화면에서 패널이 길어도 스크롤하지 않고 누를 수 있다.
    const dock = element('div', 'run-dock');
    const runButton = button('하루 운행 해 보기', () => onRun(planOut()), 'button big');
    runButton.disabled = !check.ok || overBudget || noRuns;
    dock.append(runButton);
    // 시승: 내 노선 열차를 타 본다. 하루 운행 횟수는 줄지 않는다.
    if (onRide) {
      const rideButton = button('시승해 보기', () => onRide(planOut()), 'button ride-button');
      rideButton.disabled = !check.ok || overBudget || noRuns;
      dock.append(rideButton);
    }
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
