// 홈 화면에 설치하기(docs/SPEC.md 11장, 12장 Phase 7).
//
// 서비스 워커는 https 주소나 localhost에서만 돈다. 파일을 그냥 열었을 때(file://)는 건너뛴다.
// 등록에 실패해도 게임은 그대로 돌아간다. 알림이나 사용 추적은 쓰지 않는다(CLAUDE.md).

/** 브라우저가 "깔 수 있어요"라고 알려 줄 때 받아 두는 것. 부모 화면에서 쓴다. */
let installPrompt = null;
const watchers = new Set();

function tell() {
  for (const watcher of watchers) watcher(canInstall());
}

export function canInstall() {
  return installPrompt !== null;
}

/** 설치할 수 있게 되면 알려 준다. 정리 함수를 돌려준다. */
export function onInstallReady(watcher) {
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}

/** 브라우저의 설치 창을 띄운다. 사람이 단추를 눌렀을 때만 부른다. */
export async function install() {
  if (!installPrompt) return false;
  const prompt = installPrompt;
  installPrompt = null;
  tell();
  try {
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    return outcome === 'accepted';
  } catch {
    return false;
  }
}

/** 이미 홈 화면 앱으로 열렸는가 */
export function isInstalled() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch {
    return false;
  }
}

/** 어떻게 설치하는지 아이 말로 알려 준다. */
export function installHint() {
  if (isInstalled()) return '이미 홈 화면 앱으로 열었어요.';
  if (!window.isSecureContext) {
    return '홈 화면에 깔려면 https 주소로 열어야 해요. 지금은 파일을 그냥 연 것이라 깔 수 없어요.';
  }
  if (canInstall()) return '아래 단추를 누르면 홈 화면에 깔 수 있어요.';
  const agent = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(agent)) {
    return '사파리 아래쪽 공유 단추를 누르고 "홈 화면에 추가"를 고르세요.';
  }
  return '크롬 오른쪽 위 점 세 개를 누르고 "앱 설치"를 고르세요.';
}

/** 앱이 시작할 때 한 번 부른다. */
export function setupInstall() {
  try {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      installPrompt = event;
      tell();
    });
    window.addEventListener('appinstalled', () => {
      installPrompt = null;
      tell();
    });
  } catch {
    // 이 브라우저는 설치를 지원하지 않아요. 게임은 그대로 돼요.
  }

  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      // 서비스 워커를 못 깔아도 게임은 그대로 돼요. 인터넷 없이 쓰기만 안 될 뿐이에요.
    });
  });
}
