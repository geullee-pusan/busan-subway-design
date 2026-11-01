// 낱말 카드. 어려운 낱말 옆에 물음표 단추를 붙이고, 누르면 뜻을 보여준다.
import wordsFile from '../content/words.json';

const MEANINGS = new Map(wordsFile.words.map((w) => [w.word, w.meaning]));

/** 낱말과 물음표 단추를 담은 조각을 만든다. 낱말 카드가 없으면 글자만 돌려준다. */
export function wordWithCard(word, labelText = word) {
  const meaning = MEANINGS.get(word);
  const span = document.createElement('span');
  span.className = 'word-with-card';
  span.append(labelText);
  if (!meaning) return span;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word-button';
  button.textContent = '?';
  button.setAttribute('aria-label', `${word} 뜻 보기`);
  const card = document.createElement('span');
  card.className = 'word-card';
  card.hidden = true;
  card.textContent = `${word}: ${meaning}`;
  button.addEventListener('click', () => {
    card.hidden = !card.hidden;
  });
  span.append(button, card);
  return span;
}

/**
 * 글 한 줄에서 낱말 카드가 있는 낱말(처음 나오는 것 하나)에 물음표 단추를 붙인다.
 * 긴 낱말을 먼저 찾는다(예: "고분군"을 "고분"보다 먼저).
 */
export function textWithCards(text) {
  const box = document.createElement('span');
  const words = [...MEANINGS.keys()].filter((w) => w.length >= 2).sort((a, b) => b.length - a.length);
  let best = null;
  for (const word of words) {
    const at = text.indexOf(word);
    if (at >= 0 && (best === null || at < best.at)) best = { word, at };
  }
  if (!best) {
    box.append(text);
    return box;
  }
  box.append(text.slice(0, best.at), wordWithCard(best.word), text.slice(best.at + best.word.length));
  return box;
}
