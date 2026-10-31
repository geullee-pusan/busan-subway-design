// 걸어서 여행하기: 동네 지도를 걸어 다니다가 가까운 정류장이나 역에서 버스, 지하철, 기차를 타고,
// 차도에서는 택시를 잡아탄다. 쓴 시간, 걸은 거리, 낸 돈을 기록한다(점수나 제한 시간은 없다).
// 계산은 src/sim/walk-mode.js와 src/sim/roads.js(순수 함수), 그림은 src/ui/walk-map.js.
// 타는 장면은 여행 모드(가 보기, journey-screen.js)와 진짜 기차 타 보기(train-journey.js)를 그대로 쓴다.
import faresFile from '../content/fares.json';
import { dongs, grid, lineById, places, rail, railStationById, ridership, roadsData, service, stationById, stations, trains as trainData } from '../data.js';
import { BASE_YEAR, busNetwork, rules, worldFor } from '../model.js';
import { stopGroup, stopsInCell } from '../sim/bus-network.js';
import { decodeRoads, indexRoads, nearestRoad, pointAlong, taxiRoute } from '../sim/roads.js';
import { searchTrains, trainFare } from '../sim/train-trip.js';
import { planTrips, taxiFare } from '../sim/trip.js';
import { HAIL_KM, NEAR_KM, addEntry, emptyRecord, minutesWalking, nearby, nextArrivals, stepWalk, subwayHeadway, walkable } from '../sim/walk-mode.js';
import { busRouteText, clockText, distanceText, durationText, roParticle, stationLabel } from './format.js';
import { renderJourney } from './journey-screen.js';
import { loadView, saveView } from './storage.js';
import { hhmm, runTrainTrip, trainDestination } from './train-journey.js';
import { createWalkMap } from './walk-map.js';

/** 화면에서 걷는 빠르기: 1초에 몇 km(빨리 감기). 우리가 정한 값. */
const SCREEN_KM_PER_SEC = 0.06;
/** 택시가 화면에서 달리는 빠르기: 1초에 몇 km. 우리가 정한 값. */
const TAXI_SCREEN_KM_PER_SEC = 0.6;
/** 지하철 노선 표시 글자 */
const LINE_MARK = { BGL: '김', DH: '동', DK: '경', DG1: 'D1', DG2: 'D2', DG3: 'D3' };
/** 서로 이어진 지하철 묶음(부산·김해·양산·울산 쪽과 대구 쪽은 이어져 있지 않다) */
const DAEGU_LINES = new Set(['DG1', 'DG2', 'DG3', 'DK']);
const sameNetwork = (a, b) => DAEGU_LINES.has(a) === DAEGU_LINES.has(b);
const START_HOURS = [
  [8, '아침 8시'],
  [13, '낮 1시'],
  [18, '저녁 6시'],
];
const wonText = (value) => `${Math.round(value).toLocaleString('ko-KR')}원`;
const minutesText = (m) => durationText(Math.max(1, Math.round(m)) * 60);
/** 분 목록 → "08:34 · 08:41" */
const clockList = (list) => list.map((m) => hhmm(m)).join(' · ');

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

// 차도 자료는 크니 처음 쓸 때 한 번만 푼다.
let roadCache = null;
function roadWorld() {
  if (!roadCache) {
    const roads = decodeRoads(roadsData);
    roadCache = { roads, index: indexRoads(roads) };
  }
  return roadCache;
}

