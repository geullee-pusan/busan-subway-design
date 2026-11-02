// 걸어서 여행하기: 동네 지도를 걸어 다니다가 가까운 정류장이나 역에서 버스, 지하철, 기차를 타고,
// 차도에서는 택시를 잡아탄다. 쓴 시간, 걸은 거리, 낸 돈을 기록한다(점수나 제한 시간은 없다).
// 계산은 src/sim/walk-mode.js와 src/sim/roads.js(순수 함수), 그림은 src/ui/walk-map.js.
// 타는 장면은 여행 모드(가 보기, journey-screen.js)와 진짜 기차 타 보기(train-journey.js)를 그대로 쓴다.
import faresFile from '../content/fares.json';
import { dongShapes, dongs, grid, waterShapes, landmarks, lineById, places, rail, railStationById, ridership, roadsData, service, stationById, stations, trains as trainData } from '../data.js';
import { BASE_YEAR, busNetwork, rules, worldFor } from '../model.js';
import { stopGroup, stopsInCell } from '../sim/bus-network.js';
import { decodeDongs, dongAt } from '../sim/address.js';
import { decodeWater } from '../sim/water.js';
import { decodeRoads, indexRoads, nearestRoad, placeOn, pointAlong, taxiRoute, walkAlong, walkRoute, MADE_ROAD } from '../sim/roads.js';
import { searchTrains, trainFare } from '../sim/train-trip.js';
import { planTrips, taxiFare } from '../sim/trip.js';
import { HAIL_KM, NEAR_KM, addEntry, emptyRecord, canPlayAgain, minutesWalking, nearby, nextArrivals, subwayHeadway, visitedPlaces } from '../sim/walk-mode.js';
import { busRouteText, clockText, distanceText, durationText, roParticle, stationLabel } from './format.js';
import { renderJourney } from './journey-screen.js';
import { loadView, saveView } from './storage.js';
import { hhmm, runTrainTrip, trainDestination } from './train-journey.js';
import { appendPoint, appendRide, compactTrack } from '../sim/diary.js';
import { createLandmarkMusic } from './landmark-music.js';
import { renderDiary } from './walk-diary.js';
import { LANDMARK_ICON, landmarkScene } from './landmark-scenes.js';
import { createWalkMap } from './walk-map.js';
import { textWithCards } from './word-card.js';

/** 화면에서 걷는 빠르기: 1초에 몇 km(빨리 감기). 우리가 정한 값. */
const SCREEN_KM_PER_SEC = 0.12;
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

