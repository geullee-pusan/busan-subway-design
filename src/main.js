import { renderCompare } from './ui/compare-screen.js';
import { renderExplore } from './ui/explore.js';
import { renderHome } from './ui/home.js';
import './ui/style.css';

const root = document.getElementById('app');
let cleanup = null;

function show(render) {
  cleanup?.();
  cleanup = render() ?? null;
}

function showHome() {
  show(() => renderHome(root, { onExplore: showExplore, onCompare: showCompare }));
}

function showExplore() {
  show(() => renderExplore(root, { onHome: showHome }));
}

function showCompare() {
  show(() => renderCompare(root, { onHome: showHome }));
}

showHome();
