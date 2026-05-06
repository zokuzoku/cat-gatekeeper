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
const USAGE_STORAGE_KEY = 'catGatekeeperUsage';
const BREAK_STORAGE_KEY = 'catGatekeeperBreak';
const USAGE_STALE_AFTER_MS = 30 * 60 * 1000;
const USAGE_SAVE_INTERVAL_SECONDS = 5;

function applySettings(settings, { resetUsage = false } = {}) {
  const merged = shared.normalizeSettings(settings);
  currentCategories = merged.categories;

  const newCategory = shared.getCategoryForHostname(hostname, currentCategories);

  if (!newCategory) {
    currentCategory = null;
    currentUsageKey = '';
    stopTracker();
    return;
  }

  const matchedDomain = newCategory.domains.find((d) => shared.hostnameMatchesDomain(hostname, d));
  const newUsageKey = shared.normalizeDomainEntry(matchedDomain || hostname);

  currentCategory = newCategory;
  currentUsageKey = newUsageKey;

  if (!catIsActive) {
    startTracking(newCategory.usageLimit, newCategory.breakTime, { resetUsage });
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
      isTracked: !!currentCategory,
      trackedDomain: currentUsageKey,
      currentCategory,
      hasFocus: document.hasFocus(),
      isHidden: document.hidden,
    });
    return;
  }

  if (message.type === 'UPDATE_SETTINGS') {
    stopTracker();
    applySettings(message.settings, { resetUsage: true });
  }

  if (message.type === 'DISMISS_CAT') {
    const overlay = document.getElementById('cat-gatekeeper-overlay');
    if (!overlay) return;
    const dismissedUsageKey = currentUsageKey;
    catIsActive = false;
    stopCountdown();
    resetUsageSeconds(dismissedUsageKey);
    clearBreakUntil(dismissedUsageKey);
    overlay.style.transition = 'opacity 0.5s';
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
      document.documentElement.style.overflow = '';
      document.removeEventListener('wheel', preventScroll);
      document.removeEventListener('touchmove', preventScroll);
      if (currentCategory && dismissedUsageKey === currentUsageKey) {
        startTracking(currentCategory.usageLimit, currentCategory.breakTime);
      }
    }, 500);
  }
});

let resetSeconds = () => {};
let stopTracker = () => {};
let stopCountdown = () => {};
let currentCategories = [];
let currentCategory = null;
let currentUsageKey = '';
let catAssetsPrepared = false;
let trackerRunId = 0;

function getUsageStorageKey(usageKey) {
  return `${USAGE_STORAGE_KEY}:${usageKey}`;
}

function getBreakStorageKey(usageKey) {
  return `${BREAK_STORAGE_KEY}:${usageKey}`;
}

function saveUsageSeconds(usageKey, seconds) {
  if (!usageKey) return;
  chrome.storage.local.set({
    [getUsageStorageKey(usageKey)]: {
      seconds: Math.max(0, seconds),
      updatedAt: Date.now(),
    },
  });
}

function resetUsageSeconds(usageKey) {
  saveUsageSeconds(usageKey, 0);
}

function saveBreakUntil(usageKey, breakUntil) {
  if (!usageKey) return;
  chrome.storage.local.set({ [getBreakStorageKey(usageKey)]: breakUntil });
}

function clearBreakUntil(usageKey) {
  if (!usageKey) return;
  chrome.storage.local.remove(getBreakStorageKey(usageKey));
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) resetSeconds({ clearStoredUsage: true });
});

window.addEventListener('pagehide', () => {
  resetSeconds();
});

