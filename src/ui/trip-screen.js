// 여행 모드(B단계). 출발지와 도착지를 고르면 걷기, 버스, 지하철, 택시로 가는 길을 견준다.
// 계산은 src/sim/trip.js(순수 함수), 요금은 src/content/fares.json(교통카드, 공식 요금표).
// 가장 좋은 길을 정해 주지 않는다. 시간, 요금, 걷는 거리를 나란히 보여 준다.
import faresFile from '../content/fares.json';
import { dongs, grid, lineById, places, stationById, stations } from '../data.js';
import { BASE_YEAR, rules, worldFor } from '../model.js';
import { planTrips } from '../sim/trip.js';
import { distanceText, durationText, stationLabel } from './format.js';
import { CELL, createMap } from './map.js';
import { legendBox, mapCorners, northArrow, scaleBar, zoomButtons } from './map-furniture.js';
import { loadView, saveView } from './storage.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** 떠나는 시각 */
const HOURS = [
  { hour: 8, label: '아침 8시' },
  { hour: 13, label: '낮 1시' },
  { hour: 18, label: '저녁 6시' },
  { hour: 23, label: '밤 11시' },
];
/** 가는 방법: 이름, 지도 선 모양(색만으로 가르지 않게 모양도 다르다) */
const MODES = [
  { key: 'walk', label: '걷기만' },
  { key: 'bus', label: '버스' },
  { key: 'subway', label: '지하철' },
  { key: 'taxi', label: '택시' },
];
/** 시간 막대의 조각 모양 */
const PIECE = {
  걷기: { color: '#7A8691', mark: '걷' },
  기다리기: { color: '#C9D1D9', mark: '기' },
  갈아타기: { color: '#A8B3BD', mark: '갈' },
  버스: { color: '#2E8B3E', mark: '버' },
  택시: { color: '#E0A800', mark: '택' },
  지하철: { color: '#1F3342', mark: '지' },
};
/** 동전 한 개 = 500원 */
const COIN = 500;

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

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** 원 단위 → "1,800원" */
function wonText(value) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

/** 분 → "37분"(초는 버린다. 1분 밑이면 "1분") */
function minutesText(minutes) {
  return durationText(Math.max(1, Math.round(minutes)) * 60);
}

/** 칸 단위 점의 지형 표시(언덕이면 걷기가 느리다) */
function withTerrain(point) {
  const terrain = grid.terrain[Math.floor(point.y)]?.[Math.floor(point.x)];
  return { ...point, hilly: terrain === 'hill', outer: terrain === 'field' };
}

