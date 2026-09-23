import { renderExplore } from './ui/explore.js';
import { renderHome } from './ui/home.js';
import './ui/style.css';

const root = document.getElementById('app');
let cleanup = null;

function showHome() {
  cleanup?.();
  cleanup = null;
  renderHome(root, { onExplore: showExplore });
}

function showExplore() {
  cleanup?.();
  cleanup = renderExplore(root, { onHome: showHome });
}

showHome();
