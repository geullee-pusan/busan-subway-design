import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * three.js 셰이더 글 안의 설명용 주소(논문 주소 등)를 지운다. 부르는 주소가 아니라 글자일 뿐이지만,
 * 배포물에는 바깥 주소를 두지 않는다(scripts/check-dist.mjs). XML 이름공간 주소(w3.org)는 코드가 쓰므로 둔다.
 */
function stripThreeLinks() {
  return {
    name: 'strip-three-links',
    transform(code, id) {
      if (!/[\\/]node_modules[\\/]three[\\/]/.test(id)) return null;
      const out = code.replace(/https?:\/\/(?!www\.w3\.org\/)[^\s"'`)<>\\]+/g, '');
      return out === code ? null : { code: out, map: null };
    },
  };
}

/**
 * 로딩 화면: 게임 스크립트(수십 MB)는 <head> 안에 들어가서, 다 받기 전에는 화면이 비어 있다.
 * 그래서 가벼운 로딩 화면(글자와 CSS 움직임만, 스크립트 없음)을 <head> 맨 앞에 넣어 먼저 그려지게 한다.
 * 게임이 첫 화면을 그리면 src/main.js가 이 화면을 치운다.
 */
const LOADING = `<style id="boot-style">
#boot{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#1F3342;color:#fff;font-family:system-ui,-apple-system,"Malgun Gothic","Apple SD Gothic Neo",sans-serif}
#boot h1{margin:0;font-size:clamp(26px,5vw,40px);font-weight:800}
#boot p{margin:0;font-size:clamp(17px,3vw,22px);font-weight:700}
#boot .track{position:relative;width:min(80vw,420px);height:46px;border-bottom:6px solid #9aa5ae}
#boot .car{position:absolute;bottom:4px;left:0;width:96px;height:34px;border-radius:10px 16px 4px 4px;background:#F7941D;animation:boot-run 2.4s linear infinite}
#boot .car::before{content:"";position:absolute;top:7px;left:12px;width:58px;height:11px;border-radius:3px;background:#1F3342;box-shadow:0 0 0 2px #fff6}
#boot .car::after{content:"";position:absolute;bottom:-6px;left:14px;width:12px;height:12px;border-radius:50%;background:#2b2f33;box-shadow:54px 0 0 #2b2f33}
@keyframes boot-run{from{left:-100px}to{left:100%}}
@media (prefers-reduced-motion:reduce){#boot .car{animation:none;left:calc(50% - 48px)}}
</style>
<div id="boot" role="status" aria-live="polite"><h1>부산 도시철도 설계실</h1><div class="track" aria-hidden="true"><div class="car"></div></div><p>게임을 불러오고 있어요.</p><p style="font-weight:400;font-size:16px">처음에는 조금 오래 걸려요.</p></div>`;
function bootScreen() {
  return {
    name: 'boot-screen',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => html.replace('<head>', `<head>
${LOADING}`),
    },
  };
}

// 게임은 dist/index.html 한 파일이다. 스크립트와 스타일을 모두 안에 넣는다.
// 곁들이 파일(manifest, sw.js, 아이콘)은 public/에서 그대로 복사된다. 홈 화면 설치에 필요하다.
export default defineConfig({
  // 상대 주소로 뽑는다. 하위 폴더 주소(GitHub Pages)에서도 열린다.
  base: './',
  plugins: [stripThreeLinks(), viteSingleFile(), bootScreen()],
  // 받은 원본(data/raw/)은 게임이 읽지 않는다. 큰 파일이 많고, 막 복사한 파일을 지켜보다 개발 서버가 멈춘 적이 있다.
  server: { watch: { ignored: ['**/data/raw/**'] } },
  build: {
    // 모듈 미리 읽기 보조 코드(fetch를 쓴다)를 넣지 않는다. 한 파일이라 필요 없다.
    modulePreload: { polyfill: false },
  },
});
