// 하루 운행 화면(SPEC 6장 4번). 첫차부터 막차까지 약 60초 동안 보여 준다.
// 시계가 돌고, 열차 점이 움직이고, 역마다 사람이 차오른다. 건너뛰기 단추가 있다.
// 열차는 노선마다 배차 간격대로 양쪽 끝에서 떠나고, 역 사이 시간과 서는 시간을 지킨다(src/sim/train-motion.js).
// 새 노선 열차는 지도에 그린 곡선을 따라 달린다.
// 기기가 '동작 줄이기'면 점은 움직이지 않고 시계와 막대만 바뀐다(SPEC 7.1).
import { lineById, stationById } from '../data.js';
import { isNewLineId, isNewStationId, splitNewStationId } from '../sim/plan.js';
import { pointBetween } from '../sim/line-shape.js';
import { lineRoutes, trainsAt } from '../sim/train-motion.js';
import { countText } from './format.js';
import { CELL, DESIGN_COLOR, FUTURE_COLOR, createMap, designShape } from './map.js';
import { mapCorners, northArrow, scaleBar } from './map-furniture.js';
import { loadView, saveView } from './storage.js';

const NS = 'http://www.w3.org/2000/svg';
const START_HOUR = 5;
const END_HOUR = 24;
const SECONDS = 60;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** "05:30" 꼴 시계 */
function clockText(hour) {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * @param {{plan: {lines: object[]}, result: object, world: object, hourShape: number[], onDone: () => void}} p
 *   plan은 설계 묶음(새 노선 여러 개)이다.
 *   world는 새 노선을 넣은 세상(withDesign). 노선마다 역 차례와 시간을 여기서 읽는다.
 */
export function renderRunning(root, { plan, result, world, hourShape, onDone }) {
  /** 내가 고른 새 노선 색 */
  /** 새 노선 번호 → 설계 */
  const lineOf = new Map(plan.lines.map((line) => [line.id, line]));
  const colorOf = (lineId) => lineOf.get(lineId)?.color ?? DESIGN_COLOR;
  root.replaceChildren();
  const screen = element('div', 'screen running');
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const bar = element('header', 'top-bar');
  bar.append(element('h1', 'top-title', '하루 운행'));
  const skip = element('button', 'button', '건너뛰기');
  skip.type = 'button';
  bar.append(skip);
  screen.append(bar);

  const main = element('div', 'explore-main running-main');
  const mapBox = element('div', 'map-box');
  const map = createMap({ onSelect: () => {} });
  mapBox.append(map.element);
  const scale = scaleBar();
  mapBox.append(
    ...mapCorners({ topRight: [northArrow()], bottomRight: [scale, element('p', 'credit', '© OpenStreetMap contributors')] }),
  );
  map.element.addEventListener('map-zoom', (event) => scale.update(event.detail.k));

  const panel = element('aside', 'panel');
  const clock = element('p', 'run-clock', '05:00');
  const counter = element('p', 'run-count', '아직 아무도 타지 않았어요.');
  const progressOuter = element('div', 'budget-bar');
  const progressFill = element('div', 'budget-fill');
  progressOuter.append(progressFill);
  const note = element('p', 'panel-note', reduceMotion ? '동작을 줄여서 열차 점은 움직이지 않아요.' : '점 하나가 열차 한 대예요. 배차 간격마다 양쪽 끝에서 떠나요.');
  const topBox = element('div', 'run-top');
  // 탄 사람 수와 많이 타는 역을 내 노선만 볼지, 부산 전체를 볼지 고른다(기본은 내 노선).
  const SCOPES = ['내 노선', '부산 전체'];
  let scope = loadView().runScope;
  const scopeRow = element('div', 'tool-row');
  scopeRow.setAttribute('role', 'group');
  scopeRow.setAttribute('aria-label', '어느 노선의 사람 수를 볼지 고르기');
  const scopeButtons = SCOPES.map((name) => {
    const node = element('button', 'button', name);
    node.type = 'button';
    node.addEventListener('click', () => {
      if (scope === name) return;
      scope = name;
      saveView({ runScope: name });
      buildBars();
      paint(lastProgress);
    });
    scopeRow.append(node);
    return node;
  });
  const topTitle = element('h3', null, '많이 타는 역');
  panel.append(element('h2', null, '오늘 하루'), clock, progressOuter, scopeRow, counter, note, topTitle, topBox);
  main.append(mapBox, panel);
  screen.append(main);
  root.append(screen);

  map.resize();
  map.setView('실제 지도');
  map.setPlan(plan.lines, -1);
  map.fit();
  scale.update(map.zoom);

  // 역마다 하루에 타는 사람 수
  const boardById = new Map(result.stations.map((s) => [s.id, s.board]));
  const maxBoard = Math.max(1, ...boardById.values());
  const isNew = (id) => isNewStationId(id);
  const newStations = result.stations.filter((station) => isNew(station.id));
  /** 내 노선에 탄 사람(새 노선 역에서 탄 사람을 모두 더한 것) */
  const newLineBoard = newStations.reduce((sum, station) => sum + station.board, 0);

  let bars = [];
  let barMax = 1;
  function buildBars() {
    const mine = scope === '내 노선';
    const pool = mine ? newStations : result.stations;
    const top = [...pool].sort((a, b) => b.board - a.board || a.id.localeCompare(b.id)).slice(0, 5);
    barMax = Math.max(1, ...top.map((station) => station.board));
    topTitle.textContent = mine ? '내 노선에서 많이 타는 역' : '부산에서 많이 타는 역';
    for (const [index, node] of scopeButtons.entries()) {
      const on = SCOPES[index] === scope;
      node.classList.toggle('is-on', on);
      node.setAttribute('aria-pressed', String(on));
    }
    topBox.replaceChildren();
    if (top.length === 0) topBox.append(element('p', 'panel-note', '내 노선에 역이 없어요.'));
    bars = top.map((station) => {
      const row = element('div', 'run-bar-row');
      const own = splitNewStationId(station.id);
      const name = stationById.get(station.id)?.name ?? lineOf.get(own?.line)?.stationNames?.[own?.cell] ?? '새 역';
      row.append(element('span', 'run-bar-name', name));
      const track = element('div', 'run-bar');
      const fill = element('div', 'run-bar-fill');
      const color = isNew(station.id) ? colorOf(splitNewStationId(station.id).line) : lineById.get(stationById.get(station.id)?.line)?.color;
      fill.style.background = color ?? '#1F3342';
      track.append(fill);
      row.append(track);
      const value = element('span', 'run-bar-value', '');
      row.append(value);
      topBox.append(row);
      return { station, fill, value };
    });
  }
  buildBars();

  // 열차 점: 노선마다 배차 간격대로 달린다.
  const overlay = map.overlay();
  const routes = !reduceMotion && world ? lineRoutes(world) : [];
  const positionOf = new Map((world?.stations ?? []).map((station) => [station.id, station]));
  // 새 노선은 지도에 그린 곡선 위로 달린다. 역마다 곡선 위 자리를 찾아 둔다.
  // 새 노선마다: 곡선 모양과, 역 번호 → 곡선 위 자리
  const shapes = new Map(
    plan.lines.map((line) => {
      const shape = designShape(line);
      return [line.id, { shape, indexOf: new Map(shape.stops.map((stop) => [`${line.id}-${stop.cell}`, stop.index])) }];
    }),
  );

  /** 노선 위 자리(역 차례, 소수) → 지도 좌표 */
  function pointOnRoute(route, at) {
    const i = Math.max(0, Math.min(Math.floor(at), route.stops.length - 2));
    const t = at - i;
    const a = route.stops[i];
    const b = route.stops[i + 1];
    const own = shapes.get(route.line);
    if (own && own.indexOf.has(a) && own.indexOf.has(b)) {
      const point = pointBetween(own.shape.points, own.indexOf.get(a), own.indexOf.get(b), t);
      return { x: point.x * CELL, y: point.y * CELL };
    }
    const pa = positionOf.get(a);
    const pb = positionOf.get(b);
    if (!pa || !pb) return null;
    return { x: (pa.x + (pb.x - pa.x) * t) * CELL, y: (pa.y + (pb.y - pa.y) * t) * CELL };
  }

  const trains = routes.map((route) => ({
    route,
    color: isNewLineId(route.line) ? colorOf(route.line) : (lineById.get(route.line)?.color ?? FUTURE_COLOR),
    // 쓰고 남은 점은 숨겨 두었다가 다시 쓴다.
    pool: [],
  }));

  function paintTrains(hour) {
    for (const item of trains) {
      const now = trainsAt(item.route, hour);
      const isBus = lineOf.get(item.route.line)?.kind === '버스';
      while (item.pool.length < now.length) {
        // 버스는 네모, 열차는 동그라미(색만으로 가르지 않는다)
        const dot = isBus
          ? svgEl('rect', { width: 9, height: 9, fill: item.color, stroke: '#FFFFFF', 'stroke-width': 1 })
          : svgEl('circle', {
              r: isNewLineId(item.route.line) ? 4.5 : 3.5,
              fill: item.color,
              stroke: '#FFFFFF',
              'stroke-width': 1,
            });
        overlay.append(dot);
        item.pool.push(dot);
      }
      item.pool.forEach((dot, index) => {
        const train = now[index];
        const point = train ? pointOnRoute(item.route, train.at) : null;
        if (!point) {
          dot.setAttribute('display', 'none');
          return;
        }
        dot.removeAttribute('display');
        if (isBus) {
          dot.setAttribute('x', (point.x - 4.5).toFixed(1));
          dot.setAttribute('y', (point.y - 4.5).toFixed(1));
        } else {
          dot.setAttribute('cx', point.x.toFixed(1));
          dot.setAttribute('cy', point.y.toFixed(1));
        }
      });
    }
  }

  // 시간대별 누적 비율
  const cumulative = [];
  let sum = 0;
  for (const share of hourShape) {
    sum += share;
    cumulative.push(sum);
  }
  const shareUntil = (hour) => {
    if (hour <= START_HOUR) return 0;
    const index = Math.min(23, Math.floor(hour));
    const before = index > 0 ? cumulative[index - 1] : 0;
    const inside = hourShape[index] * (hour - index);
    return Math.min(1, before + inside);
  };

  let startTime = null;
  let finished = false;
  let frame = null;

  let lastProgress = 0;
  function paint(progress) {
    lastProgress = progress;
    const hour = START_HOUR + (END_HOUR - START_HOUR) * progress;
    const share = shareUntil(hour);
    clock.textContent = clockText(hour);
    progressFill.style.width = `${(progress * 100).toFixed(1)}%`;
    const mine = scope === '내 노선';
    const people = (mine ? newLineBoard : result.totals.board) * share;
    const where = mine ? '내 노선에는' : '부산 도시철도에는';
    counter.textContent = people < 1 ? `${where} 아직 아무도 타지 않았어요.` : `${where} 지금까지 ${countText(people)}이 탔어요.`;
    for (const item of bars) {
      const value = item.station.board * share;
      item.fill.style.width = `${((item.station.board / barMax) * share * 100).toFixed(1)}%`;
      item.value.textContent = countText(value);
    }
    map.setStationSize((id) => {
      const board = boardById.get(id) ?? 0;
      const base = 3.2;
      return base + 6 * Math.sqrt((board * share) / maxBoard);
    });
    paintTrains(hour);
  }

  function finish() {
    if (finished) return;
    finished = true;
    if (frame) cancelAnimationFrame(frame);
    paint(1);
    onDone();
  }

  function step(now) {
    if (startTime === null) startTime = now;
    const progress = Math.min(1, (now - startTime) / (SECONDS * 1000));
    paint(progress);
    if (progress >= 1) {
      finish();
      return;
    }
    frame = requestAnimationFrame(step);
  }

  skip.addEventListener('click', finish);
  paint(0);
  frame = requestAnimationFrame(step);

  return () => {
    finished = true;
    if (frame) cancelAnimationFrame(frame);
  };
}