function startTracking(usageLimit, breakTime, { resetUsage = false } = {}) {
  prepareCatAssets();
  stopTracker();
  const runId = ++trackerRunId;
  const usageKey = currentUsageKey;

  if (resetUsage) {
    resetUsageSeconds(usageKey);
    clearBreakUntil(usageKey);
  }

  const usageStorageKey = getUsageStorageKey(usageKey);
  const breakStorageKey = getBreakStorageKey(usageKey);

  chrome.storage.local.get({ [usageStorageKey]: null, [breakStorageKey]: 0 }, (result) => {
    if (runId !== trackerRunId || usageKey !== currentUsageKey || catIsActive || !currentCategory) {
      return;
    }

    // If a break is still active (e.g. tab was duplicated during a break), resume it
    const breakUntil = Number(result[breakStorageKey]) || 0;
    const remainingMs = breakUntil - Date.now();
    if (remainingMs > 0) {
      catIsActive = true;
      showCat(Math.ceil(remainingMs / 1000), usageKey, () => {
        if (currentCategory && usageKey === currentUsageKey) {
          startTracking(currentCategory.usageLimit, currentCategory.breakTime);
        }
      });
      return;
    }

    if (breakUntil > 0) clearBreakUntil(usageKey); // stale entry, clean up

    // Normal usage tracking
    const entry = result[usageStorageKey];
    const now = Date.now();
    let initialSeconds = 0;
    if (entry && typeof entry === 'object' && now - Number(entry.updatedAt || 0) <= USAGE_STALE_AFTER_MS) {
      initialSeconds = Math.max(0, Number.parseInt(entry.seconds, 10) || 0);
    }

    trackerRunning = true;
    let localSeconds = resetUsage ? 0 : initialSeconds;
    let secondsSinceSave = 0;
    let shouldPersistUsage = true;

    resetSeconds = ({ clearStoredUsage = false } = {}) => {
      if (clearStoredUsage) {
        shouldPersistUsage = false;
        localSeconds = 0;
        resetUsageSeconds(usageKey);
        return;
      }
      saveUsageSeconds(usageKey, localSeconds);
    };

    const tracker = setInterval(() => {
      if (usageKey !== currentUsageKey || catIsActive || !currentCategory) {
        clearInterval(tracker);
        trackerRunning = false;
        return;
      }

      if (document.hidden || !document.hasFocus()) return;

      localSeconds++;
      secondsSinceSave++;

      if (secondsSinceSave >= USAGE_SAVE_INTERVAL_SECONDS) {
        saveUsageSeconds(usageKey, localSeconds);
        secondsSinceSave = 0;
      }

      if (localSeconds >= usageLimit * 60) {
        clearInterval(tracker);
        trackerRunning = false;
        catIsActive = true;
        shouldPersistUsage = false;
        localSeconds = 0;
        resetUsageSeconds(usageKey);
        saveBreakUntil(usageKey, Date.now() + breakTime * 60 * 1000);
        showCat(breakTime * 60, usageKey, () => {
          if (currentCategory && usageKey === currentUsageKey) {
            startTracking(currentCategory.usageLimit, currentCategory.breakTime);
          }
        });
      }
    }, 1000);

    stopTracker = () => {
      trackerRunning = false;
      if (shouldPersistUsage) {
        saveUsageSeconds(usageKey, localSeconds);
      }
      clearInterval(tracker);
      trackerRunId++;
    };
  });
}

function prepareCatAssets() {
  if (catAssetsPrepared) return;

  preloadVideo.src = chrome.runtime.getURL('assets/neko1.webm');
  preloadSleep.src = chrome.runtime.getURL('assets/neko2.webm');
  preloadVideo.load();
  preloadSleep.load();
  catAssetsPrepared = true;
}

chrome.storage.local.get(
  { categories: null, customDomains: null, usageLimit: shared.LEGACY_DEFAULTS.usageLimit, breakTime: shared.LEGACY_DEFAULTS.breakTime },
  (settings) => applySettings(settings)
);

function showCat(breakSeconds, usageKey, onBreakEnd) {
  document.getElementById('cat-gatekeeper-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'cat-gatekeeper-overlay';
  overlay.style.setProperty('opacity', '1', 'important');
  overlay.style.transition = '';

  // カウントダウン
  const countdown = document.createElement('div');
  countdown.id = 'cat-gatekeeper-countdown';
  let seconds = breakSeconds;

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
      clearBreakUntil(usageKey);
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
  video.style.opacity = '1';

  // neko2（先読み・非表示）
  const videoSleep = document.createElement('video');
  videoSleep.src = chrome.runtime.getURL('assets/neko2.webm');
  videoSleep.muted = true;
  videoSleep.playsInline = true;
  videoSleep.loop = true;
  videoSleep.style.display = 'none';
  videoSleep.style.opacity = '1';

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
