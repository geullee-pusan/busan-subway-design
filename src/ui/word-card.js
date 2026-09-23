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
