// 시승 모드 소리. 파일을 받지 않고 브라우저에서 만든다(Web Audio). 밖으로 나가는 요청이 없다.
//  - 방송 안내음: 방송 앞에 울리는 짧은 가락(우리가 만든 가락. 실제 부산 음원이 아니다)
//  - 방송 배경음: 방송이 나오는 동안 작게 깔리는 가락(우리가 만든 것)
//  - 달리는 소리: 낮게 울리는 소리와 레일 이음매를 지나는 "덜컹" 소리
//  - 열차 진입 안내음: 부산교통공사 역사 안내방송(공공데이터포털 3033578)의 실제 음원. 상행선과 하행선이 다르다.
// 목소리는 기기의 음성 합성을 쓴다. 기기 안에 있는 목소리(localService)만 고른다.
import arrivalDownUrl from '../../data/build/sounds/arrival-down.mp3';
import arrivalUpUrl from '../../data/build/sounds/arrival-up.mp3';

/** 음 이름 → 주파수 */
const NOTE = { G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A3: 220, F3: 174.61, G3: 196, C4: 261.63, E4: 329.63 };
/** 방송 안내음: 올라가는 네 음 */
const CHIME = ['G4', 'C5', 'E5', 'G5'];
/** 방송 배경음: 한 마디에 네 음, 네 마디를 돈다(C, Am, F, G) */
const BED = [
  ['C4', 'E4', 'G4', 'E4'],
  ['A3', 'C4', 'E4', 'C4'],
  ['F3', 'A3', 'C4', 'A3'],
  ['G3', 'B4', 'D5', 'B4'],
];

/** 말할 때 쓰는 언어 표시 */
const LANG_TAG = { ko: 'ko-KR', en: 'en-US' };

/**
 * 목소리를 고르는 방법. 기기마다 되는 방법이 달라서 "목소리 들어 보기"로 찾은 방법을 기억해 둔다.
 *  voice: 목소리를 골라 정한다. lang: 언어만 정하고 기기 음성 엔진에 맡긴다. default: 기기 기본 목소리.
 */
export const VOICE_MODES = ['voice', 'lang', 'default'];
let voiceMode = 'voice';

/** "목소리 들어 보기"에서 찾은 방법을 쓴다(저장해 둔 값을 화면에서 넣어 준다). */
export function setVoiceMode(mode) {
  if (VOICE_MODES.includes(mode)) voiceMode = mode;
}

/** 이 언어의 목소리들 */
function voicesOf(lang) {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  return voices.filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith(lang));
}

/**
 * 방송에 쓸 목소리를 고른다.
 *  1. 기기 안 목소리(localService)가 있으면 그것.
 *  2. 안드로이드에서는 언어만 맞으면 쓴다. 안드로이드 Chrome은 기기에 깐 목소리(삼성 TTS, Google)도
 *     localService 표시를 하지 않을 때가 있다. 안드로이드 목소리는 기기의 음성 엔진이 읽는다.
 *  3. 목록이 비어 있으면(안드로이드 Chrome에서 흔하다) 목소리를 고르지 않고 언어만 정한다.
 *  4. 목록은 있는데 그 언어가 없으면(또는 컴퓨터에서 인터넷 목소리뿐이면) 읽지 않는다.
 * mode가 lang이나 default이면 목소리를 고르지 않는다(목소리를 정하면 소리가 안 나는 기기가 있다).
 * @returns {{voice: SpeechSynthesisVoice|null, lang: string}|null} null이면 읽을 목소리가 없다.
 */
export function pickVoice(lang, mode = voiceMode) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return null;
    const voices = synth.getVoices();
    const same = voicesOf(lang);
    const tag = LANG_TAG[lang] ?? lang;
    if (voices.length > 0 && same.length === 0) return null;
    if (mode === 'lang') return { voice: null, lang: tag };
    if (mode === 'default') {
      const fallback = voices.find((v) => v.default) ?? null;
      return { voice: fallback && voicesOf(lang).includes(fallback) ? fallback : null, lang: tag };
    }
    const local = same.find((v) => v.localService);
    if (local) return { voice: local, lang: local.lang.replace('_', '-') };
    if (same.length > 0 && isAndroid()) return { voice: same[0], lang: same[0].lang.replace('_', '-') };
    if (voices.length === 0) return { voice: null, lang: tag };
    return null;
  } catch {
    return null;
  }
}

/** 목록을 보고 우리말 목소리가 분명히 없는가(목록이 비어 있으면 알 수 없으니 false) */
export function surelyNoVoice(lang) {
  try {
    const voices = window.speechSynthesis?.getVoices() ?? [];
    return voices.length > 0 && voicesOf(lang).length === 0;
  } catch {
    return false;
  }
}

