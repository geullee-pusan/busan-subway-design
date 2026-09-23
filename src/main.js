import faresFile from './content/fares.json';
import { grid, ridership, ruleTables, stations } from './data.js';
import { BASE_YEAR, networkOfYear, rules, runWithDesign, setRules, worldFor } from './model.js';
import { planCost } from './sim/plan.js';
import { compareRuns } from './sim/effect.js';
import { planVoices } from './sim/voices.js';
import { renderAB } from './ui/ab-screen.js';
import { renderCompare } from './ui/compare-screen.js';
import { renderDesign } from './ui/design-screen.js';
import { renderRide } from './ui/ride-screen.js';
import { renderJourney } from './ui/journey-screen.js';
import { renderTrip } from './ui/trip-screen.js';
import { renderEstimate } from './ui/estimate-screen.js';
import { renderExplore } from './ui/explore.js';
import { renderHistory } from './ui/history-screen.js';
import { renderHome } from './ui/home.js';
import { setupInstall } from './ui/install.js';
import { applyView, guideToggle } from './ui/view.js';
import { renderParent } from './ui/parent-screen.js';
import { renderRules } from './ui/rules-screen.js';
import { renderMissions } from './ui/mission-screen.js';
import { renderResult } from './ui/result-screen.js';
import { renderRunning } from './ui/running-screen.js';
import { setNumberMode } from './ui/format.js';
import { activeRuleSet, loadDesigns, loadSettings, runsLeft, saveDesign, saveSettings, useRun, loadView } from './ui/storage.js';
import './ui/style.css';

const root = document.getElementById('app');
let cleanup = null;
let settings = loadSettings();
// year: 옛날 부산에서 고른 해(자유 설계를 그 해 부산에서 할 때). 없으면 지금 부산이다.
const session = { design: null, estimate: null, mission: null, year: null };

// 저장해 둔 "우리 집 규칙"과 숫자 표시 모드를 먼저 켠다.
applySaved();

function applySaved() {
  setNumberMode(settings.numberMode);
  setRules(activeRuleSet()?.values);
  applyView();
}

/** 지금 쓰는 규칙 묶음 이름. 없으면 null. */
function ruleSetName() {
  return activeRuleSet()?.name ?? null;
}

function show(render) {
  cleanup?.();
  cleanup = render() ?? null;
  // 모든 화면의 위쪽 줄 오른쪽 끝에 "안내 숨기기" 단추를 둔다.
  const bar = root.querySelector('.top-bar, .home-head');
  if (bar && !bar.querySelector('.guide-toggle')) bar.append(guideToggle());
}

function showHome() {
  session.design = null;
  session.estimate = null;
  session.mission = null;
  session.year = null;
  show(() =>
    renderHome(root, {
      onExplore: showExplore,
      onCompare: showCompare,
      onDesign: () => showDesign(null),
      onMissions: showMissions,
      onAB: showAB,
      onHistory: showHistory,
      onTrip: () => showTrip(),
      onRules: () => showRules(false),
      onParent: showParent,
      onCleared: () => {
        settings = loadSettings();
        applySaved();
        showHome();
      },
      ruleSetName: ruleSetName(),
      settings,
      onSetting: (next) => {
        settings = saveSettings({ ...settings, ...next });
        setNumberMode(settings.numberMode);
        showHome();
      },
    }),
  );
}

/** 여행하기: 걷기, 버스, 지하철, 택시로 가는 길 견주기. initial은 가 보기에서 돌아왔을 때 고른 것 */
function showTrip(initial = null) {
  show(() => renderTrip(root, { onHome: showHome, onGo: showJourney, initial }));
}

/** 고른 길로 가 보기(구간마다 따라가기) */
function showJourney({ trip, from, to, hour, rider, world, result, chosen }) {
  show(() =>
    renderJourney(root, {
      trip,
      from,
      to,
      hour,
      rider,
      world,
      result,
      hourShape: ridership.shape['평일'],
      fares: faresFile,
      onBack: () => showTrip({ from, to, chosen }),
    }),
  );
}

function showHistory() {
  show(() =>
    renderHistory(root, {
      onHome: showHome,
      // 그 해 부산에 새 노선 그리기
      onDesign: (year) => {
        session.year = year;
        showDesign(null);
      },
    }),
  );
}

/** 지금 설계의 기준 연도: 과제 카드의 해, 옛날 부산에서 고른 해, 아니면 지금 */
function designYear() {
  return session.mission?.baseYear ?? session.year ?? BASE_YEAR;
}

function showParent() {
  show(() =>
    renderParent(root, {
      onHome: showHome,
      onRules: () => showRules(true),
      ruleSetName: ruleSetName(),
      settings,
      onSetting: (next) => {
        settings = saveSettings({ ...settings, ...next });
        setNumberMode(settings.numberMode);
        return settings;
      },
      onCleared: () => {
        settings = loadSettings();
        applySaved();
        showHome();
      },
    }),
  );
}

