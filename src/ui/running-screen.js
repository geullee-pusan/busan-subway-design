// 하루 운행 화면(SPEC 6장 4번). 첫차부터 막차까지 약 60초 동안 보여 준다.
// 시계가 돌고, 열차 점이 움직이고, 역마다 사람이 차오른다. 건너뛰기 단추가 있다.
// 기기가 '동작 줄이기'면 점은 움직이지 않고 시계와 막대만 바뀐다(SPEC 7.1).
import { lineById, stationById } from '../data.js';
import { NEW_LINE_ID } from '../sim/design-world.js';
import { countText } from './format.js';
import { CELL, DESIGN_COLOR, createMap } from './map.js';
import { mapCorners, northArrow, scaleBar } from './map-furniture.js';

const NS = 'http://www.w3.org/2000/svg';
const START_HOUR = 5;
const END_HOUR = 24;
const SECONDS = 60;
const DOTS_PER_LINE = 4;

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

/** 노선을 따라가는 길(지도 좌표) */
function linePolyline(line, positions) {
  return line.stations.map((id) => positions(id)).filter(Boolean);
}

function pointOnPath(points, fraction) {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0];
  const clamped = Math.max(0, Math.min(1, fraction));
  const total = points.length - 1;
  const position = clamped * total;
  const index = Math.min(Math.floor(position), total - 1);
  const t = position - index;
  const a = points[index];
  const b = points[index + 1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * @param {{design: object, result: object, hourShape: number[], onDone: () => void}} p
 */
export function renderRunning(root, { design, result, hourShape, onDone }) {
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
  const note = element('p', 'panel-note', reduceMotion ? '동작을 줄여서 열차 점은 움직이지 않아요.' : '점 하나가 열차 한 대예요.');
  const topBox = element('div', 'run-top');
  panel.append(element('h2', null, '오늘 하루'), clock, progressOuter, counter, note, element('h3', null, '많이 타는 역'), topBox);
  main.append(mapBox, panel);
  screen.append(main);
  root.append(screen);

  map.resize();
  map.setView('실제 지도');
  map.setDesign(design);
  map.fit();
  scale.update(map.zoom);

  // 역마다 하루에 타는 사람 수
  const boardById = new Map(result.stations.map((s) => [s.id, s.board]));
  const maxBoard = Math.max(1, ...boardById.values());
  const top = [...result.stations].sort((a, b) => b.board - a.board).slice(0, 5);
  const bars = top.map((station) => {
    const row = element('div', 'run-bar-row');
    const cell = station.id.startsWith(`${NEW_LINE_ID}-`) ? station.id.slice(NEW_LINE_ID.length + 1) : null;
    const name = stationById.get(station.id)?.name ?? design.stationNames?.[cell] ?? '새 역';
    row.append(element('span', 'run-bar-name', name));
    const track = element('div', 'run-bar');
    const fill = element('div', 'run-bar-fill');
    const color = station.id.startsWith(`${NEW_LINE_ID}-`) ? DESIGN_COLOR : lineById.get(stationById.get(station.id)?.line)?.color;
    fill.style.background = color ?? '#1F3342';
    track.append(fill);
    row.append(track);
    const value = element('span', 'run-bar-value', '');
    row.append(value);
    topBox.append(row);
    return { station, fill, value };
  });

  // 열차 점
  const overlay = map.overlay();
  const positionOf = (id) => {
    const station = stationById.get(id);
    if (station) return { x: station.x * CELL, y: station.y * CELL };
    return null;
  };
  const dots = [];
  if (!reduceMotion) {
    for (const line of [...lineById.values()]) {
      const points = linePolyline(line, positionOf);
      if (points.length < 2) continue;
      for (let i = 0; i < DOTS_PER_LINE; i++) {
        const dot = svgEl('circle', { r: 3.5, fill: line.color ?? '#1F3342', stroke: '#FFFFFF', 'stroke-width': 1 });
        overlay.append(dot);
        dots.push({ dot, points, offset: i / DOTS_PER_LINE, direction: i % 2 === 0 ? 1 : -1 });
      }
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

  function paint(progress) {
    const hour = START_HOUR + (END_HOUR - START_HOUR) * progress;
    const share = shareUntil(hour);
    clock.textContent = clockText(hour);
    progressFill.style.width = `${(progress * 100).toFixed(1)}%`;
    const people = result.totals.board * share;
    counter.textContent = people < 1 ? '아직 아무도 타지 않았어요.' : `지금까지 ${countText(people)}이 탔어요.`;
    for (const item of bars) {
      const value = item.station.board * share;
      item.fill.style.width = `${((item.station.board / maxBoard) * share * 100).toFixed(1)}%`;
      item.value.textContent = countText(value);
    }
    map.setStationSize((id) => {
      const board = boardById.get(id) ?? 0;
      const base = 3.2;
      return base + 6 * Math.sqrt((board * share) / maxBoard);
    });
    for (const item of dots) {
      const fraction = (item.offset + progress * 3 * item.direction + 10) % 1;
      const point = pointOnPath(item.points, fraction);
      if (!point) continue;
      item.dot.setAttribute('cx', point.x.toFixed(1));
      item.dot.setAttribute('cy', point.y.toFixed(1));
    }
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