/** 한 문장을 읽을 말 조각을 만든다. */
function utterance(text, picked, rate) {
  const say = new SpeechSynthesisUtterance(text);
  if (picked.voice) say.voice = picked.voice;
  say.lang = picked.lang;
  say.rate = rate;
  say.volume = 1;
  return say;
}

/** 읽는 중인 말 조각을 붙잡아 둔다. Chrome은 붙잡지 않은 말 조각을 중간에 버려 소리가 안 날 때가 있다. */
const held = new Set();

/**
 * 말 조각을 읽기 시작한다. Chrome 버그를 피한다.
 *  - cancel 바로 뒤의 speak는 무시될 때가 있다: 읽는 중일 때만 멈추고 조금 쉬었다가 읽는다.
 *  - 멈춤(pause) 상태로 굳어 있을 때가 있다: 읽기 전에 resume을 부른다.
 * @param {SpeechSynthesisUtterance[]} list
 */
export function speakList(list) {
  const synth = window.speechSynthesis;
  if (!synth || list.length === 0) return;
  const busy = synth.speaking || synth.pending;
  if (busy) synth.cancel();
  const go = () => {
    try {
      synth.resume();
    } catch {
      // resume이 없는 브라우저
    }
    for (const say of list) {
      held.add(say);
      const release = () => held.delete(say);
      say.addEventListener('end', release);
      say.addEventListener('error', release);
      synth.speak(say);
    }
  };
  if (busy) setTimeout(go, 250);
  else go();
}

/**
 * 목소리 시험: 한 문장을 읽어 본다. 방법을 바꿔 가며 해 보고, 읽기가 시작된 방법을 알려 준다.
 * @returns {Promise<{ok: boolean, mode: string|null, log: string[]}>} log는 점검 결과(어른이 읽는다)
 */
export function testVoice() {
  const log = [];
  const synth = window.speechSynthesis;
  if (!synth) return Promise.resolve({ ok: false, mode: null, log: ['speechSynthesis 없음', `브라우저: ${navigator.userAgent}`] });
  const voices = synth.getVoices();
  log.push(`브라우저: ${navigator.userAgent}`);
  log.push(`목소리 ${voices.length}개: ${voices.map((v) => `${v.name}(${v.lang}${v.localService ? ', 기기' : ''}${v.default ? ', 기본' : ''})`).join(' / ') || '없음'}`);
  const order = [voiceMode, ...VOICE_MODES.filter((m) => m !== voiceMode)];
  const tryMode = (index) =>
    new Promise((resolve) => {
      if (index >= order.length) return resolve({ ok: false, mode: null, log });
      const mode = order[index];
      const picked = pickVoice('ko', mode);
      if (!picked) {
        log.push(`${mode}: 한국어 목소리 없음`);
        return resolve(tryMode(index + 1));
      }
      const say = utterance('이번 역은 서면, 서면역입니다.', picked, 0.95);
      let settled = false;
      const finish = (ok, note) => {
        if (settled) return;
        settled = true;
        clearTimeout(limit);
        log.push(`${mode}(${picked.voice?.name ?? '목소리 안 정함'}, ${picked.lang}): ${note}`);
        if (ok) {
          voiceMode = mode;
          resolve({ ok: true, mode, log });
        } else {
          try {
            synth.cancel();
          } catch {
            // 멈추지 못해도 다음 방법을 해 본다.
          }
          setTimeout(() => resolve(tryMode(index + 1)), 300);
        }
      };
      const limit = setTimeout(() => finish(false, '3초 동안 시작하지 않음'), 3000);
      say.addEventListener('start', () => finish(true, '읽기 시작함'));
      say.addEventListener('error', (event) => {
        const code = event.error ?? '알 수 없음';
        finish(false, `오류 ${code}`);
      });
      speakList([say]);
    });
  return tryMode(0);
}

/**
 * 목소리 목록이 다 올라올 때까지 기다린다. 브라우저는 처음에 빈 목록을 주고 나중에 voiceschanged로 알려 준다.
 * 목록이 비어 있지 않거나, 알려 주거나, 3초가 지나면 끝난다.
 */
export function voicesReady() {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve();
    try {
      if (synth.getVoices().length > 0) return resolve();
      const done = () => {
        clearTimeout(limit);
        synth.removeEventListener?.('voiceschanged', done);
        resolve();
      };
      const limit = setTimeout(done, 3000);
      synth.addEventListener?.('voiceschanged', done);
    } catch {
      resolve();
    }
  });
}

