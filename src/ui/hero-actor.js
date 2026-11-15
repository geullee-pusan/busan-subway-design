// 차 안이나 화면 한쪽에 서 있는 주인공(아이를 닮은 3D 주인공을 scripts/hero-bake.mjs로 거의 정면에서 구운 그림).
// 평소에는 서 있고, 동작을 고르면 그 춤을 한 번 춘 뒤 다시 선다. 움직임 줄이기를 켠 기기에서는 춤 대신 서 있는 그림만 보여 준다.
import frontUrl from '../content/hero/front.webp';
import idleUrl from '../content/hero/front-idle.webp';
import front from '../content/hero/front.json';

/** 고를 수 있는 동작(춤 이름은 Mixamo 동작 이름을 쉬운 말로 옮긴 것) */
const DANCE_NAMES = {
  hiphop: '힙합 춤 1',
  hiphop2: '힙합 춤 2',
  hiphop3: '힙합 춤 3',
  hiphop4: '힙합 춤 4',
  silly: '신나는 춤 1',
  silly2: '신나는 춤 2',
  chicken: '닭 춤',
};
export const HERO_MOTIONS = [{ id: 'stand', name: '서 있기' }, ...front.dances.map((d) => ({ id: d.name, name: DANCE_NAMES[d.name] ?? d.name }))];

let images = null;
function loadImages() {
  if (images || typeof Image === 'undefined') return images;
  const load = (src) => {
    const img = new Image();
    const box = { img, ready: false };
    img.onload = () => {
      box.ready = true;
    };
    img.src = src;
    return box;
  };
  images = { sheet: load(frontUrl), idle: load(idleUrl) };
  return images;
}

/**
 * 주인공 한 명. el을 화면에 붙이고 play(동작 id)로 움직인다.
 * @param {{reduceMotion?: boolean}} [options]
 * @returns {{el: HTMLDivElement, play: (id: string) => void, wake: () => void, onChange: (fn: (id: string) => void) => void, destroy: () => void}}
 */
export function createHeroActor({ reduceMotion = false } = {}) {
  const imgs = loadImages();
  const el = document.createElement('div');
  el.className = 'hero-actor';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '나(주인공)예요.');
  el.append(canvas);
  const cell = front.cell;
  canvas.width = cell;
  canvas.height = cell;
  const ctx = canvas.getContext('2d');
  let playing = null; // {row, start}
  let frame = 0;
  let listener = null;
  let alive = true;

  function draw(now) {
    ctx.clearRect(0, 0, cell, cell);
    if (playing && imgs?.sheet.ready) {
      const d = front.dances[playing.row];
      const f = Math.floor(((now - playing.start) / 1000) * front.fps);
      if (f >= d.frames) {
        playing = null;
        listener?.('stand');
      } else {
        ctx.drawImage(imgs.sheet.img, f * cell, playing.row * cell, cell, cell, 0, 0, cell, cell);
        return true;
      }
    }
    if (imgs?.idle.ready) ctx.drawImage(imgs.idle.img, 0, 0, cell, cell);
    return !imgs?.idle.ready;
  }
  function tick(now) {
    frame = 0;
    // 화면에서 떨어지면 멈춘다(다시 붙이면 play가 다시 깨운다)
    if (!alive || !el.isConnected) {
      if (alive && !el.isConnected && playing) frame = requestAnimationFrame(tick);
      return;
    }
    if (draw(now)) frame = requestAnimationFrame(tick);
  }
  const wake = () => {
    if (!frame && alive) frame = requestAnimationFrame(tick);
  };
  // 그림을 다 읽으면 서 있는 모습을 그린다
  if (imgs) {
    imgs.idle.img.addEventListener('load', wake, { once: true });
    imgs.sheet.img.addEventListener('load', wake, { once: true });
  }
  wake();
  return {
    el,
    play(id) {
      const row = front.dances.findIndex((d) => d.name === id);
      playing = row >= 0 && !reduceMotion ? { row, start: performance.now() } : null;
      listener?.(playing ? id : 'stand');
      wake();
    },
    /** 다시 그린 탈것 그림에 옮겨 붙였을 때 그리기를 깨운다(하던 동작은 이어진다) */
    wake,
    onChange(fn) {
      listener = fn;
    },
    destroy() {
      alive = false;
      if (frame) cancelAnimationFrame(frame);
      el.remove();
    },
  };
}

/**
 * 탈것 그림 위에 주인공을 세운다. place는 그림 틀 안의 자리(%): left, bottom(음수면 아래가 가려져 앉은 것처럼 보인다), height.
 * @param {Element} art 탈것 안 그림(SVG)
 * @param {ReturnType<typeof createHeroActor>} actor
 * @param {{left: number, bottom: number, height: number}} place
 */
export function heroInside(art, actor, place) {
  const box = document.createElement('div');
  box.className = 'hero-inside';
  box.append(art);
  actor.el.style.left = `${place.left}%`;
  actor.el.style.bottom = `${place.bottom}%`;
  actor.el.style.height = `${place.height}%`;
  box.append(actor.el);
  actor.wake();
  return box;
}

/**
 * 동작 고르기: 단추를 누르면 주인공이 그 동작을 한 번 해요.
 * @param {(id: string) => void} onPick
 * @param {{reduceMotion?: boolean}} [options]
 */
export function heroMotionPicker(onPick, { reduceMotion = false } = {}) {
  const box = document.createElement('div');
  box.className = 'hero-motions';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', '주인공 동작 고르기');
  const title = document.createElement('p');
  title.className = 'hero-motions-title';
  title.textContent = reduceMotion ? '움직임 줄이기가 켜져 있어서 주인공은 서 있기만 해요.' : '🕺 주인공 동작을 골라 봐요.';
  box.append(title);
  const row = document.createElement('div');
  row.className = 'hero-motions-row';
  const buttons = new Map();
  for (const m of HERO_MOTIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'button hero-motion';
    b.textContent = m.name;
    b.setAttribute('aria-pressed', m.id === 'stand' ? 'true' : 'false');
    b.disabled = reduceMotion && m.id !== 'stand';
    b.addEventListener('click', () => onPick(m.id));
    buttons.set(m.id, b);
    row.append(b);
  }
  box.append(row);
  return {
    el: box,
    /** 지금 하는 동작을 단추에 표시한다 */
    mark(id) {
      for (const [key, b] of buttons) b.setAttribute('aria-pressed', key === id ? 'true' : 'false');
    },
  };
}
