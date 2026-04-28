const shared = globalThis.CatGatekeeperShared;

// 事前読み込み
const preloadVideo = document.createElement('video');
preloadVideo.preload = 'auto';
preloadVideo.muted = true;

const preloadSleep = document.createElement('video');
preloadSleep.preload = 'auto';
preloadSleep.muted = true;

const preventScroll = (e) => e.preventDefault();

const hostname = location.hostname;

function mergeSettingsWithDefaults(settings) {
  return shared.normalizeSettings(settings);
}

function isSiteEnabled(settings) {
  return shared.isCustomDomain(hostname, settings.customDomains);
}

function applySettings(settings) {
  const mergedSettings = mergeSettingsWithDefaults(settings);
  currentUsageLimit = mergedSettings.usageLimit;
  currentBreakTime = mergedSettings.breakTime;
  currentCustomDomains = mergedSettings.customDomains;
  currentSnsEnabled = isSiteEnabled(mergedSettings);

  if (!currentSnsEnabled) {
    stopTracker();
    return;
  }

  if (!catIsActive) {
    startTracking(currentUsageLimit, currentBreakTime);
  }
}

let catIsActive = false;
let trackerRunning = false;

// ポップアップからのメッセージを受け取る
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_CAT_STATUS') {
    sendResponse({
      catIsActive,
      hostname,
      trackerRunning,
      customDomains: currentCustomDomains,
      isTracked: currentSnsEnabled,
      hasFocus: document.hasFocus(),
      isHidden: document.hidden,
    });
    return;
  }

  if (message.type === 'UPDATE_SETTINGS') {
    applySettings(message.settings);
  }

  if (message.type === 'DISMISS_CAT') {
    const overlay = document.getElementById('cat-gatekeeper-overlay');
    if (!overlay) return;
    catIsActive = false;
    stopCountdown();
    overlay.style.transition = 'opacity 0.5s';
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
      document.documentElement.style.overflow = '';
      document.removeEventListener('wheel', preventScroll);
      document.removeEventListener('touchmove', preventScroll);
      if (currentSnsEnabled) startTracking(currentUsageLimit, currentBreakTime);
    }, 500);
  }
});

let resetSeconds = () => {};
let stopTracker = () => {};
let stopCountdown = () => {};
let currentUsageLimit = 60;
let currentBreakTime = 5;
let currentSnsEnabled = false;
let currentCustomDomains = [];
let catAssetsPrepared = false;

// タブを切り替えたらリセット（一度だけ登録）
document.addEventListener('visibilitychange', () => {
  if (document.hidden) resetSeconds();
});

function startTracking(usageLimit, breakTime) {
  prepareCatAssets();
  stopTracker();
  currentUsageLimit = usageLimit;
  currentBreakTime = breakTime;
  trackerRunning = true;
  let localSeconds = 0;

  resetSeconds = () => { localSeconds = 0; };

  const tracker = setInterval(() => {
    if (document.hidden || !document.hasFocus()) return;
    localSeconds++;

    if (localSeconds >= usageLimit * 60) {
      clearInterval(tracker);
      trackerRunning = false;
      catIsActive = true;
      showCat(breakTime, usageLimit, () => {
        if (currentSnsEnabled) startTracking(currentUsageLimit, currentBreakTime);
      });
    }
  }, 1000);

  stopTracker = () => {
    trackerRunning = false;
    clearInterval(tracker);
  };
}

function prepareCatAssets() {
  if (catAssetsPrepared) return;

  preloadVideo.src = chrome.runtime.getURL('assets/neko1.webm');
  preloadSleep.src = chrome.runtime.getURL('assets/neko2.webm');
  catAssetsPrepared = true;
}

chrome.storage.local.get(shared.DEFAULT_SETTINGS, (settings) => {
  applySettings(settings);
});

function showCat(breakMinutes, usageLimit, onBreakEnd) {
  const overlay = document.createElement('div');
  overlay.id = 'cat-gatekeeper-overlay';

  // カウントダウン
  const countdown = document.createElement('div');
  countdown.id = 'cat-gatekeeper-countdown';
  let seconds = breakMinutes * 60;

  let countdownCancelled = false;
  stopCountdown = () => { countdownCancelled = true; };

  function updateCountdown() {
    if (countdownCancelled) return;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    countdown.textContent = `${m}:${String(s).padStart(2, '0')}`;
    if (seconds > 0) {
      seconds--;
      setTimeout(updateCountdown, 1000);
    } else {
      catIsActive = false;
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
  video.src = chrome.runtime.getURL('assets/neko1.webm');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;

  // neko2（先読み・非表示）
  const videoSleep = document.createElement('video');
  videoSleep.src = chrome.runtime.getURL('assets/neko2.webm');
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