/** 이 브라우저가 글을 소리로 읽을 수 있는가. 삼성 인터넷, 카카오톡·네이버 앱 안의 브라우저에는 없다. */
export function speechSupported() {
  return typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
}

/** 어떤 브라우저로 열었는지 아이 말로(알 수 없으면 null) */
export function browserName() {
  const ua = navigator.userAgent ?? '';
  if (/SamsungBrowser/i.test(ua)) return '삼성 인터넷';
  if (/KAKAOTALK/i.test(ua)) return '카카오톡';
  if (/NAVER/i.test(ua)) return '네이버 앱';
  if (/; wv\)/.test(ua)) return '다른 앱 안의 브라우저';
  return null;
}

/**
 * 지금 페이지를 안드로이드 Chrome으로 다시 연다. 주소는 지금 연 주소를 그대로 쓴다(바깥 주소를 적어 두지 않는다).
 * Chrome이 없으면 기기가 Play 스토어의 Chrome을 보여 준다.
 */
export function openInChrome() {
  try {
    const { host, pathname, search, hash } = window.location;
    window.location.href = `intent://${host}${pathname}${search}${hash}#Intent;scheme=https;package=com.android.chrome;end`;
  } catch {
    // 열지 못하면 화면 안내대로 Chrome에서 직접 연다.
  }
}

/** 안드로이드인가(목소리 받는 화면을 바로 열 수 있다) */
export function isAndroid() {
  return /Android/i.test(navigator.userAgent ?? '');
}

/**
 * 기기의 음성 데이터 설치 화면을 연다(안드로이드 Chrome). 웹 페이지가 목소리를 직접 깔 수는 없어서,
 * 기기의 "음성 데이터 설치" 화면을 열어 사람이 고르게 한다. 인터넷 주소가 아니라 기기 설정 화면이다.
 */
export function openVoiceInstall() {
  try {
    window.location.href = 'intent:#Intent;action=android.speech.tts.engine.INSTALL_TTS_DATA;end';
  } catch {
    // 열지 못하면 화면의 안내를 따라 설정에서 받는다.
  }
}

