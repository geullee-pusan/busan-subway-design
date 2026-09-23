// 첫 화면. Phase 1에서는 '부산 둘러보기'만 연다. 나머지 단추는 뒤 Phase에서 하나씩 연다.

const CREDITS = [
  '© OpenStreetMap contributors (openstreetmap.org/copyright)',
  '행정동 경계: 통계청 SGIS(공공누리 제1유형), vuski/admdongkor 가공(CC BY 4.0)',
  '고도: SRTM(U.S. Geological Survey)',
  '역·운행·인구: 부산교통공사, 국가철도공단, 한국철도공사, 김해시, 행정안전부(공공데이터포털)',
];

/**
 * @param {HTMLElement} root
 * @param {{onExplore: () => void, onCompare: () => void, onDesign: () => void}} actions
 */
export function renderHome(root, { onExplore, onCompare, onDesign }) {
  root.replaceChildren();

  const main = document.createElement('main');
  main.className = 'screen home';

  const title = document.createElement('h1');
  title.textContent = '부산 도시철도 설계실';
  main.append(title);

  const buttons = document.createElement('div');
  buttons.className = 'home-buttons';
  const explore = document.createElement('button');
  explore.type = 'button';
  explore.className = 'button big';
  explore.textContent = '부산 둘러보기';
  explore.addEventListener('click', onExplore);
  buttons.append(explore);

  const design = document.createElement('button');
  design.type = 'button';
  design.className = 'button big';
  design.textContent = '노선 그리기';
  design.addEventListener('click', onDesign);
  buttons.append(design);

  const compare = document.createElement('button');
  compare.type = 'button';
  compare.className = 'button big';
  compare.textContent = '우리 계산 vs 진짜';
  compare.addEventListener('click', onCompare);
  buttons.append(compare);
  main.append(buttons);

  const note = document.createElement('p');
  note.className = 'home-note';
  note.textContent = '지도에서 역을 눌러 보세요. 이름과 하루에 타는 사람 수를 볼 수 있어요.';
  main.append(note);

  const credits = document.createElement('ul');
  credits.className = 'credits';
  for (const text of CREDITS) {
    const li = document.createElement('li');
    li.textContent = text;
    credits.append(li);
  }
  main.append(credits);

  root.append(main);
}