/** 시작할 곳: 중심지(장소 카드)와 지하철역 */
function startChoices() {
  const dongByCode = new Map(dongs.map((d) => [d.code, d]));
  const list = places
    .map((place) => {
      const anchor = place.at.station ? stationById.get(place.at.station) : dongByCode.get(place.at.dong);
      return anchor ? { name: place.name, x: anchor.x, y: anchor.y } : null;
    })
    .filter(Boolean);
  return list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/**
 * @param {HTMLElement} root
 * @param {{onHome: () => void}} p
 * @returns {() => void} 정리
 */
export function renderWalk(root, { onHome }) {
  root.replaceChildren();
  const saved = loadView().walk;
  const { world, prepared, result } = worldFor({ year: BASE_YEAR, dayType: '평일' });
  const network = busNetwork();
  const { roads, index: roadIndex } = roadWorld();
  const subwayStations = stations.filter((s) => s.inGrid);
  const busCache = new Map();
  const busStopsIn = (cell) => {
    if (!busCache.has(cell)) busCache.set(cell, stopsInCell(network, grid, cell).filter((s) => !s.noRoutes));
    return busCache.get(cell);
  };

  // 상태
  let me = null; // {x, y}
  let rider = 'adult';
  let record = null;
  let facing = 1;
  let stepPhase = 0;
  let target = null;
  let joy = { dx: 0, dy: 0 };
  const keys = new Set();
  let pendingKm = 0;
  let frame = null;
  let lastTime = 0;
  let mode = 'setup'; // setup | walk | ride | taxi
  let cleanupRide = null;
  let lastNearAt = null;
  let lastSave = 0;

  const screen = element('div', 'screen walk-screen');
  const bar = element('header', 'top-bar');
  bar.append(element('h1', 'top-title', '걸어서 여행하기'));
  bar.append(
    button('처음으로', () => {
      stopAll();
      onHome();
    }),
  );
  screen.append(bar);
  const body = element('div', 'walk-body');
  screen.append(body);
  root.append(screen);

  function stopAll() {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    cleanupRide?.();
    cleanupRide = null;
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
  }

  const now = () => record.start + record.minutes;
  const persist = (force = false) => {
    const t = performance.now();
    if (!force && t - lastSave < 1500) return;
    lastSave = t;
    saveView({ walk: { x: Math.round(me.x * 1000) / 1000, y: Math.round(me.y * 1000) / 1000, rider, record } });
  };
  const flushWalk = () => {
    if (pendingKm <= 0) return;
    record = addEntry(record, { kind: '걷기', title: '걷기', minutes: minutesWalking(pendingKm, rules.walkSpeedKmh), meters: pendingKm * 1000 });
    pendingKm = 0;
  };
  /** 다리(강 위 차도)인가 */
  const onRoad = (p) => Boolean(nearestRoad(roads, roadIndex, p, 0.03));
  const canStand = (p) => walkable(grid, p, onRoad);

  // ---------- 1. 시작 고르기 ----------
  function setup() {
    mode = 'setup';
    body.replaceChildren();
    body.append(element('p', 'guide', '동네를 걸어 다니다가 가까운 정류장이나 역에서 타 봐요.'));
    body.append(element('p', 'guide', '차도 가까이에서는 택시를 잡을 수 있어요.'));
    if (saved?.record && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      body.append(
        button('이어서 걷기', () => {
          me = { x: saved.x, y: saved.y };
          rider = saved.rider === 'child' ? 'child' : 'adult';
          record = saved.record;
          startWalking();
        }, 'button big ride-go'),
      );
      body.append(element('p', 'panel-note', `지난번: ${clockText(saved.record.start + saved.record.minutes)}, 낸 돈 ${wonText(saved.record.paid)}`));
    }
    const list = startChoices();
    const select = document.createElement('select');
    select.className = 'text-input';
    select.setAttribute('aria-label', '시작할 곳');
    for (const [i, c] of list.entries()) {
      const option = document.createElement('option');
      option.value = String(i);
      option.textContent = c.name;
      if (c.name === '서면') option.selected = true;
      select.append(option);
    }
    const row = element('div', 'tr-sound-row');
    row.append(element('span', 'tr-fact-label', '시작할 곳'), select);
    body.append(row);
    let hour = 8;
    const hourRow = element('div', 'tr-sound-row');
    const hourButtons = START_HOURS.map(([h, label]) => {
      const node = button(label, () => {
        hour = h;
        hourButtons.forEach((b, k) => b.classList.toggle('is-on', START_HOURS[k][0] === h));
      }, h === hour ? 'button is-on' : 'button');
      hourRow.append(node);
      return node;
    });
    body.append(hourRow);
    const riderRow = element('div', 'tr-sound-row');
    const riderButtons = [
      ['adult', '어른'],
      ['child', '어린이'],
    ].map(([key, label]) => {
      const node = button(label, () => {
        rider = key;
        riderButtons.forEach((b, k) => b.classList.toggle('is-on', ['adult', 'child'][k] === key));
      }, key === rider ? 'button is-on' : 'button');
      riderRow.append(node);
      return node;
    });
    body.append(riderRow);
    body.append(
      button('여기서 걷기 시작', () => {
        const start = list[Number(select.value)];
        me = { x: start.x, y: start.y };
        if (!canStand(me)) me = { x: start.x + 0.05, y: start.y };
        record = emptyRecord(hour * 60);
        persist(true);
        startWalking();
      }, saved?.record ? 'button big' : 'button big ride-go'),
    );
  }

  // ---------- 2. 걸어 다니기 ----------
  let map = null;
  let canvas = null;
  let hud = null;
  let nearBox = null;
  let messageBox = null;

  function onKey(e) {
    const dirKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!dirKeys.includes(e.key)) return;
    if (e.type === 'keydown') keys.add(e.key);
    else keys.delete(e.key);
    if (mode === 'walk') e.preventDefault();
  }

  function startWalking() {
    stopAll();
    mode = 'walk';
    target = null;
    body.replaceChildren();
    hud = element('div', 'walk-hud');
    body.append(hud);
    const stage = element('div', 'walk-stage');
    canvas = document.createElement('canvas');
    canvas.className = 'walk-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '내가 걷는 동네 지도예요. 가운데 주황색 사람이 나예요.');
    stage.append(canvas);
    stage.append(element('p', 'walk-osm', '© OpenStreetMap contributors'));
    // 확대·축소
    const zoom = element('div', 'walk-zoom');
    zoom.append(button('+', () => map.setScale(map.scale * 1.3), 'button'), button('−', () => map.setScale(map.scale / 1.3), 'button'));
    stage.append(zoom);
    // 조이스틱
    const pad = element('div', 'walk-pad');
    pad.setAttribute('aria-label', '움직이는 손잡이');
    const knob = element('div', 'walk-knob');
    pad.append(knob);
    stage.append(pad);
    body.append(stage);
    messageBox = element('div', 'walk-message');
    body.append(messageBox);
    nearBox = element('div', 'walk-near');
    body.append(nearBox);
    const tools = element('div', 'tool-row');
    tools.append(button('여행 기록 보기', showRecord), button('그만 걷기', finish));
    body.append(tools);

    map = createWalkMap(canvas, {
      grid,
      roads,
      roadIndex,
      stations: subwayStations,
      railStations: rail.stations,
      railLines: rail.lines,
      busStopsNear: busStopsIn,
      lineColor: (line) => lineById.get(line)?.color ?? '#1F3342',
      lineName: (line) => LINE_MARK[line] ?? line,
    });

    // 조이스틱 끌기
    let padId = null;
    const padMove = (e) => {
      const r = pad.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const max = r.width / 2;
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      joy = { dx: (dx * k) / max, dy: (dy * k) / max };
      target = null;
    };
    pad.addEventListener('pointerdown', (e) => {
      padId = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      padMove(e);
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId === padId) padMove(e);
    });
    const padUp = (e) => {
      if (e.pointerId !== padId) return;
      padId = null;
      joy = { dx: 0, dy: 0 };
      knob.style.transform = '';
    };
    pad.addEventListener('pointerup', padUp);
    pad.addEventListener('pointercancel', padUp);
    // 지도를 누르면 그쪽으로 걸어간다(택시를 부를 때는 내릴 곳을 고른다)
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      const point = map.toWorld(e.clientX - r.left, e.clientY - r.top, me);
      if (mode === 'taxi-pick') pickTaxiGoal(point);
      else if (mode === 'walk') target = point;
    });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    lastTime = performance.now();
    lastNearAt = null;
    updateHud();
    updateNear(true);
    frame = requestAnimationFrame(tick);
  }

  function tick(t) {
    const dt = Math.min(0.1, (t - lastTime) / 1000);
    lastTime = t;
    if (mode === 'walk') {
      let dir = { dx: joy.dx, dy: joy.dy };
      if (keys.size) dir = { dx: (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0), dy: (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0) };
      let strength = Math.min(1, Math.hypot(dir.dx, dir.dy));
      if (target && strength === 0) {
        const dx = target.x - me.x;
        const dy = target.y - me.y;
        const left = Math.hypot(dx, dy);
        if (left < 0.004) target = null;
        else {
          dir = { dx, dy };
          strength = 1;
        }
      }
      if (strength > 0.05) {
        let km = SCREEN_KM_PER_SEC * strength * dt;
        if (target) km = Math.min(km, Math.hypot(target.x - me.x, target.y - me.y));
        const next = stepWalk(me, dir, km, canStand);
        if (next.km > 0) {
          me = { x: next.x, y: next.y };
          pendingKm += next.km;
          stepPhase += next.km * 400;
          if (Math.abs(dir.dx) > 0.1) facing = Math.sign(dir.dx);
          if (pendingKm > 0.02) {
            flushWalk();
            updateHud();
            persist();
          }
          updateNear();
        } else if (target) {
          target = null;
          say('그쪽으로는 갈 수 없어요. 바다나 강이에요.');
        }
      }
    }
    // 택시를 타는 동안에는 사람 대신 택시를 그린다
    map.draw(me, { me: taxiNow ? null : { ...me, facing, step: stepPhase }, target, taxi: taxiNow, route: taxiPlan?.route?.points ?? null });
    frame = requestAnimationFrame(tick);
  }

  function say(text) {
    if (messageBox) messageBox.textContent = text;
  }

  /** 맨 위 기록: 시각, 걸린 시간, 걸은 거리, 낸 돈(그림과 함께) */
  function updateHud() {
    if (!hud) return;
    hud.replaceChildren();
    const stat = (icon, label, value, barRatio = null) => {
      const box = element('div', 'walk-stat');
      box.append(element('span', 'walk-stat-icon', icon), element('span', 'walk-stat-label', label), element('span', 'walk-stat-value', value));
      if (barRatio !== null) {
        const bar = element('span', 'tr-bar');
        const fill = element('span', 'tr-bar-fill');
        fill.style.width = `${Math.max(2, Math.min(100, barRatio * 100)).toFixed(0)}%`;
        fill.style.background = '#E8590C';
        bar.append(fill);
        box.append(bar);
      }
      return box;
    };
    const walkedM = record.meters + pendingKm * 1000;
    hud.append(
      stat('🕘', '지금', clockText(now())),
      stat('⏳', '쓴 시간', record.minutes < 1 ? '0분' : minutesText(record.minutes), Math.min(1, record.minutes / 240)),
      stat('👣', '걸은 거리', distanceText(Math.round(walkedM)), Math.min(1, walkedM / 5000)),
      // 동그라미 하나가 5천 원까지
      stat('🪙', '쓴 돈', `${'●'.repeat(Math.min(8, Math.ceil(record.paid / 5000)))} ${wonText(record.paid)}`),
    );
  }

  // ---------- 3. 가까운 탈 곳 ----------
  function updateNear(force = false) {
    if (!force && lastNearAt && Math.hypot(lastNearAt.x - me.x, lastNearAt.y - me.y) < 0.01) return;
    lastNearAt = { ...me };
    nearBox.replaceChildren();
    const cards = [];
    // 지하철역
    for (const { item: s, km } of nearby(subwayStations, me, NEAR_KM, 4)) {
      const line = lineById.get(s.line);
      const headway = subwayHeadway(service, s.line, now() / 60) ?? prepared.lineInfo?.[s.line]?.headwayMin ?? null;
      const card = nearCard(`${line?.name ?? s.line} ${stationLabel(s.name)}`, km, '지하철');
      card.style.borderColor = line?.color ?? '#1F3342';
      if (headway) card.append(element('p', 'walk-next', `다음 열차(어림): ${clockList(nextArrivals(now(), headway, s.id, 3))}`));
      else card.append(element('p', 'walk-next', '지금은 열차가 다니지 않아요.'));
      if (headway) card.append(button('지하철 타기', () => chooseSubway(s, headway), 'button'));
      cards.push(card);
    }
    // 기차역
    // 기차역은 역 건물이 커서 조금 더 멀리서도 탈 수 있게 한다(우리가 정한 값)
    for (const { item: s, km } of nearby(rail.stations, me, NEAR_KM + 0.2, 2)) {
      const card = nearCard(`${stationLabel(s.name)}(기차역)`, km, '기차');
      const next = searchTrains(trainData.trains, { from: s.id, afterMinute: now(), limit: 3 });
      card.append(element('p', 'walk-next', next.length ? `다음 기차: ${next.map((r) => `${hhmm(r.dep)} ${r.train.kind ?? ''}`).join(' · ')}` : '오늘은 더 떠나는 기차가 없어요.'));
      if (next.length) card.append(button('기차 타기', () => chooseTrain(s), 'button'));
      cards.push(card);
    }
    // 버스 정류장
    const cells = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) cells.push((Math.floor(me.y) + dr) * grid.cols + Math.floor(me.x) + dc);
    const stops = cells.flatMap((cell) => busStopsIn(cell));
    for (const { item: stop, km } of nearby(stops.map((s) => ({ ...s, id: `${s.index}` })), me, NEAR_KM, 3)) {
      const card = nearCard(`${stop.name} 정류장`, km, '버스');
      const routeNames = stop.routes.slice(0, 8).map(busRouteText).join(', ');
      card.append(element('p', 'walk-next', `서는 버스: ${routeNames}${stop.routes.length > 8 ? ' …' : ''}`));
      const headway = (rules.busWaitMin ?? 5) * 2;
      const busTimes = clockList(nextArrivals(now(), headway, `bus-${stop.index}`, 3));
      card.append(element('p', 'walk-next', `다음 버스(어림): ${busTimes}`));
      card.append(button('버스 타기', () => chooseBus(stop), 'button'));
      cards.push(card);
    }
    // 택시(차도 가까이)
    const road = nearestRoad(roads, roadIndex, me, HAIL_KM);
    if (road) {
      const card = nearCard('차도 옆이에요', road.km, '택시');
      card.append(element('p', 'walk-next', '손을 들어 택시를 잡을 수 있어요.'));
      card.append(button('택시 잡기', () => hailTaxi(road), 'button'));
      cards.push(card);
    }
    if (!cards.length) nearBox.append(element('p', 'panel-note', `${Math.round(NEAR_KM * 1000)}m 안에 탈 곳이 없어요. 걸어서 정류장이나 역, 차도를 찾아봐요.`));
    else nearBox.append(...cards);
  }

  function nearCard(title, km, kind) {
    const card = element('div', 'walk-card');
    const head = element('div', 'walk-card-head');
    head.append(element('span', `walk-kind walk-kind-${kind}`, kind), element('strong', null, title), element('span', 'walk-dist', `${Math.round(km * 1000)}m`));
    card.append(head);
    return card;
  }

  // ---------- 4. 타기 ----------
  /** 타는 화면을 지도 대신 보여 준다 */
  function rideArea(title) {
    stopAll();
    flushWalk();
    mode = 'ride';
    body.replaceChildren();
    body.append(element('h2', null, title));
    const area = element('div', 'walk-ride');
    body.append(area);
    body.append(button('타지 않고 걷기로 돌아가기', startWalking));
    return area;
  }

  /** 다 탔을 때: 내린 곳으로 옮기고 기록한다 */
  function arrive(point, entry) {
    cleanupRide?.();
    cleanupRide = null;
    me = { x: point.x, y: point.y };
    if (!canStand(me)) {
      // 내린 곳이 걸을 수 없는 칸이면 가까운 땅으로
      for (const [dx, dy] of [[0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05], [0.1, 0], [-0.1, 0]]) {
        if (canStand({ x: point.x + dx, y: point.y + dy })) {
          me = { x: point.x + dx, y: point.y + dy };
          break;
        }
      }
    }
    record = addEntry(record, entry);
    persist(true);
    startWalking();
    say(`${entry.title}. ${minutesText(entry.minutes)} 걸렸고 ${wonText(entry.fare ?? 0)}을 냈어요.`);
  }

  /** 여행 모드의 길 하나를 가 보기 화면으로 탄다(기다리는 시간은 오는 차 시각으로 바꾼다) */
  function rideTrip(trip, from, to, waitMinutes, title) {
    const legs = trip.legs.map((leg) => ({ ...leg }));
    const firstWait = legs.find((leg) => leg.mode === '기다리기');
    if (firstWait && waitMinutes !== null) firstWait.minutes = waitMinutes;
    const fixed = { ...trip, legs, minutes: legs.reduce((s, l) => s + l.minutes, 0) };
    stopAll();
    mode = 'ride';
    cleanupRide = renderJourney(body, {
      trip: fixed,
      from,
      to,
      hour: now() / 60,
      rider,
      world,
      result,
      hourShape: ridership.shape['평일'],
      fares: faresFile,
      backLabel: '걷기로 돌아가기',
      onBack: () => {
        cleanupRide?.();
        cleanupRide = null;
        screen.replaceChildren(bar, body);
        root.replaceChildren(screen);
        startWalking();
      },
      onDone: ({ minutes, meters, fare }) => {
        screen.replaceChildren(bar, body);
        root.replaceChildren(screen);
        record = addEntry(record, { kind: '걷기', title: '걷기', minutes: 0, meters });
        arrive(to, { kind: title.kind, title: title.text, minutes, fare });
      },
    });
  }

  /** 지하철: 내릴 역 고르기 */
  function chooseSubway(station, headway) {
    const area = rideArea(`${stationLabel(station.name)}에서 지하철 타기`);
    area.append(element('p', 'guide', '내릴 역을 골라요.'));
    const select = document.createElement('select');
    select.className = 'text-input';
    select.setAttribute('aria-label', '내릴 역');
    const seen = new Set();
    const list = subwayStations
      .filter((s) => s.name !== station.name && sameNetwork(s.line, station.line) && !seen.has(s.name) && seen.add(s.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    for (const s of list) {
      const option = document.createElement('option');
      option.value = s.id;
      option.textContent = `${stationLabel(s.name)}(${lineById.get(s.line)?.name ?? s.line})`;
      select.append(option);
    }
    area.append(select);
    const result = element('div');
    area.append(result);
    const go = () => {
      result.replaceChildren();
      const dest = stationById.get(select.value);
      const trips = planTrips({
        from: { x: station.x, y: station.y, name: stationLabel(station.name) },
        to: { x: dest.x, y: dest.y, name: stationLabel(dest.name) },
        hour: now() / 60,
        modes: { walk: false, subway: true, bus: false, taxi: false },
        rider,
        world,
        prepared,
        rules,
        fares: faresFile,
        busNetwork: network,
      });
      const trip = trips.find((t) => t.id === 'subway');
      if (!trip) {
        result.append(element('p', null, '이 역에서 지하철로 갈 수 없어요.'));
        return;
      }
      const wait = nextArrivals(now(), headway, station.id, 1)[0] - now();
      const planned = trip.legs.find((l) => l.mode === '기다리기')?.minutes ?? 0;
      const total = minutesText(trip.minutes - planned + wait);
      result.append(element('p', 'walk-next', `다음 열차는 ${hhmm(now() + wait)}에 와요. 모두 ${total}쯤 걸려요.`));
      result.append(
        button('타러 가기', () => rideTrip(trip, { name: stationLabel(station.name), x: station.x, y: station.y }, { name: stationLabel(dest.name), x: dest.x, y: dest.y }, wait, { kind: '지하철', text: `${stationLabel(station.name)} → ${stationLabel(dest.name)} 지하철` }), 'button big ride-go'),
      );
    };
    select.addEventListener('change', go);
    go();
  }

  /** 버스: 노선과 내릴 정류장 고르기 */
  function chooseBus(stop) {
    const area = rideArea(`${stop.name} 정류장에서 버스 타기`);
    const group = new Set(stopGroup(network, stop.index));
    // 이 정류장에 서는 노선(방향마다 하나)과 그 뒤 정류장들
    const options = [];
    for (const index of group) {
      for (const r of network.routesAt[index]) {
        const route = network.routes[r];
        const at = route.stops.findIndex(([si]) => group.has(si));
        if (at < 0 || at >= route.stops.length - 1) continue;
        if (options.some((o) => o.route === route)) continue;
        options.push({ route, at, last: network.stops[route.stops.at(-1)[0]].name });
      }
    }
    options.sort((a, b) => a.route.no.localeCompare(b.route.no, 'ko', { numeric: true }));
    if (!options.length) {
      area.append(element('p', null, '이 정류장에서 탈 버스 자료가 없어요.'));
      return;
    }
    area.append(element('p', 'guide', '탈 버스를 골라요.'));
    const routeRow = element('div', 'tr-go-row');
    area.append(routeRow);
    const stopsBox = element('div', 'tr-go-row');
    area.append(stopsBox);
    const headway = (rules.busWaitMin ?? 5) * 2;
    const showStops = (option) => {
      stopsBox.replaceChildren();
      stopsBox.append(element('p', 'guide', `${busRouteText(option.route.no)} 버스에서 내릴 정류장을 골라요.`));
      const seenNames = new Set([stop.name]);
      option.route.stops.slice(option.at + 1).forEach(([si], k) => {
        const s = network.stops[si];
        if (seenNames.has(s.name) || k > 60) return;
        seenNames.add(s.name);
        stopsBox.append(
          button(s.name, () => {
            const from = { x: stop.x, y: stop.y, stopIndex: stop.index, name: `${stop.name} 정류장` };
            const to = { x: s.x, y: s.y, stopIndex: si, name: `${s.name} 정류장` };
            const trips = planTrips({ from, to, hour: now() / 60, modes: { walk: false, subway: false, bus: true, taxi: false }, rider, world, prepared, rules, fares: faresFile, busNetwork: network });
            const trip = trips.find((t) => t.id === 'bus');
            if (!trip) {
              say('그 정류장까지 가는 버스 길을 찾지 못했어요.');
              return;
            }
            const wait = nextArrivals(now(), headway, `bus-${stop.index}`, 1)[0] - now();
            rideTrip(trip, from, to, wait, { kind: '버스', text: `${stop.name} → ${s.name} ${busRouteText(option.route.no)} 버스` });
          }),
        );
      });
    };
    for (const option of options.slice(0, 30)) {
      routeRow.append(button(`${busRouteText(option.route.no)} (${option.last} 방면)`, () => showStops(option)));
    }
    showStops(options[0]);
  }

  /** 기차: 떠나는 기차와 내릴 역 고르기 */
  function chooseTrain(station) {
    const area = rideArea(`${stationLabel(station.name)}에서 기차 타기`);
    const list = searchTrains(trainData.trains, { from: station.id, afterMinute: now(), limit: 8 });
    if (!list.length) {
      area.append(element('p', null, '오늘은 더 떠나는 기차가 없어요.'));
      return;
    }
    area.append(element('p', 'guide', '탈 기차를 골라요. 기차 시각은 진짜 시각표예요.'));
    const box = element('div', 'tr-departures');
    for (const r of list) {
      const item = button('', () => pickTrainStop(area, station, r), 'tr-departure');
      item.append(element('span', 'tr-dep-time', hhmm(r.dep)), element('span'), element('span', 'tr-dep-kind', `${r.train.kind ?? '종류 모름'} ${r.train.no}번`), element('span', 'tr-dep-to', `${trainDestination(r.train)} 가는 기차`));
      box.append(item);
    }
    area.append(box);
  }

  function pickTrainStop(area, station, r) {
    area.replaceChildren();
    area.append(element('p', 'guide', `${r.train.kind ?? '기차'} ${r.train.no}번에서 내릴 역을 골라요.`));
    const row = element('div', 'tr-go-row');
    for (let j = r.from + 1; j < r.train.stops.length; j++) {
      const stop = r.train.stops[j];
      const dest = railStationById.get(stop[0]);
      row.append(
        button(`${dest.name}역 ${hhmm(stop[1] ?? stop[2])}`, () => {
          const fare = trainFare(trainData.fareTable, station.id, dest.id, r.train, rider);
          area.replaceChildren();
          cleanupRide = runTrainTrip(area, {
            train: r.train,
            fromIndex: r.from,
            toIndex: j,
            readyMinute: now(),
            fare,
            rider,
            onDone: (minutes) => arrive(dest, { kind: '기차', title: `${stationLabel(station.name)} → ${stationLabel(dest.name)} ${r.train.kind ?? '기차'}`, minutes, fare: fare ?? 0 }),
          });
        }),
      );
    }
    area.append(row);
  }

  // ---------- 5. 택시(진짜 차도) ----------
  let taxiPlan = null;
  let taxiNow = null;
  function hailTaxi(road) {
    mode = 'taxi-pick';
    taxiPlan = { start: road };
    target = null;
    say('택시가 섰어요. 내릴 곳을 지도에서 눌러요.');
    nearBox.replaceChildren();
    const card = element('div', 'walk-card');
    card.append(element('p', 'guide', '내릴 곳을 지도에서 누르거나, 아래에서 골라요.'));
    const select = document.createElement('select');
    select.className = 'text-input';
    select.setAttribute('aria-label', '내릴 곳');
    const choices = startChoices();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '고르기';
    select.append(empty);
    for (const [i, c] of choices.entries()) {
      const option = document.createElement('option');
      option.value = String(i);
      option.textContent = c.name;
      select.append(option);
    }
    select.addEventListener('change', () => {
      if (select.value !== '') pickTaxiGoal(choices[Number(select.value)], choices[Number(select.value)].name);
    });
    card.append(select, button('택시 안 타기', cancelTaxi));
    nearBox.append(card);
  }

  function cancelTaxi() {
    taxiPlan = null;
    taxiNow = null;
    mode = 'walk';
    say('');
    updateNear(true);
  }

  function pickTaxiGoal(point, name = null) {
    const end = nearestRoad(roads, roadIndex, point, 0.4);
    if (!end) {
      say('그 둘레에는 차도가 없어요. 차도 가까이를 눌러요.');
      return;
    }
    const route = taxiRoute(roads, taxiPlan.start, end);
    if (!route) {
      say('그곳까지 이어진 차도를 찾지 못했어요.');
      return;
    }
    const wait = rules.taxiWaitMin ?? 3;
    const fare = taxiFare(faresFile, route.km, route.minutes, Math.floor(now() / 60) % 24);
    taxiPlan = { ...taxiPlan, end, route, wait, fare, name };
    nearBox.replaceChildren();
    const card = element('div', 'walk-card');
    card.append(element('strong', null, name ? `${name}까지` : '고른 곳까지'));
    const list = element('ul', 'panel-list');
    list.append(element('li', null, `차도로 ${distanceText(Math.round(route.km * 1000))}`));
    list.append(element('li', null, `${minutesText(route.minutes)}쯤 걸려요`));
    list.append(element('li', null, `요금은 ${wonText(fare)}쯤이에요`));
    card.append(list);
    card.append(element('p', 'panel-note', '택시 빠르기는 길 종류마다 우리가 정한 값이에요.'));
    card.append(button('택시 타기', rideTaxi, 'button big ride-go'), button('다른 곳 고르기', () => hailTaxi(taxiPlan.start)), button('택시 안 타기', cancelTaxi));
    nearBox.append(card);
    say('노란 점선이 택시가 갈 길이에요.');
  }

  function rideTaxi() {
    const plan = taxiPlan;
    mode = 'taxi';
    flushWalk();
    nearBox.replaceChildren(element('p', 'guide', '택시를 타고 가요. 창밖으로 길이 지나가요.'));
    const startClock = now();
    const realSeconds = Math.max(3, Math.min(14, plan.route.km / TAXI_SCREEN_KM_PER_SEC));
    const begin = performance.now();
    const step = () => {
      if (mode !== 'taxi') return;
      const ratio = Math.min(1, (performance.now() - begin) / 1000 / realSeconds);
      const at = pointAlong(plan.route.points, ratio);
      taxiNow = at;
      me = { x: at.x, y: at.y };
      say(`택시 안이에요. ${clockText(startClock + plan.wait + plan.route.minutes * ratio)}`);
      if (ratio < 1) {
        setTimeout(step, 50);
        return;
      }
      taxiNow = null;
      taxiPlan = null;
      mode = 'walk';
      // 내리면 길가(차도 옆)로 한 걸음 비켜선다
      const last = plan.route.points.at(-1);
      record = addEntry(record, { kind: '택시', title: `택시${plan.name ? ` → ${plan.name}` : ''} (${distanceText(Math.round(plan.route.km * 1000))})`, minutes: plan.wait + plan.route.minutes, fare: plan.fare });
      me = { x: last[0], y: last[1] };
      persist(true);
      updateHud();
      updateNear(true);
      say(`택시에서 내렸어요. ${minutesText(plan.wait + plan.route.minutes)} 걸렸고 ${wonText(plan.fare)}을 냈어요.`);
    };
    step();
  }

  // ---------- 6. 기록 ----------
  function recordList() {
    const list = element('ol', 'walk-record');
    if (!record.entries.length) list.append(element('li', null, '아직 한 일이 없어요.'));
    for (const e of record.entries) {
      const li = element('li');
      li.append(element('span', 'walk-record-time', hhmm(e.at)), element('span', `walk-kind walk-kind-${e.kind}`, e.kind), element('span', null, e.title));
      const parts = [minutesText(e.minutes)];
      if (e.meters) parts.push(distanceText(Math.round(e.meters)));
      if (e.fare) parts.push(wonText(e.fare));
      li.append(element('span', 'walk-record-num', parts.join(' · ')));
      list.append(li);
    }
    return list;
  }

  function showRecord() {
    flushWalk();
    nearBox.replaceChildren();
    const card = element('div', 'walk-card');
    card.append(element('strong', null, `${clockText(record.start)}부터 지금까지 한 일`));
    card.append(recordList());
    card.append(button('닫기', () => updateNear(true)));
    nearBox.append(card);
  }

  function finish() {
    flushWalk();
    stopAll();
    persist(true);
    mode = 'setup';
    body.replaceChildren();
    const card = element('div', 'journey-done');
    card.append(element('h2', null, '오늘의 여행 기록'));
    const sum = element('ul', 'panel-list');
    sum.append(element('li', null, `${clockText(record.start)}에 시작해서 ${clockText(now())}에 끝냈어요.`));
    sum.append(element('li', null, `쓴 시간: ${record.minutes < 1 ? '0분' : minutesText(record.minutes)}`));
    sum.append(element('li', null, `걸은 거리: ${distanceText(Math.round(record.meters))}`));
    sum.append(element('li', null, `쓴 돈: ${wonText(record.paid)}`));
    card.append(sum, recordList());
    card.append(element('p', 'panel-note', '같은 곳을 다른 방법으로 가면 시간과 돈이 어떻게 달라질까요?'));
    const row = element('div', 'tool-row');
    row.append(
      button('이어서 걷기', startWalking, 'button big'),
      button('처음부터 다시', () => {
        saveView({ walk: null });
        setup();
      }),
    );
    card.append(row);
    body.append(card);
  }

  setup();
  return () => stopAll();
}