/** 고를 수 있는 곳: 중심지와 역 */
function choices() {
  const dongByCode = new Map(dongs.map((d) => [d.code, d]));
  const placeList = places
    .map((place) => {
      const anchor = place.at.station ? stationById.get(place.at.station) : dongByCode.get(place.at.dong);
      return anchor ? { key: `place:${place.id}`, name: place.name, x: anchor.x, y: anchor.y } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const seen = new Set();
  const stationList = stations
    .filter((s) => s.inGrid && !seen.has(s.name) && seen.add(s.name))
    .map((s) => ({ key: `station:${s.id}`, name: stationLabel(s.name), x: s.x, y: s.y }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { placeList, stationList };
}

/** @param {{onHome: () => void}} actions */
export function renderTrip(root, { onHome }) {
  root.replaceChildren();
  const { world, prepared } = worldFor({ year: BASE_YEAR, dayType: '평일' });
  const { placeList, stationList } = choices();
  const all = new Map([...placeList, ...stationList].map((c) => [c.key, c]));

  const saved = loadView().trip ?? {};
  let from = null;
  let to = null;
  let picking = '출발';
  let hour = HOURS.some((h) => h.hour === saved.hour) ? saved.hour : 8;
  let rider = saved.rider === 'child' ? 'child' : 'adult';
  const modes = { walk: true, bus: true, subway: true, taxi: true, ...(saved.modes ?? {}) };
  let trips = [];
  let chosen = null;

  const screen = element('div', 'screen trip');
  const bar = element('header', 'top-bar');
  bar.append(element('h1', 'top-title', '여행하기'));
  bar.append(button('처음으로', onHome));
  screen.append(bar);
  const main = element('div', 'explore-main');
  const mapBox = element('div', 'map-box');
  const panel = element('aside', 'panel');
  const map = createMap({ onSelect: () => {}, onCell: (cell) => pickCell(cell) });
  mapBox.append(map.element);
  const legend = element('div', 'legend-holder');
  legend.append(legendBox({ view: '실제 지도' }));
  const scale = scaleBar();
  const credit = element('p', 'credit', '© OpenStreetMap contributors');
  mapBox.append(...mapCorners({ topRight: [northArrow(), zoomButtons(map)], bottomRight: [scale, credit], bottomLeft: [legend] }));
  map.element.addEventListener('map-zoom', (event) => scale.update(event.detail.k));
  main.append(mapBox, panel);
  screen.append(main);
  root.append(screen);

  function remember() {
    saveView({ trip: { hour, rider, modes: { ...modes } } });
  }

  /** 지도에서 칸을 누르면 그 칸 가운데를 출발지나 도착지로 한다. */
  function pickCell(cell) {
    const point = { x: (cell % grid.cols) + 0.5, y: Math.floor(cell / grid.cols) + 0.5, name: '지도에서 고른 곳' };
    // 가까운 역이 1칸 안에 있으면 그 이름을 붙인다.
    const near = stationList.find((s) => Math.hypot(s.x - point.x, s.y - point.y) < 0.5);
    if (near) point.name = `${near.name} 둘레`;
    setPoint(picking, point);
  }

  function setPoint(which, point) {
    if (which === '출발') {
      from = point;
      picking = '도착';
    } else {
      to = point;
    }
    plan();
  }

  function plan() {
    chosen = null;
    trips =
      from && to
        ? planTrips({ from: withTerrain(from), to: withTerrain(to), hour, modes, rider, world, prepared, rules, fares: faresFile })
        : [];
    chosen = trips[0]?.id ?? null;
    draw();
    renderPanel();
  }

  // ---------- 지도 ----------
  function draw() {
    const layer = map.overlay();
    layer.replaceChildren();
    const at = (p) => ({ x: p.x * CELL, y: p.y * CELL });
    const trip = trips.find((t) => t.id === chosen);
    if (trip) {
      let cursor = from;
      for (const leg of trip.legs) {
        let points = [];
        let style = null;
        if (leg.mode === '지하철') {
          points = leg.stations.map((id) => world.stations.find((s) => s.id === id)).filter(Boolean);
          style = { stroke: lineById.get(leg.line)?.color ?? '#1F3342', 'stroke-width': 7 };
        } else if (leg.mode === '걷기') {
          const target = leg.to ? world.stations.find((s) => s.id === leg.to) : to;
          points = [cursor, target];
          style = { stroke: '#56636E', 'stroke-width': 4, 'stroke-dasharray': '2 6', 'stroke-linecap': 'round' };
        } else if (leg.mode === '버스' || leg.mode === '택시') {
          const next = trip.legs[trip.legs.indexOf(leg) + 1];
          const target = next?.mode === '갈아타기' ? findStationAfter(trip, leg) : to;
          points = [cursor, target ?? to];
          style =
            leg.mode === '버스'
              ? { stroke: PIECE.버스.color, 'stroke-width': 6, 'stroke-dasharray': '14 6' }
              : { stroke: PIECE.택시.color, 'stroke-width': 6, 'stroke-dasharray': '4 4' };
        }
        if (points.length >= 2 && style) {
          layer.append(
            svgEl('polyline', {
              points: points.map((p) => `${at(p).x},${at(p).y}`).join(' '),
              fill: 'none',
              'stroke-linejoin': 'round',
              'vector-effect': 'non-scaling-stroke',
              ...style,
            }),
          );
          cursor = points.at(-1);
        }
      }
    }
    for (const [point, label] of [
      [from, '출발'],
      [to, '도착'],
    ]) {
      if (!point) continue;
      const { x, y } = at(point);
      const k = map.zoom || 1;
      const g = svgEl('g', { class: 'trip-pin' });
      g.append(svgEl('circle', { cx: x, cy: y, r: 9 / k, fill: label === '출발' ? '#FFFFFF' : '#1F3342', stroke: '#1F3342', 'stroke-width': 3, 'vector-effect': 'non-scaling-stroke' }));
      const text = svgEl('text', { x: x + 12 / k, y: y - 10 / k, 'font-size': 18 / k, 'font-weight': 700, fill: '#1F3342', stroke: '#FFFFFF', 'stroke-width': 4 / k, 'paint-order': 'stroke' });
      text.textContent = label;
      g.append(text);
      layer.append(g);
    }
  }

  /** 버스를 타고 내린 역(버스 + 지하철 길) */
  function findStationAfter(trip, busLeg) {
    const later = trip.legs.slice(trip.legs.indexOf(busLeg) + 1).find((l) => l.mode === '지하철');
    return later ? world.stations.find((s) => s.id === later.stations[0]) : null;
  }

  // ---------- 패널 ----------
  function choiceSelect(which) {
    const select = document.createElement('select');
    select.className = 'text-input trip-select';
    select.setAttribute('aria-label', `${which}지 고르기`);
    const first = document.createElement('option');
    first.value = '';
    first.textContent = `${which}지를 골라요`;
    select.append(first);
    for (const [title, list] of [
      ['중심지', placeList],
      ['역', stationList],
    ]) {
      const group = document.createElement('optgroup');
      group.label = title;
      for (const item of list) {
        const option = document.createElement('option');
        option.value = item.key;
        option.textContent = item.name;
        group.append(option);
      }
      select.append(group);
    }
    const current = which === '출발' ? from : to;
    if (current?.key) select.value = current.key;
    select.addEventListener('change', () => {
      const item = all.get(select.value);
      if (item) setPoint(which, { ...item });
    });
    return select;
  }

  function toggleRow(items, isOn, onPick, label) {
    const row = element('div', 'tool-row');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', label);
    for (const item of items) {
      const node = button(item.label, () => onPick(item));
      node.classList.toggle('is-on', isOn(item));
      node.setAttribute('aria-pressed', String(isOn(item)));
      row.append(node);
    }
    return row;
  }

  function renderPanel() {
    panel.replaceChildren();
    panel.append(element('h2', null, '어디로 갈까요?'));
    panel.append(element('p', 'panel-note guide', '목록에서 고르거나, 지도를 눌러 골라요.'));

    for (const which of ['출발', '도착']) {
      const box = element('div', 'trip-point');
      const pickButton = button(`지도에서 ${which}지 누르기`, () => {
        picking = which;
        renderPanel();
      }, 'button trip-pick');
      pickButton.classList.toggle('is-on', picking === which);
      pickButton.setAttribute('aria-pressed', String(picking === which));
      const current = which === '출발' ? from : to;
      box.append(element('h3', null, `${which}: ${current?.name ?? '아직 안 골랐어요'}`), choiceSelect(which), pickButton);
      panel.append(box);
    }
    if (from && to) {
      panel.append(
        button('출발과 도착 바꾸기', () => {
          [from, to] = [to, from];
          plan();
        }),
      );
    }

    panel.append(element('h3', null, '언제 떠날까요?'));
    panel.append(
      toggleRow(HOURS, (h) => h.hour === hour, (h) => {
        hour = h.hour;
        remember();
        plan();
      }, '떠나는 시각 고르기'),
    );

    panel.append(element('h3', null, '누가 가요?'));
    panel.append(
      toggleRow(
        [
          { key: 'adult', label: '어른' },
          { key: 'child', label: '어린이' },
        ],
        (r) => r.key === rider,
        (r) => {
          rider = r.key;
          remember();
          plan();
        },
        '여행하는 사람 고르기',
      ),
    );
    if (rider === 'child') panel.append(element('p', 'panel-note', '부산은 어린이 교통카드면 버스와 지하철이 무료예요.'));

    panel.append(element('h3', null, '무엇을 타 볼까요?'));
    panel.append(
      toggleRow(MODES, (m) => modes[m.key], (m) => {
        modes[m.key] = !modes[m.key];
        remember();
        plan();
      }, '가는 방법 켜고 끄기'),
    );
    panel.append(element('p', 'panel-note guide', '누르면 켜지고 한 번 더 누르면 꺼져요.'));

    renderResults();
  }

  function renderResults() {
    panel.append(element('h2', null, '가는 길'));
    if (!from || !to) {
      panel.append(element('p', null, '출발지와 도착지를 골라요.'));
      return;
    }
    if (trips.length === 0) {
      panel.append(element('p', null, '켜 둔 방법으로 갈 수 있는 길이 없어요.'));
      return;
    }
    panel.append(element('p', 'panel-note', '정답은 없어요. 시간, 요금, 걷는 거리를 견줘 봐요.'));
    const longest = Math.max(...trips.map((t) => t.minutes), 1);
    const list = element('div', 'trip-list');
    for (const trip of trips) list.append(tripCard(trip, longest));
    panel.append(list);
    panel.append(element('p', 'panel-note', '버스는 실제 노선이 아니라 어림으로 셈해요.'));
    panel.append(element('p', 'panel-note', '택시 속도와 잡는 시간은 우리가 정한 값이에요.'));
  }

  function tripCard(trip, longest) {
    const card = button('', () => {
      chosen = trip.id;
      draw();
      for (const node of panel.querySelectorAll('.trip-card')) node.classList.toggle('is-on', node === card);
    }, 'trip-card');
    card.classList.toggle('is-on', trip.id === chosen);
    card.setAttribute('aria-pressed', String(trip.id === chosen));
    const head = element('div', 'trip-head');
    head.append(element('span', 'trip-title', trip.title), element('span', 'trip-time', minutesText(trip.minutes)));
    card.append(head);

    // 시간 막대: 조각마다 무엇을 하는지 글자로도 붙인다(색만으로 가르지 않는다).
    const barBox = element('div', 'trip-bar');
    barBox.style.width = `${Math.max(12, (trip.minutes / longest) * 100).toFixed(1)}%`;
    const pieces = [];
    for (const leg of trip.legs) {
      if (leg.minutes <= 0) continue;
      const last = pieces.at(-1);
      if (last && last.mode === leg.mode) last.minutes += leg.minutes;
      else pieces.push({ mode: leg.mode, minutes: leg.minutes });
    }
    for (const piece of pieces) {
      const look = PIECE[piece.mode] ?? PIECE.기다리기;
      const part = element('span', 'trip-piece', piece.minutes / trip.minutes > 0.1 ? look.mark : '');
      part.style.flexGrow = String(piece.minutes);
      part.style.background = look.color;
      part.style.color = piece.mode === '기다리기' || piece.mode === '갈아타기' || piece.mode === '택시' ? '#1F3342' : '#FFFFFF';
      barBox.append(part);
    }
    card.append(barBox);
    const detail = element(
      'p',
      'trip-detail',
      pieces.map((p) => `${p.mode} ${minutesText(p.minutes)}`).join(' · '),
    );
    card.append(detail);

    // 요금: 동전 그림(500원에 한 개)
    const money = element('div', 'trip-money');
    const coins = element('span', 'trip-coins');
    coins.setAttribute('aria-hidden', 'true');
    const count = Math.ceil(trip.fare / COIN);
    coins.textContent = count === 0 ? '' : '●'.repeat(Math.min(count, 40)) + (count > 40 ? '…' : '');
    money.append(element('span', 'trip-fare', trip.fare === 0 ? '0원' : wonText(trip.fare)), coins);
    card.append(money);
    if (trip.fare === 0 && rider === 'child' && trip.id !== 'walk') card.append(element('p', 'trip-detail', '어린이 교통카드라 무료예요.'));

    // 걷는 거리
    if (trip.walkMeters > 0) card.append(element('p', 'trip-detail', `걷는 거리 ${distanceText(trip.walkMeters)}`));

    // 지하철 노선
    const lines = trip.legs.filter((l) => l.mode === '지하철').map((l) => lineById.get(l.line)?.name ?? l.line);
    if (lines.length > 0) card.append(element('p', 'trip-detail', `타는 노선: ${[...new Set(lines)].join(' → ')}`));
    return card;
  }

  map.resize();
  map.setView('실제 지도');
  map.setMode('칸');
  map.fit();
  scale.update(map.zoom);
  renderPanel();
  draw();
  map.element.addEventListener('map-zoom', () => draw());

  const onResize = () => {
    map.resize();
    scale.update(map.zoom);
  };
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}
