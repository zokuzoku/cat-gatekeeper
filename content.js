const CAT_VIDEO_URL = chrome.runtime.getURL('assets/neko1.webm');
const CAT_SLEEP_URL = chrome.runtime.getURL('assets/neko2.webm');

// 事前読み込み
const preloadVideo = document.createElement('video');
preloadVideo.src = CAT_VIDEO_URL;
preloadVideo.preload = 'auto';
preloadVideo.muted = true;

const preloadSleep = document.createElement('video');
preloadSleep.src = CAT_SLEEP_URL;
preloadSleep.preload = 'auto';
preloadSleep.muted = true;

const preventScroll = (e) => e.preventDefault();

const SITE_MAP = {
  'twitter.com': 'x',
  'x.com': 'x',
  'instagram.com': 'instagram',
  'tiktok.com': 'tiktok',
  'youtube.com': 'youtube',
};

const hostname = location.hostname;
const siteKey = Object.entries(SITE_MAP).find(([d]) => hostname.includes(d))?.[1];

if (siteKey) {
  chrome.storage.local.get({
    sns: { x: true, instagram: true, tiktok: true, youtube: true },
    usageLimit: 60,
    breakTime: 5,
  }, (settings) => {
    if (!settings.sns[siteKey]) return;
    startTracking(settings.usageLimit, settings.breakTime);
  });
}

// ポップアップからの閉じる指示を受け取る
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'DISMISS_CAT') {
    const overlay = document.getElementById('cat-gatekeeper-overlay');
    if (!overlay) return;
    overlay.style.transition = 'opacity 0.5s';
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
      document.documentElement.style.overflow = '';
      document.removeEventListener('wheel', preventScroll);
      document.removeEventListener('touchmove', preventScroll);
    }, 500);
  }
});

function startTracking(usageLimit, breakTime) {
  let localSeconds = 0;
  chrome.storage.local.set({ catActive: false });

  const tracker = setInterval(() => {
    if (document.hidden || !document.hasFocus()) return;
    localSeconds++;

    if (localSeconds >= usageLimit * 60) {
      clearInterval(tracker);
      chrome.storage.local.set({ catActive: true });
      showCat(breakTime, usageLimit, () => startTracking(usageLimit, breakTime));
    }
  }, 1000);

  // 別のタブ・アプリに切り替えたらリセット
  const resetOnBlur = () => { localSeconds = 0; };
  window.addEventListener('blur', resetOnBlur);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) localSeconds = 0;
  });
}

function showCat(breakMinutes, usageLimit, onBreakEnd) {
  const overlay = document.createElement('div');
  overlay.id = 'cat-gatekeeper-overlay';

  // カウントダウン
  const countdown = document.createElement('div');
  countdown.id = 'cat-gatekeeper-countdown';
  let seconds = breakMinutes * 60;

  function updateCountdown() {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    countdown.textContent = `${m}:${String(s).padStart(2, '0')}`;
    if (seconds > 0) {
      seconds--;
      setTimeout(updateCountdown, 1000);
    } else {
      chrome.storage.local.set({ catActive: false });
      overlay.style.transition = 'opacity 1s';
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        document.documentElement.style.overflow = '';
        document.removeEventListener('wheel', preventScroll);
        document.removeEventListener('touchmove', preventScroll);
        onBreakEnd();
      }, 1000);
    }
  }
  updateCountdown();

  // neko1
  const video = document.createElement('video');
  video.src = CAT_VIDEO_URL;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;

  // neko2（先読み・非表示）
  const videoSleep = document.createElement('video');
  videoSleep.src = CAT_SLEEP_URL;
  videoSleep.muted = true;
  videoSleep.playsInline = true;
  videoSleep.loop = true;
  videoSleep.style.display = 'none';

  overlay.appendChild(countdown);
  overlay.appendChild(video);
  overlay.appendChild(videoSleep);
  document.body.appendChild(overlay);
  document.documentElement.style.overflow = 'hidden';
  document.addEventListener('wheel', preventScroll, { passive: false });
  document.addEventListener('touchmove', preventScroll, { passive: false });

  // ページ上の動画を一時停止（猫の動画は除く）
  document.querySelectorAll('video').forEach(v => {
    if (v !== video && v !== videoSleep) v.pause();
  });

  // neko1が終わったらneko2に切り替え
  video.addEventListener('ended', () => {
    video.style.display = 'none';
    videoSleep.style.display = 'block';
    videoSleep.classList.add('sleeping');
    videoSleep.play();
  });
}
