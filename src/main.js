import { grid, ridership, ruleTables, stations } from './data.js';
import { rules, runWithDesign, worldFor } from './model.js';
import { designCost } from './sim/design.js';
import { NEW_LINE_ID } from './sim/design-world.js';
import { compareRuns } from './sim/effect.js';
import { residentVoices } from './sim/voices.js';
import { renderAB } from './ui/ab-screen.js';
import { renderCompare } from './ui/compare-screen.js';
import { renderDesign } from './ui/design-screen.js';
import { renderEstimate } from './ui/estimate-screen.js';
import { renderExplore } from './ui/explore.js';
import { renderHome } from './ui/home.js';
import { renderMissions } from './ui/mission-screen.js';
import { renderResult } from './ui/result-screen.js';
import { renderRunning } from './ui/running-screen.js';
import { loadDesigns, loadSettings, runsLeft, saveDesign, saveSettings, useRun } from './ui/storage.js';
import './ui/style.css';

const root = document.getElementById('app');
let cleanup = null;
let settings = loadSettings();
const session = { design: null, estimate: null, mission: null };

function show(render) {
  cleanup?.();
  cleanup = render() ?? null;
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
      settings,
      onSetting: (next) => {
        settings = saveSettings({ ...settings, ...next });
        showHome();
      },
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

/** 새 노선의 역 이름: 선을 따라 첫 역부터 "새 역 1, 2, 3…" */
function newStationNames(design) {
  const names = new Map();
  let order = 0;
  for (const cell of design.path) {
    if (!design.stations.includes(cell)) continue;
    order += 1;
    names.set(`${NEW_LINE_ID}-${cell}`, `새 역 ${order}`);
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
  const inGridStations = stations.filter((s) => s.inGrid);
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
            onSave: (slot, summary) =>
              saveDesign(slot, { ...summary, title: mission ? mission.title : '자유 설계', design }),
            onHome: showHome,
          }),
        ),
    }),
  );
}

showHome();
