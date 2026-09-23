// 격자 지도 화면. SVG로 그리고, 한 손가락 끌기와 두 손가락 확대를 지원한다.
// 보기는 두 가지다: '실제 지도'(격자와 지형)와 '노선도'(단순화).
import { districts, grid, lineById, lines, schematic, stationById, stations } from '../data.js';

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

function linesLayer(view) {
  const layer = el('g', {});
  for (const line of lines) {
    const points = line.stations.map((id) => {
      const p = positionOf(stationById.get(id), view);
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

function stationsLayer(view) {
  const layer = el('g', {});
  for (const station of stations) {
    const p = positionOf(station, view);
    const isTransfer = Boolean(station.transfer);
    const node = el('circle', {
      cx: (p.x * CELL).toFixed(1),
      cy: (p.y * CELL).toFixed(1),
      r: isTransfer ? 5 : 3.2,
      fill: '#FFFFFF',
      stroke: lineById.get(station.line).color ?? INK,
      'stroke-width': isTransfer ? 3 : 2,
      'vector-effect': 'non-scaling-stroke',
      'data-station': station.id,
    });
    layer.append(node);
  }
  return layer;
}

/** 역 이름. 확대하면 모든 역, 줄이면 환승역과 종점만 보인다. */
function labelsLayer(view) {
  const layer = el('g', { 'aria-hidden': 'true' });
  const terminals = new Set(lines.flatMap((l) => [l.stations[0], l.stations.at(-1)]));
  for (const station of stations) {
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
function lineBadgesLayer(view) {
  const layer = el('g', { 'aria-hidden': 'true' });
  for (const line of lines) {
    const first = stationById.get(line.stations[0]);
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

/**
 * 지도를 만든다.
 * @param {(stationId: string|null) => void} onSelect 역을 누르면 부른다
 */
export function createMap({ onSelect }) {
  const root = document.createElement('div');
  root.className = 'map';

  const svg = el('svg', { class: 'map-svg', xmlns: NS });
  const viewport = el('g', {});
  svg.append(viewport);
  root.append(svg);

  const state = { view: '실제 지도', k: 1, tx: 0, ty: 0, selected: null };
  let layers = {};

  function draw() {
    viewport.replaceChildren();
    layers = {};
    if (state.view === '실제 지도') {
      viewport.append(terrainLayer(), gridLinesLayer(), boundaryLayer());
    }
    layers.lines = linesLayer(state.view);
    layers.stations = stationsLayer(state.view);
    layers.labels = labelsLayer(state.view);
    layers.badges = lineBadgesLayer(state.view);
    viewport.append(layers.lines, layers.stations, layers.labels, layers.badges);
    applySelection();
    applyTransform();
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
    for (const badge of layers.badges?.children ?? []) {
      const x = badge.getAttribute('data-x');
      const y = badge.getAttribute('data-y');
      badge.setAttribute('transform', `translate(${x} ${y}) scale(${(1 / state.k).toFixed(3)})`);
    }
    for (const circle of layers.stations?.children ?? []) {
      const station = stationById.get(circle.getAttribute('data-station'));
      const base = station.transfer ? 5 : 3.2;
      circle.setAttribute('r', (base / state.k).toFixed(2));
    }
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

  svg.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, next);
    if (pointers.size === 1) {
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
    if (!start || moved > 10) return;
    const point = toMap(event.clientX, event.clientY);
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
