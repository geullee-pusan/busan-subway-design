// 격자 지도 화면. SVG로 그리고, 한 손가락 끌기와 두 손가락 확대를 지원한다.
// 보기는 두 가지다: '실제 지도'(격자와 지형)와 '노선도'(단순화).
import { districts, grid, lineById, lines, schematic, stationById, stations } from '../data.js';
import { lineShape } from '../sim/line-shape.js';

const NS = 'http://www.w3.org/2000/svg';
/** 1km 한 칸을 몇 픽셀로 그릴지 (확대 배율 1일 때) */
export const CELL = 20;
const HIGH_MOUNTAIN_M = 400;
const TERRAIN_COLORS = {
  sea: '#B9D4E6',
  river: '#9FC6DC',
  mountain: '#C8D6BD',
  highMountain: '#9DB38E',
  hill: '#DCE3D2',
  flat: '#EDF1EC',
  field: '#F4F1E2',
};
const INK = '#1F3342';
/** 기본으로 그리는 노선망. setNetwork로 옛날 부산으로 바꿀 수 있다. */
const NOW_NETWORK = { lines, stations, stationById };
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 6;

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** 칸 색. 높은 산은 더 진하게 칠한다. */
function terrainColor(kind, elevation) {
  if (kind === 'mountain' && elevation !== null && elevation >= HIGH_MOUNTAIN_M) return TERRAIN_COLORS.highMountain;
  return TERRAIN_COLORS[kind];
}

/** 같은 색이 이어지는 칸은 하나의 네모로 묶어 그린다(빠르게). */
function terrainLayer() {
  const layer = el('g', { 'aria-hidden': 'true' });
  for (let r = 0; r < grid.rows; r++) {
    let start = 0;
    let color = terrainColor(grid.terrain[r][0], grid.elevationM[r][0]);
    for (let c = 1; c <= grid.cols; c++) {
      const next = c < grid.cols ? terrainColor(grid.terrain[r][c], grid.elevationM[r][c]) : null;
      if (next !== color) {
        layer.append(el('rect', { x: start * CELL, y: r * CELL, width: (c - start) * CELL, height: CELL, fill: color }));
        start = c;
        color = next;
      }
    }
  }
  return layer;
}

