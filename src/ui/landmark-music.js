// 랜드마크에 도착했을 때 나오는 짧은 음악(3~5초). 녹음이 아니라 기기에서 바로 합성한다(Web Audio).
// 가락은 이 게임을 위해 새로 지은 것이다. 랜드마크 종류마다 어울리는 악기와 분위기를 고른다.

/** 장조 5음 음계와 국악풍 5음(평조) 음계의 반음 거리 */
const MAJOR_PENTA = [0, 2, 4, 7, 9];
const KOREAN_PENTA = [0, 2, 5, 7, 9];
/** 음계 칸 번호 → 반음(옥타브를 넘으면 12씩 더한다) */
const degree = (scale, n) => scale[((n % scale.length) + scale.length) % scale.length] + 12 * Math.floor(n / scale.length);
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/**
 * 종류별 곡: root(가운데 음, MIDI), bpm, scale, voice(악기), notes([음계 칸, 박] … null은 쉼), extra(바닷소리, 새소리 등)
 */
const TUNES = {
  beach: { root: 67, bpm: 132, scale: MAJOR_PENTA, voice: 'pluck', notes: [[0, 0.5], [2, 0.5], [4, 0.5], [5, 1], [4, 0.5], [2, 0.5], [3, 1.5]], extra: 'waves', chord: [0, 4, 7] },
  cliff: { root: 62, bpm: 96, scale: MAJOR_PENTA, voice: 'pad', notes: [[0, 1], [2, 1], [4, 1], [3, 2]], extra: 'waves', chord: [0, 7, 12] },
  island: { root: 64, bpm: 110, scale: MAJOR_PENTA, voice: 'pluck', notes: [[4, 0.5], [3, 0.5], [2, 0.5], [3, 0.5], [4, 1], [5, 1.5]], extra: 'gulls', chord: [0, 4, 7] },
  viewpoint: { root: 65, bpm: 100, scale: MAJOR_PENTA, voice: 'flute', notes: [[0, 1], [4, 1], [5, 1], [7, 2]], extra: 'wind', chord: [0, 7, 16] },
  bridge: { root: 72, bpm: 140, scale: MAJOR_PENTA, voice: 'bell', notes: [[0, 0.5], [2, 0.5], [4, 0.5], [5, 0.5], [7, 0.5], [9, 1.5]], chord: [0, 4, 7, 12] },
  tower: { root: 60, bpm: 120, scale: MAJOR_PENTA, voice: 'bell', notes: [[0, 0.5], [3, 0.5], [5, 0.5], [8, 0.5], [10, 2]], chord: [0, 7, 12, 19] },
  market: { root: 69, bpm: 150, scale: MAJOR_PENTA, voice: 'pluck', notes: [[0, 0.5], [0, 0.5], [2, 0.5], [4, 0.5], [2, 0.5], [0, 0.5], [1, 0.5], [0, 1]], extra: 'claps', chord: [0, 4, 7] },
  street: { root: 64, bpm: 144, scale: MAJOR_PENTA, voice: 'square', notes: [[2, 0.5], [4, 0.5], [2, 0.5], [5, 0.5], [4, 1], [7, 1]], extra: 'claps', chord: [0, 4, 7] },
  village: { root: 67, bpm: 120, scale: MAJOR_PENTA, voice: 'musicbox', notes: [[4, 0.5], [2, 0.5], [0, 0.5], [2, 0.5], [4, 0.5], [4, 0.5], [4, 1]], chord: [0, 4, 7] },
  park: { root: 72, bpm: 112, scale: MAJOR_PENTA, voice: 'flute', notes: [[0, 0.5], [2, 0.5], [4, 1], [2, 0.5], [4, 0.5], [5, 1.5]], extra: 'birds', chord: [0, 4, 7] },
  garden: { root: 70, bpm: 104, scale: MAJOR_PENTA, voice: 'flute', notes: [[2, 1], [4, 0.5], [5, 0.5], [4, 1], [7, 1.5]], extra: 'birds', chord: [0, 4, 9] },
  cherry: { root: 76, bpm: 108, scale: MAJOR_PENTA, voice: 'musicbox', notes: [[4, 0.5], [5, 0.5], [7, 1], [5, 0.5], [4, 0.5], [2, 1.5]], chord: [0, 4, 7] },
  lake: { root: 65, bpm: 90, scale: MAJOR_PENTA, voice: 'flute', notes: [[0, 1], [2, 1], [3, 1], [2, 1.5]], extra: 'ripples', chord: [0, 7, 16] },
  wetland: { root: 67, bpm: 96, scale: MAJOR_PENTA, voice: 'flute', notes: [[3, 1], [2, 0.5], [0, 0.5], [2, 2]], extra: 'birds', chord: [0, 7, 14] },
  mountain: { root: 55, bpm: 100, scale: MAJOR_PENTA, voice: 'horn', notes: [[0, 1], [2, 0.5], [4, 0.5], [5, 2]], extra: 'wind', chord: [0, 7, 12] },
  temple: { root: 57, bpm: 76, scale: KOREAN_PENTA, voice: 'gayageum', notes: [[0, 1], [2, 1], [3, 0.5], [2, 0.5], [0, 2]], extra: 'gong', chord: [0, 7] },
  pavilion: { root: 60, bpm: 84, scale: KOREAN_PENTA, voice: 'daegeum', notes: [[2, 1], [3, 1], [4, 0.5], [3, 0.5], [2, 2]], chord: [0, 7] },
  hanok: { root: 62, bpm: 92, scale: KOREAN_PENTA, voice: 'gayageum', notes: [[0, 0.5], [2, 0.5], [3, 1], [2, 0.5], [3, 0.5], [4, 1.5]], chord: [0, 7] },
  fortress: { root: 55, bpm: 96, scale: KOREAN_PENTA, voice: 'horn', notes: [[0, 1], [3, 1], [4, 1], [3, 0.5], [4, 1.5]], extra: 'drum', chord: [0, 7, 12] },
  tomb: { root: 53, bpm: 72, scale: KOREAN_PENTA, voice: 'daegeum', notes: [[0, 1.5], [2, 1], [3, 1], [2, 2]], extra: 'gong', chord: [0, 7] },
  observatory: { root: 79, bpm: 100, scale: MAJOR_PENTA, voice: 'musicbox', notes: [[0, 0.5], [0, 0.5], [3, 0.5], [3, 0.5], [4, 0.5], [4, 0.5], [3, 1]], extra: 'sparkle', chord: [0, 7, 12] },
  museum: { root: 72, bpm: 96, scale: MAJOR_PENTA, voice: 'musicbox', notes: [[0, 0.5], [2, 0.5], [4, 0.5], [2, 0.5], [3, 2]], chord: [0, 4, 7] },
  rockart: { root: 50, bpm: 92, scale: KOREAN_PENTA, voice: 'horn', notes: [[0, 1], [2, 1], [0, 0.5], [3, 0.5], [2, 2]], extra: 'drum', chord: [0, 7] },
  themepark: { root: 67, bpm: 168, scale: MAJOR_PENTA, voice: 'organ', notes: [[0, 0.5], [2, 0.5], [4, 0.5], [7, 0.5], [5, 0.5], [4, 0.5], [5, 0.5], [7, 1]], chord: [0, 4, 7] },
  stadium: { root: 60, bpm: 132, scale: MAJOR_PENTA, voice: 'brass', notes: [[0, 0.5], [0, 0.5], [3, 0.5], [5, 1], [3, 0.5], [5, 1.5]], extra: 'cheer', chord: [0, 4, 7, 12] },
};