// 길 자료와 동 모양은 크니 처음 쓸 때 한 번만 푼다.
let roadCache = null;
function roadWorld() {
  if (!roadCache) {
    const roads = decodeRoads(roadsData);
    roadCache = { roads, index: indexRoads(roads), dongs: decodeDongs(dongShapes), water: decodeWater(waterShapes) };
  }
  return roadCache;
}
/** 택시는 차도(동네 길 빼고)에서 잡는다 */
const isCarRoad = (edge) => edge.cls <= 4;
const MADE_ROAD_NOTE = '게임에서 임의로 이은 길이에요';

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
  const { roads, index: roadIndex, dongs: dongShapesList, water: waterList } = roadWorld();
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
  let target = null; // 누른 곳(길 위 점)
  let at = null; // 내가 서 있는 길 위 자리 {edge, seg, t}
  let walkPath = null; // 누른 곳까지 걸어갈 길 {points, km, done, goal}
  let needsDraw = true;
  let insideLandmark = null; // 지금 들어와 있는 랜드마크(나가기 전에는 다시 보여 주지 않는다)
  let goal = null; // 가 보고 싶은 곳(랜드마크)
  let sceneAt = null;
  let track = []; // 여행 일기에 그릴 지나온 길(조각 목록)
  let rideFrom = null; // 탈것을 탄 자리
  // 랜드마크 음악: 마지막으로 튼 뒤 10초가 지나야 다시 튼다(둘레를 왔다 갔다 해도 계속 나오지 않게, canPlayAgain)
  const music = createLandmarkMusic();
  let musicOn = loadView().walkSound !== false;
  let lastMusicAt = -Infinity; // 도착 장면을 띄운 자리(조금 걸어도 장면은 남겨 둔다)
  let view = { ox: 0, oy: 0 }; // 지도를 끌어 옮긴 만큼(km). 걸으면 내 자리로 돌아온다.
  const center = () => ({
    x: Math.max(0, Math.min(grid.cols, me.x + view.ox)),
    y: Math.max(0, Math.min(grid.rows, me.y + view.oy)),
  });
  let lastGood = null; // 마지막으로 확인한 바른 자리(자리 값이 잘못되면 여기로 되돌린다)
  let blockedSaid = 0;
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
  // 태블릿은 손으로 누른 뒤에만 소리를 낼 수 있어서, 누를 때마다 소리를 깨워 둔다
  body.addEventListener('pointerdown', () => musicOn && music.wake());
  screen.append(body);
  root.append(screen);

  function stopAll() {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    cleanupRide?.();
    cleanupRide = null;
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
    window.removeEventListener('resize', markDraw);
    music.stop();
  }

  const now = () => record.start + record.minutes;
  const persist = (force = false) => {
    const t = performance.now();
    if (!force && t - lastSave < 1500) return;
    lastSave = t;
    track = compactTrack(track);
    saveView({ walk: { x: Math.round(me.x * 1000) / 1000, y: Math.round(me.y * 1000) / 1000, rider, record, track } });
  };
  const flushWalk = () => {
    if (pendingKm <= 0) return;
    record = addEntry(record, { kind: '걷기', title: '걷기', minutes: minutesWalking(pendingKm, rules.walkSpeedKmh), meters: pendingKm * 1000 });
    pendingKm = 0;
  };
  /** 가장 가까운 길 위로 옮긴다(사람은 길 위로만 걷는다) */
  const snapToRoad = (point) => {
    for (const km of [0.1, 0.4, 1.2]) {
      const hit = nearestRoad(roads, roadIndex, point, km);
      if (hit) return hit;
    }
    return null;
  };
  const standAt = (point) => {
    const hit = snapToRoad(point);
    if (!hit) {
      me = { x: point.x, y: point.y };
      at = null;
      return;
    }
    at = { edge: hit.edge, seg: hit.seg, t: hit.t };
    me = placeOn(roads, at);
    needsDraw = true;
  };

  // ---------- 1. 시작 고르기 ----------
  function setup() {
    mode = 'setup';
    body.replaceChildren();
    body.append(element('p', 'guide', '동네를 걸어 다니다가 가까운 정류장이나 역에서 타 봐요.'));
    body.append(element('p', 'guide', '차도 가까이에서는 택시를 잡을 수 있어요.'));
    if (saved?.record && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      body.append(
        button('이어서 걷기', () => {
          standAt({ x: saved.x, y: saved.y });
          rider = saved.rider === 'child' ? 'child' : 'adult';
          record = saved.record;
          track = Array.isArray(saved.track) ? saved.track : [];
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
        standAt({ x: start.x, y: start.y });
        record = emptyRecord(hour * 60);
        track = appendPoint([], '걷기', me);
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
  let addressBox = null;
  let zoomNote = null;
  let goalBox = null;
  let lastAddressAt = null;

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
    walkPath = null;
    needsDraw = true;
    body.replaceChildren();
    hud = element('div', 'walk-hud');
    body.append(hud);
    const stage = element('div', 'walk-stage');
    canvas = document.createElement('canvas');
    canvas.className = 'walk-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '내가 걷는 동네 지도예요. 가운데 주황색 사람이 나예요.');
    stage.append(canvas);
    // 지금 있는 곳(주소)
    addressBox = element('div', 'walk-address');
    stage.append(addressBox);
    stage.append(element('p', 'walk-osm', '© OpenStreetMap contributors'));
    zoomNote = element('p', 'walk-zoom-note', '멀리서 볼 때는 큰길과 도시만 보여요. 자세히 보려면 + 를 눌러 확대해요.');
    zoomNote.hidden = true;
    stage.append(zoomNote);
    // 확대·축소(단추, 두 손가락, 마우스 휠)
    const zoomBy = (factor) => {
      map.setScale(map.scale * factor);
      needsDraw = true;
    };
    const zoom = element('div', 'walk-zoom');
    zoom.append(
      button('+', () => zoomBy(1.4), 'button'),
      button('−', () => zoomBy(1 / 1.4), 'button'),
      button('내 자리', () => {
        view = { ox: 0, oy: 0 };
        needsDraw = true;
      }, 'button walk-home'),
    );
    stage.append(zoom);
    // 조이스틱
    const pad = element('div', 'walk-pad');
    pad.setAttribute('aria-label', '움직이는 손잡이');
    const knob = element('div', 'walk-knob');
    pad.append(knob);
    stage.append(pad);
    // 그림 설명: 무엇이 무엇인지(그림과 글자를 함께)
    const legend = element('div', 'walk-legend');
    legend.append(element('span', 'walk-legend-bus', '버'), element('span', null, '버스 타는 곳'), element('span', 'walk-legend-train', '기차'), element('span', null, '기차역'));
    stage.append(legend);
    body.append(stage);
    messageBox = element('div', 'walk-message');
    body.append(messageBox);
    goalBox = element('div', 'tool-row walk-goalbox');
    body.append(goalBox);
    nearBox = element('div', 'walk-near');
    body.append(nearBox);
    const tools = element('div', 'tool-row');
    const soundButton = button(musicOn ? '소리: 켬' : '소리: 끔', () => {
      musicOn = !musicOn;
      saveView({ walkSound: musicOn });
      soundButton.textContent = musicOn ? '소리: 켬' : '소리: 끔';
      soundButton.setAttribute('aria-pressed', String(musicOn));
      if (musicOn) music.wake();
      else music.stop();
    });
    soundButton.setAttribute('aria-pressed', String(musicOn));
    tools.append(soundButton, button('랜드마크 목록', () => showLandmarkList()), button('가 보고 싶은 곳', chooseGoal), button('여행 기록 보기', showRecord), button('여행 일기', showDiary), button('그만 걷기', finish));
    body.append(tools);

    map = createWalkMap(canvas, {
      grid,
      roads,
      roadIndex,
      stations: subwayStations,
      railStations: rail.stations,
      railLines: rail.lines,
      busStopsNear: busStopsIn,
      landmarks,
      dongs: dongShapesList,
      water: waterList,
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
      clearTarget();
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

    // 지도 손가락: 한 번 톡 누르면 그곳으로 걸어가고(택시를 부를 때는 내릴 곳), 끌면 지도를 옮기고,
    // 두 손가락으로 벌리고 오므리면 확대·축소
    const touches = new Map();
    let pinch = null;
    let tap = null;
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // 잡을 수 없는 손가락이어도 그대로 쓴다
      }
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 1) {
        tap = { x: e.clientX, y: e.clientY, time: performance.now() };
        drag = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy };
      }
      if (touches.size === 2) {
        const [p1, p2] = [...touches.values()];
        pinch = { dist: Math.hypot(p1.x - p2.x, p1.y - p2.y), scale: map.scale };
        tap = null;
        drag = null;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && touches.size === 2) {
        const [p1, p2] = [...touches.values()];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (pinch.dist > 0) {
          map.setScale(pinch.scale * (dist / pinch.dist));
          needsDraw = true;
        }
      }
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) tap = null;
      if (drag && !tap && touches.size === 1) {
        // 끌어도 지도 범위 밖으로는 나가지 않는다
        const ox = drag.ox - (e.clientX - drag.x) / map.scale;
        const oy = drag.oy - (e.clientY - drag.y) / map.scale;
        view = { ox: Math.max(-me.x, Math.min(grid.cols - me.x, ox)), oy: Math.max(-me.y, Math.min(grid.rows - me.y, oy)) };
        needsDraw = true;
      }
    });
    const touchEnd = (e) => {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = null;
      if (tap && touches.size === 0 && e.type === 'pointerup' && performance.now() - tap.time < 600) {
        const r = canvas.getBoundingClientRect();
        const point = map.toWorld(e.clientX - r.left, e.clientY - r.top, center());
        if (mode === 'taxi-pick') pickTaxiGoal(point);
        else if (mode === 'walk') walkTo(point);
      }
      if (touches.size === 0) {
        tap = null;
        drag = null;
      }
    };
    canvas.addEventListener('pointerup', touchEnd);
    canvas.addEventListener('pointercancel', touchEnd);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        // 한 번 굴릴 때 너무 많이 줌하지 않게(트랙패드·큰 휠)
        zoomBy(Math.max(0.8, Math.min(1.25, Math.exp(-e.deltaY * 0.0015))));
      },
      { passive: false },
    );
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('resize', markDraw);
    lastTime = performance.now();
    lastNearAt = null;
    lastAddressAt = null;
    updateHud();
    updateNear(true);
    updateAddress(true);
    checkLandmarks();
    frame = requestAnimationFrame(tick);
  }

  /** 멀리 볼 때(작은 길·건물·정류장을 빼고 그릴 때) 확대하라는 안내 */
  function updateZoomNote() {
    if (!zoomNote || !map) return;
    const far = map.scale < 90;
    if (zoomNote.hidden === far) zoomNote.hidden = !far;
  }

  function markDraw() {
    needsDraw = true;
  }

  function clearTarget() {
    if (target || walkPath) needsDraw = true;
    // 누른 곳까지 걷던 중에 멈추면, 지금 서 있는 길 위 자리를 다시 잡는다
    // (걷는 동안에는 자리를 따로 고치지 않아서, 그대로 두면 출발했던 자리로 돌아간다)
    if (walkPath) {
      const here = nearestRoad(roads, roadIndex, me, 0.05);
      if (here) at = { edge: here.edge, seg: here.seg, t: here.t };
    }
    target = null;
    walkPath = null;
  }

  /** 누른 곳까지 길을 따라 가장 짧게 걸어간다 */
  function walkTo(point) {
    // 택시를 타고 있거나 택시 내릴 곳을 고르는 동안에는 걷지 않는다(내린 뒤 엉뚱한 곳에서 걷기 시작하지 않게)
    if (mode !== 'walk') {
      say('타고 있는 동안에는 걸어갈 수 없어요. 내린 뒤에 눌러요.');
      return;
    }
    clearTarget();
    const goal = nearestRoad(roads, roadIndex, point, 0.3);
    if (!goal) {
      say('그곳 가까이에는 걸을 길이 없어요.');
      return;
    }
    if (!at) standAt(me);
    if (!at) return;
    const route = walkRoute(roads, at, goal);
    if (!route || route.points.length < 2) {
      say('그곳까지 이어진 길을 찾지 못했어요.');
      return;
    }
    target = { x: goal.point[0], y: goal.point[1] };
    // 걷기 시작하면 화면이 내 자리로 돌아온다
    view = { ox: 0, oy: 0 };
    walkPath = { points: route.points, km: route.km, done: 0, goal: { edge: goal.edge, seg: goal.seg, t: goal.t } };
    say(`길을 따라 ${distanceText(Math.round(route.km * 1000))} 걸어가요.`);
    needsDraw = true;
  }

  /** 걸은 만큼 기록하고 둘레를 다시 본다 */
  function afterStep(km, dx) {
    track = appendPoint(track, '걷기', me);
    pendingKm += km;
    stepPhase += km * 400;
    if (Math.abs(dx) > 0.1) facing = Math.sign(dx);
    if (pendingKm > 0.02) {
      flushWalk();
      updateHud();
      persist();
    }
    updateNear();
    updateAddress();
    checkLandmarks();
    needsDraw = true;
  }

  function tick(t) {
    // 한 번 그리다 틀려도 다음 틀은 이어서 그린다(화면이 멈추지 않게)
    frame = requestAnimationFrame(tick);
    try {
      step(t);
    } catch (error) {
      console.error(error);
    }
  }

  function step(t) {
    // 자리 값이 잘못되면(숫자가 아니면) 바로 앞의 바른 자리로 되돌린다. 그대로 두면 지도가 바다만 보인다.
    if (!Number.isFinite(me?.x) || !Number.isFinite(me?.y)) {
      walkPath = null;
      target = null;
      if (lastGood) standAt(lastGood);
      needsDraw = true;
    } else lastGood = { x: me.x, y: me.y };
    if (!Number.isFinite(view.ox) || !Number.isFinite(view.oy)) view = { ox: 0, oy: 0 };
    updateZoomNote();
    const dt = Math.min(0.1, (t - lastTime) / 1000);
    lastTime = t;
    if (mode === 'walk') {
      let dir = { dx: joy.dx, dy: joy.dy };
      if (keys.size) dir = { dx: (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0), dy: (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0) };
      const strength = Math.min(1, Math.hypot(dir.dx, dir.dy));
      if (strength > 0.05) {
        // 손잡이나 방향 글쇠: 지금 길을 따라, 갈림점에서는 누른 쪽 길로. 옮겨 본 지도는 내 자리로 돌아온다.
        if (walkPath) clearTarget();
        view = { ox: 0, oy: 0 };
        if (!at) standAt(me);
        if (at) {
          const next = walkAlong(roads, at, dir, SCREEN_KM_PER_SEC * strength * dt);
          if (next.km > 0) {
            const dx = next.x - me.x;
            at = next.at;
            me = { x: next.x, y: next.y };
            afterStep(next.km, dx);
          } else if (t - blockedSaid > 1500) {
            blockedSaid = t;
            say('그쪽으로는 길이 없어요. 길이 난 쪽으로 눌러요.');
          }
        }
      } else if (walkPath) {
        // 누른 곳까지 길을 따라 걷기
        const step = Math.min(SCREEN_KM_PER_SEC * dt, walkPath.km - walkPath.done);
        walkPath.done += step;
        const ratio = walkPath.km > 0 ? walkPath.done / walkPath.km : 1;
        const pos = pointAlong(walkPath.points, ratio);
        const dx = pos.x - me.x;
        me = { x: pos.x, y: pos.y };
        afterStep(step, dx);
        if (ratio >= 1 - 1e-9) {
          at = walkPath.goal;
          me = placeOn(roads, at);
          walkPath = null;
          target = null;
          flushWalk();
          updateHud();
          persist(true);
          say('다 왔어요.');
          checkLandmarks(true);
        }
      }
    }
    if (needsDraw || taxiNow) {
      needsDraw = false;
      // 택시를 타는 동안에는 사람 대신 택시를 그린다
      map.draw(taxiNow ? me : center(), { goal, me: taxiNow ? null : { ...me, facing, step: stepPhase }, target, taxi: taxiNow, route: taxiPlan?.route?.points ?? walkPath?.points ?? null, routeKind: taxiPlan ? 'taxi' : 'walk' });
    }
  }

  /** 랜드마크에 들어왔는지 본다. 들어오면 도착 장면을 보여 주고 기록에 한 줄 남긴다. */
  function checkLandmarks(arrivedGoal = false) {
    if (!me) return;
    if (insideLandmark) {
      // 넉넉히 벗어나야 나간 것으로 본다(가장자리에서 들락날락하지 않게)
      if (Math.hypot(insideLandmark.x - me.x, insideLandmark.y - me.y) > insideLandmark.radius * 1.3) insideLandmark = null;
      else return;
    }
    // 넓은 곳(해수욕장 가운데처럼 길이 없는 곳)은 길 끝까지 걸어오면 다 온 것으로 본다
    const here = landmarks.find((lm) => Math.hypot(lm.x - me.x, lm.y - me.y) <= lm.radius) ?? (arrivedGoal && goal && Math.hypot(goal.x - me.x, goal.y - me.y) <= goal.radius + 0.3 ? goal : null);
    if (!here) {
      updateGoal();
      return;
    }
    insideLandmark = here;
    flushWalk();
    record = addEntry(record, { kind: '들름', title: `${here.name}에 들렀어요`, minutes: 0, place: here.id });
    if (goal?.id === here.id) {
      goal = null;
      updateGoal();
      needsDraw = true;
    }
    persist(true);
    updateHud();
    showLandmark(here);
  }

  /** 도착 장면: 그림, 소개 글, 가까운 탈 것 */
  function showLandmark(lm) {
    playLandmarkMusic(lm);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const card = element('div', 'lm-card');
    const [icon, kindName] = LANDMARK_ICON[lm.kind] ?? ['📍', '랜드마크'];
    card.append(element('h2', 'lm-title', `${icon} ${lm.name}에 왔어요`));
    card.append(landmarkScene(lm.kind, { reduceMotion, label: `${lm.name}(${kindName})을 그린 그림이에요. 실제 사진이 아니에요.` }));
    if (lm.facts.length) {
      const list = element('ul', 'lm-facts');
      // 어려운 낱말은 낱말 카드로 잇는다
      for (const f of lm.facts) {
        const li = element('li');
        li.append(textWithCards(f.text));
        list.append(li);
      }
      card.append(list);
      const sources = [...new Set(lm.facts.map((f) => f.source))];
      card.append(element('p', 'panel-note', `자료: ${sources.join(', ')}`));
    }
    card.append(element('p', 'panel-note', '그림은 그곳의 모습을 단순하게 그린 거예요.'));
    card.append(button('둘레 보기', () => updateNear(true), 'button big'));
    nearBox.replaceChildren(card);
    lastNearAt = { ...me };
    sceneAt = { ...me };
    say(`${lm.name}에 왔어요.`);
  }

  /** 랜드마크 주소: 시·구·동과 가까운 길 이름(한 번 셈해 둔다) */
  const addressCache = new Map();
  function landmarkAddress(lm) {
    if (!addressCache.has(lm.id)) {
      // 바다 위에 찍힌 곳(해수욕장 가운데 등)은 둘레에서 가장 가까운 동을 찾는다. 자료에 주소가 있으면 그것을 쓴다.
      let dong = lm.address ?? dongAt(dongShapesList, lm);
      for (const r of [0.1, 0.2, 0.4, 0.8]) {
        if (dong) break;
        for (let k = 0; k < 8 && !dong; k++) dong = dongAt(dongShapesList, { x: lm.x + r * Math.cos((k * Math.PI) / 4), y: lm.y + r * Math.sin((k * Math.PI) / 4) });
      }
      const named = nearestRoad(roads, roadIndex, lm, 0.3, (edge) => Boolean(edge.name));
      const road = named ? roads.edges[named.edge].name : null;
      addressCache.set(lm.id, [dong ?? lm.city, road ? `${road} 가까이` : null].filter(Boolean).join(' · '));
    }
    return addressCache.get(lm.id);
  }

  /** 이번 여행에서 들른 곳(id → 처음 들른 시각). 예전 기록은 이름으로 찾는다. */
  function visitedNow() {
    const visited = visitedPlaces(record);
    for (const e of record.entries) {
      if (e.kind !== '들름' || e.place) continue;
      const lm = landmarks.find((l) => e.title === `${l.name}에 들렀어요`);
      if (lm && !visited.has(lm.id)) visited.set(lm.id, e.at);
    }
    return visited;
  }

  /** 랜드마크 목록: 이름, 주소, 이번 여행에서 들렀는지, 지금 자리에서 곧은 거리 */
  function showLandmarkList(city = '전체') {
    nearBox.replaceChildren();
    const visited = visitedNow();
    const card = element('div', 'walk-card lm-list-card');
    card.append(element('strong', null, '랜드마크 목록'));
    card.append(element('p', 'panel-note', '들른 곳은 이번 여행 기록으로 알려 줘요. 처음부터 다시 하면 새로 시작해요.'));
    // 도시 고르기
    const cities = ['전체', ...new Set(landmarks.map((l) => l.city))];
    const cityRow = element('div', 'tr-sound-row');
    cityRow.setAttribute('role', 'group');
    cityRow.setAttribute('aria-label', '도시 고르기');
    for (const c of cities) {
      const node = button(c, () => showLandmarkList(c), c === city ? 'button is-on' : 'button');
      node.setAttribute('aria-pressed', String(c === city));
      cityRow.append(node);
    }
    card.append(cityRow);
    const list = landmarks
      .filter((l) => city === '전체' || l.city === city)
      .map((l) => ({ l, km: Math.hypot(l.x - me.x, l.y - me.y) }))
      .sort((a, b) => a.km - b.km);
    const table = element('ul', 'lm-list');
    for (const { l, km } of list) {
      const row = element('li', `lm-row${visited.has(l.id) ? ' is-visited' : ''}`);
      const [icon, kindName] = LANDMARK_ICON[l.kind] ?? ['📍', '랜드마크'];
      const head = element('div', 'lm-row-head');
      head.append(element('span', 'lm-row-icon', icon), element('strong', null, l.name), element('span', 'lm-row-kind', kindName));
      // 들렀는지: 글자와 표시를 함께(색만으로 알리지 않는다)
      const seen = visited.has(l.id);
      head.append(element('span', `lm-visit ${seen ? 'is-yes' : 'is-no'}`, seen ? `✔ 들렀어요 ${hhmm(visited.get(l.id))}` : '○ 아직 안 들렀어요'));
      row.append(head);
      row.append(element('p', 'lm-row-address', `📍 ${landmarkAddress(l)}`));
      const foot = element('div', 'lm-row-foot');
      foot.append(element('span', 'lm-row-dist', `여기서 곧게 재면 ${distanceText(Math.round(km * 1000))}`));
      foot.append(
        button(goal?.id === l.id ? '가는 곳이에요' : '가는 곳으로 정하기', () => {
          goal = l;
          needsDraw = true;
          updateGoal();
          showLandmarkList(city);
        }, goal?.id === l.id ? 'button is-on' : 'button'),
      );
      row.append(foot);
      table.append(row);
    }
    card.append(table);
    card.append(button('닫기', () => updateNear(true)));
    nearBox.append(card);
  }

  /** 랜드마크 음악(소리를 켰고, 지난번 음악에서 10초가 지났을 때만) */
  function playLandmarkMusic(lm) {
    if (!musicOn) return;
    const now = performance.now();
    if (!canPlayAgain(lastMusicAt, now)) return;
    if (music.play(lm.kind) > 0) lastMusicAt = now;
  }

  /** 여행 일기(지도 한 장과 시간 줄) */
  function diaryOf() {
    flushWalk();
    return renderDiary({ record, track, landmarks, visited: visitedNow(), dongs: dongShapesList, roads, roadIndex });
  }

  function showDiary() {
    nearBox.replaceChildren();
    const card = element('div', 'walk-card lm-list-card');
    card.append(diaryOf());
    card.append(button('닫기', () => updateNear(true)));
    nearBox.append(card);
    card.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }

  /** 가 보고 싶은 곳 고르기 */
  function chooseGoal() {
    nearBox.replaceChildren();
    const card = element('div', 'walk-card');
    card.append(element('strong', null, '가 보고 싶은 곳을 골라요'));
    card.append(element('p', 'panel-note', '지도에 주황 화살표로 방향을 보여 줘요.'));
    const byCity = new Map();
    for (const lm of landmarks) {
      if (!byCity.has(lm.city)) byCity.set(lm.city, []);
      byCity.get(lm.city).push(lm);
    }
    for (const [city, list] of byCity) {
      card.append(element('p', 'tr-fact-label', city));
      const row = element('div', 'tr-go-row');
      for (const lm of list) {
        const km = Math.hypot(lm.x - me.x, lm.y - me.y);
        row.append(
          button(`${(LANDMARK_ICON[lm.kind] ?? ['📍'])[0]} ${lm.name} (${distanceText(Math.round(km * 1000))})`, () => {
            goal = lm;
            needsDraw = true;
            updateGoal();
            updateNear(true);
          }),
        );
      }
      card.append(row);
    }
    if (goal) card.append(button('가는 곳 지우기', () => {
      goal = null;
      needsDraw = true;
      updateGoal();
      updateNear(true);
    }));
    card.append(button('닫기', () => updateNear(true)));
    nearBox.append(card);
  }

  /** 가는 곳까지 곧은 거리(메시지 줄 위) */
  function updateGoal() {
    if (!goalBox) return;
    if (!goal) {
      goalBox.replaceChildren();
      return;
    }
    const km = Math.hypot(goal.x - me.x, goal.y - me.y);
    goalBox.replaceChildren(
      element('span', 'walk-goal', `${(LANDMARK_ICON[goal.kind] ?? ['📍'])[0]} 가는 곳: ${goal.name} · 곧게 재면 ${distanceText(Math.round(km * 1000))}`),
      button('길 따라 걸어가기', () => walkTo({ x: goal.x, y: goal.y }), 'button'),
    );
  }

  /** 지도 위 "지금 있는 곳": 시·구·동과 가까운 길 이름 */
  function updateAddress(force = false) {
    if (!addressBox) return;
    if (!force && lastAddressAt && Math.hypot(lastAddressAt.x - me.x, lastAddressAt.y - me.y) < 0.015) return;
    lastAddressAt = { ...me };
    const dong = dongAt(dongShapesList, me);
    const named = nearestRoad(roads, roadIndex, me, 0.08, (edge) => Boolean(edge.name));
    const road = named ? roads.edges[named.edge].name : null;
    // 임의로 이은 길 위에서는 실제 길이 아니라고 알려 준다
    const made = nearestRoad(roads, roadIndex, me, 0.01, (edge) => edge.cls === MADE_ROAD);
    const place = made ? MADE_ROAD_NOTE : road ? `${road} 가까이` : null;
    addressBox.replaceChildren(element('span', 'walk-address-pin', '📍'), element('span', null, [dong ?? '이름 없는 곳', place].filter(Boolean).join(' · ')));
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
    // 도착 장면은 랜드마크를 벗어나 150m 넘게 걸어가거나 "둘레 보기"를 누를 때까지 남겨 둔다
    if (!force && sceneAt && (insideLandmark || Math.hypot(sceneAt.x - me.x, sceneAt.y - me.y) < 0.15)) return;
    sceneAt = null;
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
    const road = nearestRoad(roads, roadIndex, me, HAIL_KM, isCarRoad);
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
    rideFrom = { ...me };
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
    // 내린 곳에서 가장 가까운 길 위에 선다
    standAt(point);
    if (rideFrom) track = appendRide(track, entry.kind, [[rideFrom.x, rideFrom.y], [point.x, point.y]]);
    rideFrom = null;
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
    needsDraw = true;
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
    needsDraw = true;
    taxiPlan = null;
    taxiNow = null;
    mode = 'walk';
    say('');
    updateNear(true);
  }

  function pickTaxiGoal(point, name = null) {
    const end = nearestRoad(roads, roadIndex, point, 0.4, isCarRoad);
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
    needsDraw = true;
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
    clearTarget();
    mode = 'taxi';
    flushWalk();
    nearBox.replaceChildren(element('p', 'guide', '택시를 타고 가요. 창밖으로 길이 지나가요.'));
    const startClock = now();
    const realSeconds = Math.max(3, Math.min(14, plan.route.km / TAXI_SCREEN_KM_PER_SEC));
    const begin = performance.now();
    const step = () => {
      if (mode !== 'taxi') return;
      const ratio = Math.min(1, (performance.now() - begin) / 1000 / realSeconds);
      const pos = pointAlong(plan.route.points, ratio);
      taxiNow = pos;
      me = { x: pos.x, y: pos.y };
      needsDraw = true;
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
      track = appendRide(track, '택시', plan.route.points);
      record = addEntry(record, { kind: '택시', title: `택시${plan.name ? ` → ${plan.name}` : ''} (${distanceText(Math.round(plan.route.km * 1000))})`, minutes: plan.wait + plan.route.minutes, fare: plan.fare });
      at = { edge: plan.end.edge, seg: plan.end.seg, t: plan.end.t };
      me = { x: last[0], y: last[1] };
      needsDraw = true;
      persist(true);
      updateHud();
      updateNear(true);
      updateAddress(true);
      checkLandmarks();
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
    card.append(sum);
    card.append(diaryOf());
    card.append(element('p', 'panel-note', '같은 곳을 다른 방법으로 가면 시간과 돈이 어떻게 달라질까요?'));
    const row = element('div', 'tool-row');
    row.append(
      button('이어서 걷기', startWalking, 'button big'),
      button('처음부터 다시', () => {
        saveView({ walk: null });
        track = [];
        setup();
      }),
    );
    card.append(row);
    body.append(card);
  }

  setup();
  return () => stopAll();
}
