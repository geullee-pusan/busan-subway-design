import { grid, ridership, ruleTables, stations } from './data.js';
import { BASE_YEAR, networkOfYear, rules, runWithDesign, setRules, worldFor } from './model.js';
import { designCost } from './sim/design.js';
import { NEW_LINE_ID } from './sim/design-world.js';
import { compareRuns } from './sim/effect.js';
import { residentVoices } from './sim/voices.js';
import { renderAB } from './ui/ab-screen.js';
import { renderCompare } from './ui/compare-screen.js';
import { renderDesign } from './ui/design-screen.js';
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
import { activeRuleSet, loadDesigns, loadSettings, runsLeft, saveDesign, saveSettings, useRun } from './ui/storage.js';
import './ui/style.css';

const root = document.getElementById('app');
let cleanup = null;
let settings = loadSettings();
const session = { design: null, estimate: null, mission: null };

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
  show(() =>
    renderHome(root, {
      onExplore: showExplore,
      onCompare: showCompare,
      onDesign: () => showDesign(null),
      onMissions: showMissions,
      onAB: showAB,
      onHistory: showHistory,
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

function showHistory() {
  show(() => renderHistory(root, { onHome: showHome }));
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
  show(() => renderMissions(root, { onHome: showHome, onPick: (mission) => showDesign(mission) }));
}

function showDesign(mission) {
  session.mission = mission;
  show(() =>
    renderDesign(root, { onHome: showHome, onRun: startEstimate, runsLeft: runsLeft(settings), mission }),
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
      onBack: () => showDesign(session.mission),
    }),
  );
}

/** 새 노선의 역 이름. 설계 화면에서 정한 이름을 쓰고, 없으면 선을 따라 "새 역 1, 2, 3…" */
function newStationNames(design) {
  const names = new Map();
  let order = 0;
  for (const cell of design.path) {
    if (!design.stations.includes(cell)) continue;
    order += 1;
    names.set(`${NEW_LINE_ID}-${cell}`, design.stationNames?.[cell] ?? `새 역 ${order}`);
  }
  return names;
}

function startRunning() {
  const design = session.design;
  const mission = session.mission;
  const options = { year: mission?.baseYear ?? 2026, dayType: mission?.dayType ?? '평일' };
  settings = useRun(settings);

  const base = worldFor(options);
  const after = runWithDesign(design, options);
  const effect = compareRuns(base.result, after.result);
  const yearStations = options.year < BASE_YEAR ? networkOfYear(options.year).stations : stations;
  const inGridStations = yearStations.filter((s) => s.inGrid);
  const existing = new Set(inGridStations.map((s) => s.row * grid.cols + s.col));
  const cost = designCost(design, grid, rules, ruleTables, existing);
  const voices = residentVoices({ design, grid, existingStations: inGridStations, rules });
  const left = runsLeft(settings);
  const endingText =
    left === null
      ? '오늘 운행이 끝났어요. 새 하루는 처음 화면에서 시작해요.'
      : left > 0
        ? `오늘 운행이 끝났어요. 오늘은 ${left}번 더 할 수 있어요.`
        : '오늘 운행은 모두 끝났어요. 내일 첫차는 05:30이에요.';

  show(() =>
    renderRunning(root, {
      design,
      result: after.result,
      hourShape: ridership.shape[options.dayType] ?? ridership.shape['평일'],
      onDone: () =>
        show(() =>
          renderResult(root, {
            design,
            cost,
            result: after.result,
            effect,
            estimate: session.estimate,
            newNames: newStationNames(design),
            endingText,
            mission,
            voices,
            ruleSetName: ruleSetName(),
            onSave: (slot, summary) =>
              saveDesign(slot, { ...summary, title: mission ? mission.title : '자유 설계', design }),
            onHome: showHome,
          }),
        ),
    }),
  );
}

// 홈 화면 설치 준비(서비스 워커 등록). https나 localhost에서만 돈다.
setupInstall();
showHome();
