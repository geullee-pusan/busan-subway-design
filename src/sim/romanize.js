// 한글 역 이름을 로마자로 바꾼다(국어의 로마자 표기법, 문화체육관광부 고시 제2014-42호의 기본 규칙). 순수 함수만 둔다.
// 새로 만든 역에는 공식 영어 이름이 없어서, 영어 방송과 역명판에 이 함수로 만든 이름을 쓴다.
// 이미 있는 역은 부산교통공사 자료의 영어 이름(nameEn)을 쓴다.
//
// 지키는 소리 규칙: 받침 대표음, 연음(받침 + ㅇ), 비음화(ㄱ·ㄷ·ㅂ + ㄴ·ㅁ), 유음화(ㄴ+ㄹ, ㄹ+ㄴ → ll),
// ㄹ 앞 비음화(ㅁ·ㅇ + ㄹ → n), ㅎ 받침 + ㄱ·ㄷ·ㅈ 거센소리.
// 된소리되기는 적지 않고, 이름(체언)이라 ㄱ·ㄷ·ㅂ 뒤의 ㅎ은 밝혀 적는다(묵호 Mukho). 표기법 규정대로다.

const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const VOWELS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
// 받침 번호(0 = 없음) → [대표음 받침, 뒤 음절로 넘어갈 때의 첫소리 번호(연음), 연음 뒤 남는 받침]
// 첫소리 번호: INITIALS 차례. -1 = 넘어가지 않는다.
const FINALS = [
  ['', -1, ''], // 없음
  ['k', 0, ''], // ㄱ
  ['k', 1, ''], // ㄲ
  ['k', 9, 'k'], // ㄳ
  ['n', 2, ''], // ㄴ
  ['n', 12, 'n'], // ㄵ
  ['n', 18, 'n'], // ㄶ
  ['t', 3, ''], // ㄷ
  ['l', 5, ''], // ㄹ
  ['k', 0, 'l'], // ㄺ
  ['m', 6, 'l'], // ㄻ
  ['l', 7, 'l'], // ㄼ
  ['l', 9, 'l'], // ㄽ
  ['l', 16, 'l'], // ㄾ
  ['p', 17, 'l'], // ㄿ
  ['l', 18, 'l'], // ㅀ
  ['m', 6, ''], // ㅁ
  ['p', 7, ''], // ㅂ
  ['p', 9, 'p'], // ㅄ
  ['t', 9, ''], // ㅅ
  ['t', 10, ''], // ㅆ
  ['ng', -1, 'ng'], // ㅇ
  ['t', 12, ''], // ㅈ
  ['t', 14, ''], // ㅊ
  ['k', 15, ''], // ㅋ
  ['t', 16, ''], // ㅌ
  ['p', 17, ''], // ㅍ
  ['t', 18, ''], // ㅎ
];

const IEUNG = 11; // 첫소리 ㅇ
const NIEUN = 2;
const RIEUL = 5;
const MIEUM = 6;
const HIEUT = 18;

/** 한 글자 → {initial, vowel, final} 번호. 한글 음절이 아니면 null */
function split(char) {
  const code = char.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return { initial: Math.floor(code / 588), vowel: Math.floor((code % 588) / 28), final: code % 28 };
}

/** 한 낱말(띄어쓰기 없는 한글 덩어리)을 로마자로 */
function romanizeWord(word) {
  const syllables = [...word].map(split);
  let out = '';
  for (let i = 0; i < syllables.length; i++) {
    const s = syllables[i];
    if (!s) {
      out += word[i];
      continue;
    }
    // 첫소리(앞 음절 받침이 넘어왔거나 바뀌었으면 그것을 쓴다)
    let initial = INITIALS[s.initial];
    if (s.carry !== undefined) initial = s.carry;
    else if (i === 0 && s.initial === RIEUL) initial = 'r';
    out += initial + VOWELS[s.vowel];

    // 받침과 뒤 음절의 만남
    const next = syllables[i + 1];
    const [plain, moveTo, rest] = FINALS[s.final];
    if (!next || s.final === 0) {
      out += plain;
      continue;
    }
    if (next.initial === IEUNG && moveTo >= 0) {
      // 연음: 받침이 뒤 음절 첫소리로 간다. ㅎ 받침은 사라진다.
      out += rest;
      next.carry = moveTo === HIEUT ? '' : INITIALS[moveTo];
      continue;
    }
    if (s.final === 27 || s.final === 6 || s.final === 15) {
      // ㅎ 받침 + ㄱ·ㄷ·ㅈ → k·t·ch
      const aspirate = { 0: 'k', 3: 't', 12: 'ch' }[next.initial];
      if (aspirate) {
        out += rest === 'n' || rest === 'l' ? rest : '';
        next.carry = aspirate;
        continue;
      }
    }
    if (next.initial === NIEUN || next.initial === MIEUM) {
      // 비음화: ㄱ→ng, ㄷ→n, ㅂ→m. ㄹ 받침 + ㄴ → ll
      if (plain === 'k') out += 'ng';
      else if (plain === 't') out += 'n';
      else if (plain === 'p') out += 'm';
      else if (plain === 'l' && next.initial === NIEUN) {
        out += 'l';
        next.carry = 'l';
      } else out += plain;
      continue;
    }
    if (next.initial === RIEUL) {
      if (plain === 'n' || plain === 'l') {
        // 유음화: ㄴ·ㄹ + ㄹ → ll
        out += 'l';
        next.carry = 'l';
      } else if (plain === 'm' || plain === 'ng') {
        out += plain;
        next.carry = 'n';
      } else {
        // ㄱ·ㄷ·ㅂ + ㄹ → ㅇ·ㄴ·ㅁ + ㄴ
        out += { k: 'ng', t: 'n', p: 'm' }[plain] ?? plain;
        next.carry = 'n';
      }
      continue;
    }
    out += plain;
  }
  return out;
}

/**
 * 한글 이름 → 로마자. 첫 글자는 대문자로 쓴다. 한글이 아닌 글자(숫자, 영문)는 그대로 둔다.
 * 띄어 쓴 이름은 낱말마다 바꾸고 낱말마다 첫 글자를 대문자로 쓴다.
 * @example romanize('서면') === 'Seomyeon'; romanize('신라') === 'Silla'
 */
export function romanize(name) {
  return String(name)
    .trim()
    .split(/\s+/)
    .map((word) => {
      const text = romanizeWord(word);
      return text.charAt(0).toUpperCase() + text.slice(1);
    })
    .join(' ');
}

/**
 * 새 노선의 영어 이름. 기본 이름("새 노선", "새 노선 2")이면 New Line, New Line 2,
 * 직접 지은 이름이면 로마자에 Line을 붙인다. 끝의 "선"은 Line과 겹치니 뗀다("낙동강선" → "Nakdonggang Line").
 * @param {string} name 새 노선 이름
 */
export function lineNameEnglish(name) {
  const text = String(name ?? '').trim();
  const plain = /^새\s*노선(?:\s*(\d+))?$/.exec(text);
  if (plain) return plain[1] ? `New Line ${plain[1]}` : 'New Line';
  const base = text.length > 1 && text.endsWith('선') ? text.slice(0, -1) : text;
  const roman = romanize(base);
  return /line$/i.test(roman) ? roman : `${roman} Line`;
}