export function createLandmarkMusic() {
  let ctx = null;
  let master = null;
  let current = null; // 지금 나오는 곡의 소리 묶음(새 곡이 나오면 끈다)

  function context() {
    if (ctx) return ctx;
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return null;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    return ctx;
  }

  /** 누르기 안에서 불러 소리를 깨운다(태블릿 브라우저는 손으로 누른 뒤에만 소리를 낸다). */
  function wake() {
    const c = context();
    if (c?.state === 'suspended') c.resume().catch(() => {});
  }

  /** 소리 하나: 악기마다 파형, 울림, 떨림이 다르다 */
  function note(out, voice, freq, at, length, volume) {
    const c = ctx;
    const shapes = {
      pluck: { type: 'triangle', attack: 0.005, decay: Math.max(0.5, length * 1.5), partials: [[2, 0.3]] },
      gayageum: { type: 'triangle', attack: 0.004, decay: Math.max(0.8, length * 1.8), partials: [[2, 0.35], [3, 0.1]], bend: 1.02 },
      bell: { type: 'sine', attack: 0.003, decay: Math.max(1, length * 2.4), partials: [[2.76, 0.25], [5.4, 0.08]] },
      musicbox: { type: 'sine', attack: 0.002, decay: Math.max(0.7, length * 2), partials: [[4, 0.15]] },
      flute: { type: 'sine', attack: 0.06, sustain: true, partials: [[2, 0.12]], vibrato: 5 },
      daegeum: { type: 'sine', attack: 0.09, sustain: true, partials: [[2, 0.2], [3, 0.06]], vibrato: 4.5, bend: 0.985 },
      horn: { type: 'sawtooth', attack: 0.05, sustain: true, partials: [], filter: 900 },
      brass: { type: 'sawtooth', attack: 0.03, sustain: true, partials: [], filter: 1600 },
      organ: { type: 'square', attack: 0.01, sustain: true, partials: [[2, 0.4]], filter: 2200 },
      square: { type: 'square', attack: 0.005, decay: Math.max(0.3, length * 1.1), partials: [], filter: 2600 },
      pad: { type: 'triangle', attack: 0.2, sustain: true, partials: [[2, 0.2]] },
    };
    const s = shapes[voice] ?? shapes.pluck;
    let target = out;
    if (s.filter) {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = s.filter;
      lp.connect(out);
      target = lp;
    }
    const end = s.sustain ? at + length * 0.95 + 0.15 : at + s.decay;
    for (const [ratio, gain] of [[1, 1], ...s.partials]) {
      const osc = c.createOscillator();
      const amp = c.createGain();
      osc.type = ratio === 1 ? s.type : 'sine';
      const f = freq * ratio;
      if (s.bend) {
        osc.frequency.setValueAtTime(f * s.bend, at);
        osc.frequency.exponentialRampToValueAtTime(f, at + 0.12);
      } else osc.frequency.setValueAtTime(f, at);
      if (s.vibrato) {
        const lfo = c.createOscillator();
        const depth = c.createGain();
        lfo.frequency.value = s.vibrato;
        depth.gain.value = f * 0.008;
        lfo.connect(depth).connect(osc.frequency);
        lfo.start(at + 0.15);
        lfo.stop(end + 0.05);
      }
      const peak = volume * gain;
      amp.gain.setValueAtTime(0, at);
      amp.gain.linearRampToValueAtTime(peak, at + s.attack);
      if (s.sustain) {
        amp.gain.setValueAtTime(peak * 0.85, at + Math.max(s.attack, length * 0.95));
        amp.gain.linearRampToValueAtTime(0.0001, end);
      } else amp.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(amp).connect(target);
      osc.start(at);
      osc.stop(end + 0.05);
    }
  }

  /** 흰 소리(바람, 파도, 박수, 함성의 바탕) */
  function noise(out, at, seconds, { filter = 800, type = 'lowpass', volume = 0.15, swell = 0 } = {}) {
    const c = ctx;
    const length = Math.floor(c.sampleRate * seconds);
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);
    // 같은 소리가 되도록 정해진 순서로 만든 흔들림(무작위 함수를 쓰지 않는다)
    let seed = 12345;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      data[i] = (seed / 1073741824 - 1) * 0.9;
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = filter;
    const amp = c.createGain();
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(volume, at + Math.min(0.6, seconds / 3));
    if (swell) {
      // 파도처럼 커졌다 작아졌다
      for (let t = 0.6; t < seconds; t += swell) {
        amp.gain.linearRampToValueAtTime(volume * 0.4, at + t);
        amp.gain.linearRampToValueAtTime(volume, at + t + swell / 2);
      }
    }
    amp.gain.linearRampToValueAtTime(0.0001, at + seconds);
    src.connect(f).connect(amp).connect(out);
    src.start(at);
    src.stop(at + seconds + 0.05);
  }

  /** 새소리: 짧게 올라가는 휘파람 */
  function chirp(out, at, base, volume = 0.08) {
    const c = ctx;
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base, at);
    osc.frequency.exponentialRampToValueAtTime(base * 1.6, at + 0.09);
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(volume, at + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    osc.connect(amp).connect(out);
    osc.start(at);
    osc.stop(at + 0.15);
  }

  /** 북: 낮게 쿵 */
  function drum(out, at, volume = 0.5) {
    const c = ctx;
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.25);
    amp.gain.setValueAtTime(volume, at);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    osc.connect(amp).connect(out);
    osc.start(at);
    osc.stop(at + 0.45);
  }

  /** 곁들이 소리 */
  function addExtra(out, kind, at, seconds, beat) {
    switch (kind) {
      case 'waves':
        noise(out, at, seconds + 0.8, { filter: 700, volume: 0.12, swell: 1.6 });
        break;
      case 'wind':
        noise(out, at, seconds + 0.5, { filter: 400, type: 'bandpass', volume: 0.1, swell: 2 });
        break;
      case 'ripples':
        for (let t = 0.3; t < seconds; t += 0.9) note(out, 'musicbox', hz(91), at + t, 0.2, 0.05);
        break;
      case 'gulls':
        for (const t of [0.4, 0.7, 2.1]) chirp(out, at + t, 1400, 0.06);
        noise(out, at, seconds + 0.6, { filter: 600, volume: 0.08, swell: 1.8 });
        break;
      case 'birds':
        for (const t of [0.2, 0.35, 1.3, 1.45, 2.6]) chirp(out, at + t, 2200 + (t * 300) % 600);
        break;
      case 'claps':
        for (let t = 0; t < seconds; t += beat * 2) noise(out, at + t + beat, 0.08, { filter: 2500, type: 'highpass', volume: 0.12 });
        break;
      case 'cheer':
        noise(out, at + seconds * 0.6, seconds * 0.6, { filter: 1200, type: 'bandpass', volume: 0.14 });
        break;
      case 'drum':
        for (let t = 0; t < seconds; t += beat * 2) drum(out, at + t, 0.45);
        break;
      case 'gong':
        note(out, 'bell', hz(43), at, 2.5, 0.25);
        break;
      case 'sparkle':
        for (let t = 0.1; t < seconds; t += 0.33) note(out, 'bell', hz(96 + ((t * 10) % 5)), at + t, 0.1, 0.03);
        break;
      default:
    }
  }

  /** 지금 곡을 살며시 줄여 끈다 */
  function stop() {
    if (!current || !ctx) return;
    const g = current;
    current = null;
    g.gain.cancelScheduledValues(ctx.currentTime);
    g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
    setTimeout(() => g.disconnect(), 800);
  }

  /**
   * 랜드마크 종류에 맞는 곡을 튼다.
   * @returns {number} 곡 길이(초). 소리를 낼 수 없으면 0
   */
  function play(kind) {
    const c = context();
    if (!c) return 0;
    wake();
    stop();
    const tune = TUNES[kind] ?? TUNES.park;
    const out = c.createGain();
    out.gain.value = 1;
    out.connect(master);
    current = out;
    const beat = 60 / tune.bpm;
    const start = c.currentTime + 0.05;
    let t = start;
    for (const [n, beats] of tune.notes) {
      if (n !== null) note(out, tune.voice, hz(tune.root + degree(tune.scale, n)), t, beats * beat, 0.22);
      t += beats * beat;
    }
    // 끝에 받쳐 주는 화음 한 번
    for (const semi of tune.chord) note(out, tune.voice === 'organ' || tune.voice === 'brass' ? 'pad' : tune.voice, hz(tune.root - 12 + semi), t - beat, beat * 2, 0.08);
    const seconds = t - start + beat;
    if (tune.extra) addExtra(out, tune.extra, start, seconds, beat);
    return seconds;
  }

  return { wake, play, stop };
}

/** 곡이 정해진 종류(테스트와 화면 설명에 쓴다) */
export const MUSIC_KINDS = Object.keys(TUNES);
