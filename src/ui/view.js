// 화면 보기 설정: 글자 크기, 안내 숨기기, 범례 펼침.
// 값은 storage.js에 두고, 여기서는 화면에 입히기만 한다.
import { loadView, saveView } from './storage.js';

/**
 * 범례를 처음부터 펼쳐 둘 만큼 화면이 넓은가. 태블릿에서는 펼치면 지도를 20% 넘게 가려서 접어서 시작한다.
 * 접어 둬도 지도 위 노선 번호표(1, 2, 3 …)가 있어 색만으로 뜻을 전하지 않는다.
 */
const WIDE_ENOUGH = '(min-width: 1400px) and (min-height: 900px)';

/** 저장한 보기 설정을 화면 전체에 입힌다. 앱이 시작할 때와 설정을 바꿀 때 부른다. */
export function applyView(view = loadView()) {
  const root = document.documentElement;
  root.style.setProperty('--text-scale', String(view.textScale));
  root.classList.toggle('hide-guides', !view.showGuides);
  return view;
}

/** 범례를 펼친 채로 시작할까. 아이가 한 번 접거나 펼쳤으면 그 선택을 따른다. */
export function legendStartsOpen() {
  const { legendOpen } = loadView();
  if (legendOpen !== null) return legendOpen;
  try {
    return window.matchMedia(WIDE_ENOUGH).matches;
  } catch {
    return true;
  }
}

export function rememberLegend(open) {
  saveView({ legendOpen: open });
}

/**
 * 위쪽 줄에 두는 "안내 숨기기" 단추.
 * 사용법 안내(.guide)만 숨긴다. 경고, 숫자, 정직 문구, 출처는 그대로 둔다.
 */
export function guideToggle() {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'button guide-toggle';
  const draw = () => {
    const { showGuides } = loadView();
    // 보이는 글자가 곧 단추 이름이다(title을 달면 화면 읽기·음성 조작에서 이름이 달라진다).
    node.textContent = showGuides ? '안내 숨기기' : '안내 보기';
    node.setAttribute('aria-pressed', String(!showGuides));
  };
  node.addEventListener('click', () => {
    const { showGuides } = loadView();
    applyView(saveView({ showGuides: !showGuides }));
    draw();
  });
  draw();
  return node;
}
