// 환승역·종착역 가락(src/content/melodies.json)을 소리 차례와 MIDI 파일로 바꾼다. 순수 함수만 둔다.

/** MIDI 음 번호 → 주파수(Hz). 69 = 라(440Hz) */
export function midiToHz(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

/**
 * 가락을 소리 차례로 편다. 여러 줄(가락, 받침)을 같은 시각에 시작한다.
 * @param {{beatSeconds: number, tracks: [number|null, number][][]}} melody
 * @returns {{notes: {midi: number, start: number, length: number}[], seconds: number}}
 */
export function melodyNotes(melody) {
  const notes = [];
  let seconds = 0;
  for (const track of melody.tracks) {
    let t = 0;
    for (const [midi, beats] of track) {
      const length = beats * melody.beatSeconds;
      if (midi !== null) notes.push({ midi, start: t, length });
      t += length;
    }
    seconds = Math.max(seconds, t);
  }
  notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
  return { notes, seconds };
}

/** 가변 길이 수(MIDI 파일 형식) */
function varLength(value) {
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes;
}

/**
 * 표준 MIDI 파일(형식 0, 한 트랙)을 만든다. 한 박은 8분음표로 적는다.
 * @param {{beatSeconds: number, program?: number, tracks: [number|null, number][][]}} melody
 * @returns {Uint8Array}
 */
export function midiFile(melody) {
  const division = 480; // 4분음표 한 개의 틱
  const beatTicks = division / 2; // 한 박 = 8분음표
  const tempo = Math.round(melody.beatSeconds * 2 * 1e6); // 4분음표 한 개의 마이크로초
  const events = [];
  for (const [channel, track] of melody.tracks.entries()) {
    let tick = 0;
    for (const [midi, beats] of track) {
      const length = beats * beatTicks;
      if (midi !== null) {
        events.push({ tick, order: 1, bytes: [0x90 | channel, midi, channel === 0 ? 96 : 64] });
        events.push({ tick: tick + length, order: 0, bytes: [0x80 | channel, midi, 0] });
      }
      tick += length;
    }
  }
  // 같은 시각이면 끄기를 먼저(order 0) 한다.
  events.sort((a, b) => a.tick - b.tick || a.order - b.order || a.bytes[0] - b.bytes[0] || a.bytes[1] - b.bytes[1]);

  const body = [
    0x00, 0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff,
  ];
  for (const [channel] of melody.tracks.entries()) body.push(0x00, 0xc0 | channel, melody.program ?? 0);
  let last = 0;
  for (const event of events) {
    body.push(...varLength(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  body.push(0x00, 0xff, 0x2f, 0x00);

  const text = (s) => [...s].map((c) => c.charCodeAt(0));
  const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  const header = [...text('MThd'), ...u32(6), 0x00, 0x00, 0x00, 0x01, (division >> 8) & 0xff, division & 0xff];
  return Uint8Array.from([...header, ...text('MTrk'), ...u32(body.length), ...body]);
}