/** 5칸마다 옅은 격자선 */
function gridLinesLayer() {
  const layer = el('g', { 'aria-hidden': 'true', stroke: INK, 'stroke-opacity': 0.12, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' });
  for (let c = 0; c <= grid.cols; c += 5) layer.append(el('line', { x1: c * CELL, y1: 0, x2: c * CELL, y2: grid.rows * CELL }));
  for (let r = 0; r <= grid.rows; r += 5) layer.append(el('line', { x1: 0, y1: r * CELL, x2: grid.cols * CELL, y2: r * CELL }));
  return layer;
}

function polyline(points, attrs) {
  return el('polyline', { points: points.map(([x, y]) => `${(x * CELL).toFixed(1)},${(y * CELL).toFixed(1)}`).join(' '), fill: 'none', ...attrs });
}

/** 해안선과 구·군 경계 */
function boundaryLayer() {
  const layer = el('g', { 'aria-hidden': 'true', 'vector-effect': 'non-scaling-stroke' });
  for (const line of districts.coastline) {
    layer.append(polyline(line, { stroke: INK, 'stroke-opacity': 0.5, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
  }
  for (const line of districts.boundaries) {
    layer.append(
      polyline(line, { stroke: INK, 'stroke-opacity': 0.4, 'stroke-width': 1.5, 'stroke-dasharray': '6 4', 'vector-effect': 'non-scaling-stroke' }),
    );
  }
  return layer;
}

/** 보기에 맞는 역 위치(칸 단위) */
function positionOf(station, view) {
  if (view === '노선도') {
    const p = schematic.positions[station.id];
    if (p) return p;
  }
  return { x: station.x, y: station.y };
}

function linesLayer(view, network) {
  const layer = el('g', {});
  for (const line of network.lines) {
    const points = line.stations.map((id) => {
      const p = positionOf(network.stationById.get(id), view);
      return [p.x, p.y];
    });
    layer.append(
      polyline(points, {
        stroke: line.color ?? INK,
        'stroke-width': view === '노선도' ? 7 : 5,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        'vector-effect': 'non-scaling-stroke',
      }),
    );
  }
  return layer;
}

function stationsLayer(view, network) {
  const layer = el('g', {});
  for (const station of network.stations) {
    const p = positionOf(station, view);
    const isTransfer = Boolean(station.transfer);
    const node = el('circle', {
      cx: (p.x * CELL).toFixed(1),
      cy: (p.y * CELL).toFixed(1),
      r: isTransfer ? 5 : 3.2,
      fill: '#FFFFFF',
      stroke: lineById.get(station.line)?.color ?? INK,
      'stroke-width': isTransfer ? 3 : 2,
      'vector-effect': 'non-scaling-stroke',
      'data-station': station.id,
    });
    layer.append(node);
  }
  return layer;
}

/** 역 이름. 확대하면 모든 역, 줄이면 환승역과 종점만 보인다. */
function labelsLayer(view, network) {
  const layer = el('g', { 'aria-hidden': 'true' });
  const terminals = new Set(network.lines.flatMap((l) => [l.stations[0], l.stations.at(-1)]));
  for (const station of network.stations) {
    const p = positionOf(station, view);
    const important = Boolean(station.transfer) || terminals.has(station.id);
    const text = el('text', {
      x: (p.x * CELL + 8).toFixed(1),
      y: (p.y * CELL + 4).toFixed(1),
      'font-size': 11,
      fill: INK,
      stroke: '#FFFFFF',
      'stroke-width': 3,
      'paint-order': 'stroke',
      'data-important': important ? 'yes' : 'no',
    });
    text.textContent = station.name;
    layer.append(text);
  }
  return layer;
}

/** 노선 번호표(색만으로 뜻을 전하지 않기 위해) */
function lineTagsLayer(view, network) {
  const layer = el('g', { 'aria-hidden': 'true' });
  for (const line of network.lines) {
    const first = network.stationById.get(line.stations[0]);
    const p = positionOf(first, view);
    const width = Math.max(18, line.label.length * 9 + 8);
    const group = el('g', {
      transform: `translate(${(p.x * CELL + 6).toFixed(1)} ${(p.y * CELL - 14).toFixed(1)})`,
      'data-x': (p.x * CELL + 6).toFixed(1),
      'data-y': (p.y * CELL - 14).toFixed(1),
    });
    group.append(el('rect', { x: 0, y: 0, width, height: 18, rx: 9, fill: line.color ?? INK }));
    const text = el('text', { x: width / 2, y: 13, 'font-size': 12, 'font-weight': 700, 'text-anchor': 'middle', fill: '#FFFFFF' });
    text.textContent = line.label;
    group.append(text);
    layer.append(group);
  }
  return layer;
}

/** 새로 그리는 노선의 색과 이름표 */
export const DESIGN_COLOR = '#C0392B';
/** 새 노선 기본 색. 설계 화면에서 바꾸면 design.color를 쓴다. */
const DEFAULT_DESIGN_COLOR = DESIGN_COLOR;
/** 새 역 이름 글자 크기(화면 픽셀). 기존 역 이름(11px)보다 크게 해서 눈에 띄게 한다. */
const DESIGN_LABEL_PX = 15;
/** 앞으로 생길 노선(양산선, 사상–하단선)의 색 */
export const FUTURE_COLOR = '#6B7A8F';

/** 앞으로 생길 노선. 점선으로 그려서 지금 다니는 노선과 구분한다. */
function futureLayer(future) {
  const layer = el('g', { 'aria-hidden': 'true' });
  if (!future) return layer;
  const byId = new Map(future.stations.map((s) => [s.id, s]));
  for (const line of future.lines) {
    const points = line.stations.map((id) => byId.get(id)).filter(Boolean);
    if (points.length < 2) continue;
    layer.append(
      el('polyline', {
        points: points.map((s) => `${(s.x * CELL).toFixed(1)},${(s.y * CELL).toFixed(1)}`).join(' '),
        fill: 'none',
        stroke: FUTURE_COLOR,
        'stroke-width': 5,
        'stroke-dasharray': '10 6',
        'stroke-linejoin': 'round',
        'vector-effect': 'non-scaling-stroke',
      }),
    );
    for (const station of points) {
      layer.append(
        el('circle', {
          cx: (station.x * CELL).toFixed(1),
          cy: (station.y * CELL).toFixed(1),
          r: 3.2,
          fill: '#FFFFFF',
          stroke: FUTURE_COLOR,
          'stroke-width': 2,
          'vector-effect': 'non-scaling-stroke',
        }),
      );
    }
  }
  return layer;
}

/** 설계한 노선을 그린다. path와 stations는 칸 번호 목록이다. */
/** 새 노선의 모양(src/sim/line-shape.js). 그릴 때와 누른 곳을 찾을 때 함께 쓴다. */
export function designShape(design) {
  if (!design || design.path.length === 0) return { points: [], stops: [] };
  return lineShape({
    path: design.path,
    stations: design.stations,
    grid,
    snap: design.stationPoints ?? {},
    kind: design.kind,
  });
}

/** 새 역 동그라미 크기(화면 픽셀). 갈아타는 역은 기존 역 동그라미를 감싸는 고리로 그린다. */
const DESIGN_STOP_R = 5;
const DESIGN_TRANSFER_R = 8.5;
const DESIGN_LOOSE_R = 6;

/** 노선 색이 너무 밝으면 역 이름 글자는 진한 색으로 쓴다(흰 테두리 위에서 읽히게). */
export function labelInk(color) {
  const hex = /^#([0-9a-f]{6})$/i.exec(color ?? '')?.[1];
  if (!hex) return color;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#1F3342' : color;
}

/** 아직 선로로 잇지 않은 역(칸 번호 목록) */
export function looseStations(design) {
  return (design?.stations ?? []).filter((cell) => !design.path.includes(cell));
}

/** 떨어진 역의 자리(칸 단위). 기존 역과 같은 칸이면 그 역 자리 */
function loosePoint(design, cell) {
  return design.stationPoints?.[cell] ?? { x: (cell % grid.cols) + 0.5, y: Math.floor(cell / grid.cols) + 0.5 };
}

function designLayer(design, cols, shape = designShape(design)) {
  const layer = el('g', { 'aria-hidden': 'true' });
  if (!design) return layer;
  const DESIGN_COLOR = design.color ?? DEFAULT_DESIGN_COLOR;
  const ink = labelInk(DESIGN_COLOR);
  // 떨어진 역: 점선 고리로 그린다(선 위 역과 모양이 다르다).
  for (const cell of looseStations(design)) {
    const point = loosePoint(design, cell);
    const x = point.x * CELL;
    const y = point.y * CELL;
    layer.append(
      el('circle', {
        class: 'design-stop',
        cx: x.toFixed(2),
        cy: y.toFixed(2),
        r: DESIGN_LOOSE_R,
        'data-r': DESIGN_LOOSE_R,
        fill: '#FFFFFF',
        'fill-opacity': 0.8,
        stroke: DESIGN_COLOR,
        'stroke-width': 3,
        'stroke-dasharray': '3 3',
        'vector-effect': 'non-scaling-stroke',
      }),
    );
    const name = design.stationNames?.[cell];
    if (name) {
      const text = el('text', {
        class: 'design-label',
        'data-cell': cell,
        'data-x': x,
        'data-y': y,
        'data-gap': DESIGN_LOOSE_R + 4,
        fill: ink,
        stroke: '#FFFFFF',
        'paint-order': 'stroke',
        'font-weight': 700,
      });
      text.textContent = name;
      layer.append(text);
    }
  }
  if (design.path.length === 0) return layer;
  if (shape.points.length > 1) {
    layer.append(
      el('polyline', {
        points: shape.points.map((p) => `${(p.x * CELL).toFixed(2)},${(p.y * CELL).toFixed(2)}`).join(' '),
        fill: 'none',
        stroke: DESIGN_COLOR,
        'stroke-width': 6,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        'vector-effect': 'non-scaling-stroke',
      }),
    );
  }
  // 길의 끝은 어디에 이어 그릴 수 있는지 보이도록 그 칸 가운데에 표시한다(선은 칸으로 긋는다).
  const last = design.path.at(-1);
  layer.append(
    el('circle', { cx: ((last % cols) + 0.5) * CELL, cy: (Math.floor(last / cols) + 0.5) * CELL, r: 4, fill: DESIGN_COLOR, 'fill-opacity': 0.5 }),
  );
  for (const stop of shape.stops) {
    const point = shape.points[stop.index];
    const x = point.x * CELL;
    const y = point.y * CELL;
    const transfer = Boolean(design.stationPoints?.[stop.cell]);
    // 갈아타는 역: 속을 비운 고리로 기존 역 동그라미를 감싼다(가운데가 정확히 겹친다).
    layer.append(
      el('circle', {
        class: 'design-stop',
        cx: x.toFixed(2),
        cy: y.toFixed(2),
        r: transfer ? DESIGN_TRANSFER_R : DESIGN_STOP_R,
        'data-r': transfer ? DESIGN_TRANSFER_R : DESIGN_STOP_R,
        fill: transfer ? 'none' : '#FFFFFF',
        stroke: DESIGN_COLOR,
        'stroke-width': 3,
        'vector-effect': 'non-scaling-stroke',
      }),
    );
    // 역 이름(설계 화면에서 정한 것). 글자 크기는 확대 배율에 맞춰 applyTransform이 고친다.
    const name = design.stationNames?.[stop.cell];
    if (name) {
      const text = el('text', {
        class: 'design-label',
        'data-cell': stop.cell,
        'data-x': x,
        'data-y': y,
        'data-gap': transfer ? DESIGN_TRANSFER_R + 4 : 9,
        fill: ink,
        stroke: '#FFFFFF',
        'paint-order': 'stroke',
        'font-weight': 700,
      });
      text.textContent = name;
      layer.append(text);
    }
  }
  return layer;
}

/** 새 역 이름 글자를 확대 배율에 맞춘다. 화면에서 늘 같은 크기로 보인다. */
function scaleDesignLabels(layer, k) {
  for (const circle of layer?.querySelectorAll('.design-stop') ?? []) {
    circle.setAttribute('r', (Number(circle.getAttribute('data-r')) / k).toFixed(2));
  }
  for (const text of layer?.querySelectorAll('.design-label') ?? []) {
    const x = Number(text.getAttribute('data-x'));
    const y = Number(text.getAttribute('data-y'));
    const gap = Number(text.getAttribute('data-gap') ?? 9);
    text.setAttribute('x', (x + gap / k).toFixed(2));
    text.setAttribute('y', (y - 7 / k).toFixed(2));
    text.setAttribute('font-size', (DESIGN_LABEL_PX / k).toFixed(2));
    text.setAttribute('stroke-width', (4 / k).toFixed(2));
  }
}

/**
 * 지도를 만든다.
 * @param {(stationId: string|null) => void} onSelect 역을 누르면 부른다
 * @param {(cellIndex: number) => void} [onCell] 칸을 누르거나 끌면 부른다('칸' 모드일 때)
 * @param {(cellIndex: number) => void} [onDesignStation] 새 역이나 그 이름을 누르면 부른다('역' 모드일 때)
 */
export function createMap({ onSelect, onCell, onDesignStation }) {
  const root = document.createElement('div');
  root.className = 'map';

  const svg = el('svg', { class: 'map-svg', xmlns: NS });
  const viewport = el('g', {});
  // 운행 애니메이션처럼 위에 덧그릴 때 쓰는 층. 지도를 다시 그려도 그대로 남는다.
  const overlay = el('g', { 'aria-hidden': 'true' });
  svg.append(viewport);
  root.append(svg);

  const state = { view: '실제 지도', k: 1, tx: 0, ty: 0, selected: null, mode: '역', design: null, future: null, network: NOW_NETWORK };
  let layers = {};

  function draw() {
    viewport.replaceChildren();
    layers = {};
    if (state.view === '실제 지도') {
      viewport.append(terrainLayer(), gridLinesLayer(), boundaryLayer());
    }
    layers.lines = linesLayer(state.view, state.network);
    layers.stations = stationsLayer(state.view, state.network);
    layers.labels = labelsLayer(state.view, state.network);
    layers.tags = lineTagsLayer(state.view, state.network);
    layers.future = futureLayer(state.future);
    layers.design = designLayers();
    viewport.append(layers.lines, layers.future, layers.stations, layers.design, layers.labels, layers.tags, overlay);
    applySelection();
    applyTransform();
  }

  /**
   * 새 노선 여러 개를 그린다. 고치고 있는 노선(active)은 맨 위에 또렷하게, 나머지는 조금 흐리게 그린다.
   * active가 -1이면(운행 화면) 모두 또렷하게 그린다. 누른 새 역을 찾는 것은 고치고 있는 노선만 본다.
   */
  function setPlan(lines, active) {
    state.design = lines[active] ?? null;
    state.others = lines.filter((_, index) => index !== active);
    if (!layers.design) return;
    const next = designLayers();
    layers.design.replaceWith(next);
    layers.design = next;
    scaleDesignLabels(next, state.k);
  }

  function designLayers() {
    const group = el('g');
    for (const other of state.others ?? []) {
      const layer = designLayer(other, grid.cols);
      if (state.design) layer.setAttribute('opacity', '0.55');
      group.append(layer);
    }
    state.designShape = designShape(state.design);
    group.append(designLayer(state.design, grid.cols, state.designShape));
    return group;
  }

  function size() {
    const rect = root.getBoundingClientRect();
    return { width: rect.width || 800, height: rect.height || 600 };
  }

  function clamp() {
    const { width, height } = size();
    const mapW = grid.cols * CELL * state.k;
    const mapH = grid.rows * CELL * state.k;
    const minVisible = 120;
    state.tx = Math.min(width - minVisible, Math.max(minVisible - mapW, state.tx));
    state.ty = Math.min(height - minVisible, Math.max(minVisible - mapH, state.ty));
  }

  function applyTransform() {
    clamp();
    viewport.setAttribute('transform', `translate(${state.tx.toFixed(2)} ${state.ty.toFixed(2)}) scale(${state.k.toFixed(4)})`);
    const showAll = state.k >= 2.2;
    for (const text of layers.labels?.children ?? []) {
      const important = text.getAttribute('data-important') === 'yes';
      text.style.display = showAll || important ? '' : 'none';
      text.setAttribute('font-size', (11 / state.k).toFixed(2));
      text.setAttribute('stroke-width', (3 / state.k).toFixed(2));
    }
    for (const tag of layers.tags?.children ?? []) {
      const x = tag.getAttribute('data-x');
      const y = tag.getAttribute('data-y');
      tag.setAttribute('transform', `translate(${x} ${y}) scale(${(1 / state.k).toFixed(3)})`);
    }
    for (const circle of layers.stations?.children ?? []) {
      const station = stationById.get(circle.getAttribute('data-station'));
      const base = station.transfer ? 5 : 3.2;
      circle.setAttribute('r', (base / state.k).toFixed(2));
    }
    scaleDesignLabels(layers.design, state.k);
    root.dispatchEvent(new CustomEvent('map-zoom', { detail: { k: state.k } }));
  }

  function applySelection() {
    for (const circle of layers.stations?.children ?? []) {
      const on = circle.getAttribute('data-station') === state.selected;
      circle.classList.toggle('is-selected', on);
    }
  }

  /** 화면 점 → 지도 칸 좌표 */
  function toMap(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - state.tx) / state.k / CELL,
      y: (clientY - rect.top - state.ty) / state.k / CELL,
    };
  }

  function nearestStation(point, maxCells) {
    let best = null;
    let bestDistance = maxCells;
    for (const station of stations) {
      const p = positionOf(station, state.view);
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d < bestDistance) {
        best = station;
        bestDistance = d;
      }
    }
    return best;
  }

  function zoomAt(clientX, clientY, factor) {
    const rect = svg.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.k * factor));
    const ratio = next / state.k;
    state.tx = px - (px - state.tx) * ratio;
    state.ty = py - (py - state.ty) * ratio;
    state.k = next;
    applyTransform();
  }

  // 손가락·마우스 조작
  const pointers = new Map();
  let pinchStart = null;
  let moved = 0;

  svg.addEventListener('pointerdown', (event) => {
    try {
      svg.setPointerCapture(event.pointerId);
    } catch {
      // 손가락을 놓친 경우에는 그냥 넘어간다.
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), k: state.k };
    }
  });

  /**
   * 지도 좌표(칸 단위)에서 누른 새 역을 찾는다. 역 동그라미나 그 옆 이름 글자를 누르면 그 칸을 돌려준다.
   * @returns {number|null}
   */
  function designStationAt(point) {
    const design = state.design;
    if (!design) return null;
    const px = 1 / (CELL * state.k); // 화면 1픽셀이 몇 칸인가
    const shape = state.designShape ?? designShape(design);
    for (const stop of shape.stops) {
      const cell = stop.cell;
      const { x: cx, y: cy } = shape.points[stop.index];
      if (Math.hypot(point.x - cx, point.y - cy) <= Math.max(0.45, 16 * px)) return cell;
      const name = design.stationNames?.[cell];
      if (!name) continue;
      // 이름 글자 자리: 동그라미 오른쪽 위(scaleDesignLabels와 같은 자리)
      const gap = design.stationPoints?.[cell] ? DESIGN_TRANSFER_R + 4 : 9;
      const left = cx + gap * px;
      const right = left + (name.length * DESIGN_LABEL_PX + 8) * px;
      const top = cy - (7 + DESIGN_LABEL_PX + 4) * px;
      const bottom = cy - 2 * px;
      if (point.x >= left - 4 * px && point.x <= right && point.y >= top && point.y <= bottom + 6 * px) return cell;
    }
    // 떨어진 역(동그라미만)
    for (const cell of looseStations(design)) {
      const { x: cx, y: cy } = loosePoint(design, cell);
      if (Math.hypot(point.x - cx, point.y - cy) <= Math.max(0.45, 16 * px)) return cell;
    }
    return null;
  }

  /** 화면 점이 어느 칸인지 */
  function cellAt(clientX, clientY) {
    const point = toMap(clientX, clientY);
    const col = Math.floor(point.x);
    const row = Math.floor(point.y);
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return null;
    return row * grid.cols + col;
  }

  let lastCell = null;

  svg.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, next);
    if (pointers.size === 1 && state.mode === '칸') {
      // 손가락을 끌면 지나가는 칸마다 알려 준다(선 그리기).
      const cell = cellAt(next.x, next.y);
      if (cell !== null && cell !== lastCell) {
        lastCell = cell;
        moved += 20;
        onCell?.(cell);
      }
    } else if (pointers.size === 1) {
      state.tx += next.x - previous.x;
      state.ty += next.y - previous.y;
      moved += Math.abs(next.x - previous.x) + Math.abs(next.y - previous.y);
      applyTransform();
    } else if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (pinchStart.k * distance) / pinchStart.distance));
      zoomAt(center.x, center.y, target / state.k);
      moved += 20;
    }
  });

  function endPointer(event) {
    const start = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchStart = null;
    const wasDrawing = state.mode === '칸' && lastCell !== null;
    lastCell = null;
    if (!start || wasDrawing) return;
    if (state.mode === '칸') {
      const cell = cellAt(event.clientX, event.clientY);
      if (cell !== null) onCell?.(cell);
      return;
    }
    if (moved > 10) return;
    const point = toMap(event.clientX, event.clientY);
    const designCell = designStationAt(point);
    if (designCell !== null && onDesignStation) {
      onDesignStation(designCell);
      return;
    }
    const station = nearestStation(point, Math.max(0.5, 12 / (CELL * state.k)) + 0.35);
    select(station ? station.id : null);
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', (event) => pointers.delete(event.pointerId));

  svg.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.15 : 1 / 1.15);
  });

  function select(stationId) {
    state.selected = stationId;
    applySelection();
    onSelect(stationId);
  }

  /** 어떤 칸이 화면 가운데 오도록 옮긴다. */
  function focusOn(col, row, zoom = 2) {
    const { width, height } = size();
    state.k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
    state.tx = width / 2 - (col + 0.5) * CELL * state.k;
    state.ty = height / 2 - (row + 0.5) * CELL * state.k;
    applyTransform();
  }

  function fit() {
    const { width, height } = size();
    state.k = Math.min(width / (grid.cols * CELL), height / (grid.rows * CELL));
    state.k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.k));
    state.tx = (width - grid.cols * CELL * state.k) / 2;
    state.ty = (height - grid.rows * CELL * state.k) / 2;
    applyTransform();
  }

  function resize() {
    const { width, height } = size();
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    applyTransform();
  }

  return {
    element: root,
    draw,
    fit,
    focusOn,
    resize,
    select,
    zoomIn: () => {
      const { width, height } = size();
      const rect = svg.getBoundingClientRect();
      zoomAt(rect.left + width / 2, rect.top + height / 2, 1.4);
    },
    zoomOut: () => {
      const { width, height } = size();
      const rect = svg.getBoundingClientRect();
      zoomAt(rect.left + width / 2, rect.top + height / 2, 1 / 1.4);
    },
    setView: (view) => {
      state.view = view;
      draw();
    },
    /** '역'이면 역을 고르고, '칸'이면 칸을 알려 준다(선 그리기). */
    setMode: (mode) => {
      state.mode = mode;
    },
    /** 위에 덧그리는 층(지도 좌표: 한 칸 = CELL). 운행 애니메이션이 쓴다. */
    overlay: () => overlay,
    /** 역 동그라미 크기를 바꾼다. sizeOf(역 id) → 반지름(픽셀), null이면 원래대로 */
    setStationSize: (sizeOf) => {
      for (const circle of layers.stations?.children ?? []) {
        const id = circle.getAttribute('data-station');
        const station = stationById.get(id);
        const base = station?.transfer ? 5 : 3.2;
        const size = sizeOf ? sizeOf(id) : null;
        circle.setAttribute('r', ((size ?? base) / state.k).toFixed(2));
      }
    },
    /** 앞으로 생길 노선을 함께 그린다({lines, stations}). null이면 지운다. */
    /** 그릴 노선망을 바꾼다. null이면 지금 부산으로 돌아간다(옛날 부산 연표에서 쓴다). */
    setNetwork: (network) => {
      state.network = network
        ? { lines: network.lines, stations: network.stations, stationById: new Map(network.stations.map((s) => [s.id, s])) }
        : NOW_NETWORK;
      draw();
    },
    setFuture: (future) => {
      state.future = future;
      draw();
    },
    setDesign: (design) => setPlan(design ? [design] : [], 0),
    setPlan: (lines, active = 0) => setPlan(lines, active),
    get zoom() {
      return state.k;
    },
    get view() {
      return state.view;
    },
  };
}

/** 지도에 쓰는 색(범례에서도 쓴다) */
export { TERRAIN_COLORS, INK };