function showRules(canEdit) {
  show(() =>
    renderRules(root, {
      canEdit,
      onBack: canEdit ? showParent : showHome,
      onApply: (values) => setRules(values ?? undefined),
    }),
  );
}

function showExplore() {
  show(() => renderExplore(root, { onHome: showHome }));
}

function showCompare() {
  show(() => renderCompare(root, { onHome: showHome }));
}

function showAB() {
  show(() => renderAB(root, { designs: loadDesigns(), onHome: showHome }));
}

function showMissions() {
  show(() =>
    renderMissions(root, {
      onHome: showHome,
      onPick: (mission) => {
        session.year = null;
        showDesign(mission);
      },
    }),
  );
}

/** @param {object|null} [design] 이어서 고칠 설계(시승이나 어림하기에서 돌아올 때) */
function showDesign(mission, design = null) {
  session.mission = mission;
  show(() =>
    renderDesign(root, {
      onHome: showHome,
      onRun: startEstimate,
      onRide: startRide,
      runsLeft: runsLeft(settings),
      mission,
      baseYear: designYear(),
      initialDesign: design,
    }),
  );
}

/** 시승: 내 노선 열차 한 대를 타 본다. 하루 운행 횟수는 쓰지 않는다. plan은 설계 묶음이다. */
function startRide(plan, ran = null) {
  session.design = plan;
  const mission = session.mission;
  const options = { year: designYear(), dayType: mission?.dayType ?? '평일', population: loadView().historyPopulation };
  const after = ran ?? runWithDesign(plan, options);
  show(() =>
    renderRide(root, {
      plan,
      world: after.world,
      result: after.result,
      hourShape: ridership.shape[options.dayType] ?? ridership.shape['평일'],
      dayType: options.dayType,
      year: options.year,
      onBack: () => showDesign(mission, plan),
      onHome: showHome,
    }),
  );
}

function startEstimate(design) {
  session.design = design;
  show(() =>
    renderEstimate(root, {
      onDone: (estimate) => {
        session.estimate = estimate;
        startRunning();
      },
      onBack: () => showDesign(session.mission, session.design),
    }),
  );
}

/** 새 노선들의 역 이름(역 번호 → 이름). 설계 화면에서 정한 이름을 쓰고, 없으면 선을 따라 "새 역 1, 2, 3…" */
function newStationNames(plan) {
  const names = new Map();
  for (const line of plan.lines) {
    let order = 0;
    for (const cell of line.path) {
      if (!line.stations.includes(cell)) continue;
      order += 1;
      names.set(`${line.id}-${cell}`, line.stationNames?.[cell] ?? `새 역 ${order}`);
    }
  }
  return names;
}

function startRunning() {
  // 설계 묶음(새 노선 여러 개). 화면마다 plan으로 넘긴다.
  const plan = session.design;
  const mission = session.mission;
  const options = { year: designYear(), dayType: mission?.dayType ?? '평일', population: loadView().historyPopulation };
  settings = useRun(settings);

  const base = worldFor(options);
  const after = runWithDesign(plan, options);
  const effect = compareRuns(base.result, after.result);
  const yearStations = options.year < BASE_YEAR ? networkOfYear(options.year).stations : stations;
  const inGridStations = yearStations.filter((s) => s.inGrid);
  const existing = new Set(inGridStations.map((s) => s.row * grid.cols + s.col));
  const cost = planCost(plan, grid, rules, ruleTables, existing);
  const voices = planVoices({ plan, grid, existingStations: inGridStations, rules });
  const left = runsLeft(settings);
  const endingText =
    left === null
      ? '오늘 운행이 끝났어요. 새 하루는 처음 화면에서 시작해요.'
      : left > 0
        ? `오늘 운행이 끝났어요. 오늘은 ${left}번 더 할 수 있어요.`
        : '오늘 운행은 모두 끝났어요. 내일 첫차는 05:30이에요.';

  show(() =>
    renderRunning(root, {
      plan,
      result: after.result,
      world: after.world,
      hourShape: ridership.shape[options.dayType] ?? ridership.shape['평일'],
      onDone: () =>
        show(() =>
          renderResult(root, {
            plan,
            cost,
            result: after.result,
            effect,
            estimate: session.estimate,
            year: options.year,
            newNames: newStationNames(plan),
            endingText,
            mission,
            voices,
            ruleSetName: ruleSetName(),
            onSave: (slot, summary) =>
              saveDesign(slot, { ...summary, title: mission ? mission.title : '자유 설계', design: plan }),
            onHome: showHome,
            onRide: () => startRide(plan, after),
          }),
        ),
    }),
  );
}

// 홈 화면 설치 준비(서비스 워커 등록). https나 localhost에서만 돈다.
setupInstall();
showHome();