/** 소리 도구를 만든다. 첫 소리는 누르기(탭) 안에서 나야 브라우저가 막지 않는다. */
export function createRideSound() {
  let ctx = null;
  let master = null;
  let rumble = null;
  let bed = null;
  let clackTimer = null;
  let playing = null; // 지금 나오는 열차 진입 안내음
  let token = 0; // 방송 순서가 바뀌면 앞 방송은 그만한다

  function context() {
    if (ctx) return ctx;
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return null;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    return ctx;
  }

  /** 누르기 안에서 불러 소리를 깨운다. */
  function wake() {
    const c = context();
    if (c?.state === 'suspended') c.resume().catch(() => {});
  }

  /** 종 소리 한 번 */
  function bell(freq, at, length = 1.2, volume = 0.25) {
    const c = context();
    if (!c) return;
    for (const [ratio, gain] of [
      [1, volume],
      [2, volume * 0.25],
      [3, volume * 0.08],
    ]) {
      const osc = c.createOscillator();
      const amp = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * ratio;
      amp.gain.setValueAtTime(0, at);
      amp.gain.linearRampToValueAtTime(gain, at + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, at + length);
      osc.connect(amp).connect(master);
      osc.start(at);
      osc.stop(at + length + 0.05);
    }
  }

  /** 방송 안내음. 끝나는 시각(초)을 돌려준다. */
  function chime() {
    const c = context();
    if (!c) return 0;
    const start = c.currentTime + 0.05;
    CHIME.forEach((name, i) => bell(NOTE[name], start + i * 0.28, 1.4));
    return 0.28 * CHIME.length + 0.6;
  }

  /** 방송 배경음을 켠다(작게). stopBed로 천천히 끈다. */
  function startBed() {
    const c = context();
    if (!c || bed) return;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(0.35, c.currentTime + 0.8);
    gain.connect(master);
    const beat = 0.42;
    let step = 0;
    let next = c.currentTime + 0.1;
    // 0.1초마다 앞으로 0.5초 동안 칠 음을 미리 잡아 둔다.
    const schedule = () => {
      while (next < c.currentTime + 0.5) {
        const bar = BED[Math.floor(step / 4) % BED.length];
        const freq = NOTE[bar[step % 4]];
        const osc = c.createOscillator();
        const amp = c.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        amp.gain.setValueAtTime(0, next);
        amp.gain.linearRampToValueAtTime(0.12, next + 0.02);
        amp.gain.exponentialRampToValueAtTime(0.0001, next + beat * 1.8);
        osc.connect(amp).connect(gain);
        osc.start(next);
        osc.stop(next + beat * 2);
        next += beat;
        step += 1;
      }
      if (bed?.gain === gain) bed.timer = setTimeout(schedule, 100);
    };
    bed = { gain, timer: null };
    schedule();
  }

  function stopBed() {
    if (!bed || !ctx) return;
    const { gain, timer } = bed;
    bed = null;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
    clearTimeout(timer);
    setTimeout(() => gain.disconnect(), 1400);
  }

  /** 달리는 소리를 켠다. */
  function startRumble() {
    const c = context();
    if (!c || rumble) return;
    // 갈색 잡음(낮은 소리가 많은 잡음)
    const length = c.sampleRate * 2;
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);
    // 잡음은 늘 같은 모양으로 만든다(작은 난수 생성기).
    let seed = 12345;
    let last = 0;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const white = (seed / 2147483648) * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(0.9, c.currentTime + 1.2);
    source.connect(filter).connect(gain).connect(master);
    source.start();
    rumble = { source, gain };
    // 덜컹덜컹: 레일 이음매
    const clack = () => {
      if (!rumble) return;
      const t = c.currentTime;
      for (const offset of [0, 0.12]) {
        const osc = c.createOscillator();
        const amp = c.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(90, t + offset);
        osc.frequency.exponentialRampToValueAtTime(40, t + offset + 0.08);
        amp.gain.setValueAtTime(0.12, t + offset);
        amp.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.09);
        osc.connect(amp).connect(master);
        osc.start(t + offset);
        osc.stop(t + offset + 0.1);
      }
    };
    const again = () => {
      clack();
      clackTimer = setTimeout(again, 900);
    };
    again();
  }

  function stopRumble() {
    clearTimeout(clackTimer);
    clackTimer = null;
    if (!rumble || !ctx) return;
    const { source, gain } = rumble;
    rumble = null;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
    source.stop(ctx.currentTime + 1.1);
  }

  /** 열차 진입 안내음(실제 음원). 다 울리면 끝나는 약속을 돌려준다(최대 12초). */
  function trainEntering(direction) {
    stopEntering();
    return new Promise((resolve) => {
      try {
        const audio = new Audio(direction === 1 ? arrivalDownUrl : arrivalUpUrl);
        audio.volume = 0.9;
        playing = audio;
        const done = () => {
          clearTimeout(limit);
          resolve();
        };
        const limit = setTimeout(done, 12000);
        audio.addEventListener('ended', done, { once: true });
        audio.addEventListener('error', done, { once: true });
        audio.play().catch(done);
      } catch {
        resolve();
      }
    });
  }

  function stopEntering() {
    if (!playing) return;
    playing.pause();
    playing = null;
  }

  /**
   * 방송: 안내음 → 우리말 → 영어. 배경음을 켜면 방송 동안 작게 깔린다.
   * @param {{korean: string[], english: string[], voice: boolean, music: boolean}} p
   */
  function announce({ korean, english, voice, music }) {
    const my = ++token;
    const wait = music ? chime() : 0;
    if (music) startBed();
    const synth = window.speechSynthesis;
    if (!voice || !synth) {
      if (music) setTimeout(() => my === token && stopBed(), (wait + 4) * 1000);
      return;
    }
    Promise.all([voicesReady(), new Promise((r) => setTimeout(r, wait * 1000))]).then(() => {
      if (my !== token) return;
      const ko = pickVoice('ko');
      const en = pickVoice('en');
      if (!ko && !en) {
        if (music) setTimeout(() => my === token && stopBed(), 4000);
        return;
      }
      const queue = [
        ...(ko ? korean.map((text) => ({ text, voice: ko, rate: 0.95 })) : []),
        ...(en ? english.map((text) => ({ text, voice: en, rate: 0.9 })) : []),
      ];
      const list = queue.map((item) => utterance(item.text, item.voice, item.rate));
      if (list.length > 0) list.at(-1).addEventListener('end', () => my === token && stopBed());
      speakList(list);
      if (list.length === 0) stopBed();
    });
  }

  /** 모두 끈다(화면을 떠날 때). */
  function stopAll() {
    token += 1;
    stopEntering();
    stopRumble();
    stopBed();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // 목소리가 없는 기기
    }
    if (ctx) {
      const closing = ctx;
      ctx = null;
      setTimeout(() => closing.close().catch(() => {}), 1500);
    }
  }

  return { wake, announce, startRumble, stopRumble, trainEntering, stopAll };
}
