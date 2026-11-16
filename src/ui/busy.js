// 잠깐 기다리기 화면: 새 화면이나 3D를 만드는 동안(무거운 일) 먼저 "불러오고 있어요"를 그려 보여 준다.
// 브라우저가 이 화면을 실제로 그린 뒤(두 번의 그리기 틈) 무거운 일을 시작한다.
let depth = 0;
let node = null;

function show(text) {
  if (!node) {
    node = document.createElement('div');
    node.className = 'busy-overlay';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    const card = document.createElement('div');
    card.className = 'busy-card';
    const train = document.createElement('div');
    train.className = 'busy-train';
    train.setAttribute('aria-hidden', 'true');
    const label = document.createElement('p');
    label.className = 'busy-text';
    card.append(train, label);
    node.append(card);
  }
  node.querySelector('.busy-text').textContent = text;
  if (!node.isConnected) document.body.append(node);
}

function hide() {
  node?.remove();
}

/** 그리기 두 번을 기다린다(기다리기 화면이 실제로 보이게) */
// 화면이 가려져 그리기가 멈춘 때에도 멈춰 있지 않게, 0.12초가 지나면 그냥 시작한다
const twoFrames = () => Promise.race([new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))), new Promise((done) => setTimeout(done, 120))]);

/**
 * 무거운 일을 하는 동안 기다리기 화면을 보여 준다.
 * @template T
 * @param {() => T | Promise<T>} work
 * @param {string} [text]
 * @returns {Promise<T>}
 */
export async function withBusy(work, text = '불러오고 있어요.') {
  depth += 1;
  show(text);
  try {
    await twoFrames();
    return await work();
  } finally {
    depth -= 1;
    if (depth === 0) hide();
  }
}
