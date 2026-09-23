// 서비스 워커: 홈 화면에 설치하고 인터넷 없이 쓰기 위한 것이다(docs/SPEC.md 11장).
//
// 규칙(CLAUDE.md): 바깥 주소를 부르지 않는다. 사용 추적도 하지 않는다.
// 깔 때 우리 파일을 한 번 받아 두고, 그다음부터 캐시에서만 꺼낸다. fetch를 쓰지 않는다.
// 새 판이 나오면 이 파일의 VERSION이 바뀌고, 브라우저가 이 파일을 다시 읽어 새로 깔아 준다.

const VERSION = '__VERSION__';
const CACHE = `busan-subway-design-${VERSION}`;

/** 깔 때 받아 두는 파일. 게임은 index.html 한 파일에 다 들어 있다. */
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
];

/** 받아 둔 파일의 경로. 하위 폴더 주소(GitHub Pages)에서도 맞도록 이 워커의 자리를 기준으로 푼다. */
const OUR_PATHS = new Set(FILES.map((file) => new URL(file, self.location.href).pathname));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // 같은 곳의 파일만 다룬다. 바깥 주소는 건드리지 않는다(쓸 일도 없다).
  if (url.origin !== self.location.origin) return;

  // 페이지를 여는 요청과 우리가 받아 둔 파일만 캐시에서 꺼낸다.
  // 그 밖의 요청은 가로채지 않는다. 다른 파일에 index.html을 돌려주면 안 되기 때문이다.
  const isPage = request.mode === 'navigate';
  if (!isPage && !OUR_PATHS.has(url.pathname)) return;

  event.respondWith(
    caches
      .match(request, { ignoreSearch: true })
      .then((hit) => hit ?? (isPage ? caches.match('./index.html') : undefined))
      .then(
        (hit) =>
          hit ??
          new Response('찾는 것이 없어요', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }),
      ),
  );
});
