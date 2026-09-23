import { grid, ridership, ruleTables, stations } from './data.js';
import { rules, runWithDesign, todayRun } from './model.js';
import { designCost } from './sim/design.js';
import { NEW_LINE_ID } from './sim/design-world.js';
import { compareRuns } from './sim/effect.js';
import { renderCompare } from './ui/compare-screen.js';
import { renderDesign } from './ui/design-screen.js';
import { renderEstimate } from './ui/estimate-screen.js';
import { renderExplore } from './ui/explore.js';
import { renderHome } from './ui/home.js';
import { renderResult } from './ui/result-screen.js';
import { renderRunning } from './ui/running-screen.js';
import { loadSettings, runsLeft, saveSettings, useRun } from './ui/storage.js';
import './ui/style.css';

const root = document.getElementById('app');
let cleanup = null;
let settings = loadSettings();
const session = { design: null, estimate: null };

function show(render) {
  cleanup?.();
  cleanup = render() ?? null;
}

function showHome() {
  session.design = null;
  session.estimate = null;
  show(() =>
    renderHome(root, {
      onExplore: showExplore,
      onCompare: showCompare,
      onDesign: showDesign,
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

function showDesign() {
  show(() => renderDesign(root, { onHome: showHome, onRun: startEstimate, runsLeft: runsLeft(settings) }));
}

function startEstimate(design) {
  session.design = design;
  show(() =>
    renderEstimate(root, {
      onDone: (estimate) => {
        session.estimate = estimate;
        startRunning();
      },
      onBack: showDesign,
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
  settings = useRun(settings);
  const before = todayRun().result;
  const after = runWithDesign(design);
  const effect = compareRuns(before, after.result);
  const existing = new Set(stations.filter((s) => s.inGrid).map((s) => s.row * grid.cols + s.col));
  const cost = designCost(design, grid, rules, ruleTables, existing);
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
      hourShape: ridership.shape['평일'],
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
            onHome: showHome,
          }),
        ),
    }),
  );
}

showHome();
