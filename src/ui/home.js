// 첫 화면. Phase 0에서는 제목과 출처만 보여준다. 버튼은 Phase 1부터 하나씩 연다.

const CREDITS = [
  '© OpenStreetMap contributors',
  '행정동 경계: 통계청 SGIS(공공누리 제1유형), vuski/admdongkor 가공(CC BY 4.0)',
  '고도: SRTM(U.S. Geological Survey)',
  '역·운행·인구: 부산교통공사, 국가철도공단, 한국철도공사, 행정안전부(공공데이터포털)',
];

/** @param {HTMLElement} root */
export function renderHome(root) {
  root.innerHTML = '';

  const main = document.createElement('main');
  main.className = 'home';

  const title = document.createElement('h1');
  title.textContent = '부산 도시철도 설계실';

  const note = document.createElement('p');
  note.className = 'home-note';
  note.textContent = '지금 만들고 있어요.';

  const credits = document.createElement('ul');
  credits.className = 'credits';
  for (const text of CREDITS) {
    const li = document.createElement('li');
    li.textContent = text;
    credits.append(li);
  }

  main.append(title, note, credits);
  root.append(main);
}
