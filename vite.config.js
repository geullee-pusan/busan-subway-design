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

// 게임은 dist/index.html 한 파일이다. 스크립트와 스타일을 모두 안에 넣는다.
// 곁들이 파일(manifest, sw.js, 아이콘)은 public/에서 그대로 복사된다. 홈 화면 설치에 필요하다.
export default defineConfig({
  // 상대 주소로 뽑는다. 하위 폴더 주소(GitHub Pages)에서도 열린다.
  base: './',
  plugins: [stripThreeLinks(), viteSingleFile()],
  // 받은 원본(data/raw/)은 게임이 읽지 않는다. 큰 파일이 많고, 막 복사한 파일을 지켜보다 개발 서버가 멈춘 적이 있다.
  server: { watch: { ignored: ['**/data/raw/**'] } },
  build: {
    // 모듈 미리 읽기 보조 코드(fetch를 쓴다)를 넣지 않는다. 한 파일이라 필요 없다.
    modulePreload: { polyfill: false },
  },
});
