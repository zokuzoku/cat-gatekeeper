const shared = globalThis.CatGatekeeperShared;

const CAT_VIDEO_SETS = [
  {
    entry: 'assets/neko1.webm',
    sleep: 'assets/neko2.webm',
    countdown: {
      top: '20vh',
      left: '35%',
      zIndex: '0',
    },
  },
];

const preventScroll = (e) => e.preventDefault();

const SHADOW_HOST_ID = 'cat-gk-host';
const OVERLAY_ID = 'cat-gatekeeper-overlay';

const hostname = location.hostname;
const USAGE_STORAGE_KEY = 'catGatekeeperUsage';
const USAGE_STALE_AFTER_MS = 30 * 60 * 1000;
const USAGE_SAVE_INTERVAL_SECONDS = 5;
const SETTINGS_STORAGE_KEYS = new Set([
  'catEnabled',
  'usageLimit',
  'breakTime',
  'customDomains',
  'sns',
]);

function mergeSettingsWithDefaults(settings) {
  return shared.normalizeSettings(settings);
}

function getMatchedDomain(settings) {
  return shared.normalizeDomainList(settings.customDomains).find((domain) =>
    shared.hostnameMatchesDomain(hostname, domain)
  ) || '';
}

function isSiteEnabled(settings) {
  return !!getMatchedDomain(settings);
}

function applySettings(settings, { resetUsage = false } = {}) {
  const mergedSettings = mergeSettingsWithDefaults(settings);
  currentUsageLimit = mergedSettings.usageLimit;
  currentBreakTime = mergedSettings.breakTime;
  currentCustomDomains = mergedSettings.customDomains;
  currentUsageKey = getMatchedDomain(mergedSettings);
  currentSnsEnabled = mergedSettings.catEnabled && !!currentUsageKey;

  if (!currentSnsEnabled) {
    stopTracker();
    return;
  }

  if (!catIsActive) {
    startTracking(currentUsageLimit, currentBreakTime, { resetUsage });
  }
}

let catIsActive = false;
let trackerRunning = false;

function getShadowRoot({ create = true } = {}) {
  let host = document.getElementById(SHADOW_HOST_ID);
  if (!host && create) {
    host = document.createElement('div');
    host.id = SHADOW_HOST_ID;
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.left = '0';
    host.style.width = '0';
    host.style.height = '0';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';
    document.documentElement.appendChild(host);
  }

  if (!host) return null;

  if (!host.shadowRoot) {
    host.attachShadow({ mode: 'open' });
  }

  return host.shadowRoot;
}

function removeShadowHost() {
  document.getElementById(SHADOW_HOST_ID)?.remove();
}

function ensureShadowStyles(shadow, callback) {
  const existingLink = shadow.querySelector('link[data-cat-gatekeeper-style]');
  if (existingLink) {
    callback();
    return;
  }

  const link = document.createElement('link');
  link.dataset.catGatekeeperStyle = 'true';
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('content.css');
  link.addEventListener('load', callback, { once: true });
  link.addEventListener('error', callback, { once: true });
  shadow.appendChild(link);
}

// ポップアップからのメッセージを受け取る
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_CAT_STATUS') {
    sendResponse({
      catIsActive,
      hostname,
      trackerRunning,
      customDomains: currentCustomDomains,
      isTracked: currentSnsEnabled,
      trackedDomain: currentUsageKey,
      hasFocus: document.hasFocus(),
      isHidden: document.hidden,
    });
    return;
  }

  if (message.type === 'DISMISS_CAT') {
    const shadow = getShadowRoot({ create: false });
    const overlay = shadow?.getElementById(OVERLAY_ID);
    if (!overlay) {
      pendingShowRunId++;
      catIsActive = false;
      stopCountdown();
      removeShadowHost();
      return;
    }
    const dismissedUsageKey = currentUsageKey;
    catIsActive = false;
    stopCountdown();
    resetUsageSeconds(dismissedUsageKey);
    overlay.style.transition = 'opacity 0.5s';
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
      removeShadowHost();
      document.documentElement.style.overflow = '';
      document.removeEventListener('wheel', preventScroll);
      document.removeEventListener('touchmove', preventScroll);
      if (currentSnsEnabled && dismissedUsageKey === currentUsageKey) {
        startTracking(currentUsageLimit, currentBreakTime);
      }
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
let currentUsageKey = '';
let catAssetsPrepared = false;
let trackerRunId = 0;
let pendingShowRunId = 0;

function getUsageStorageKey(usageKey) {
  return `${USAGE_STORAGE_KEY}:${usageKey}`;
}

function loadUsageSeconds(usageKey, callback) {
  const storageKey = getUsageStorageKey(usageKey);

  chrome.storage.local.get({ [storageKey]: null }, (result) => {
    const entry = result[storageKey];
    const now = Date.now();

    if (!entry || typeof entry !== 'object') {
      callback(0);
      return;
    }

    if (now - Number(entry.updatedAt || 0) > USAGE_STALE_AFTER_MS) {
      callback(0);
      return;
    }

    callback(Math.max(0, Number.parseInt(entry.seconds, 10) || 0));
  });
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
  currentUsageLimit = usageLimit;
  currentBreakTime = breakTime;
  const usageKey = currentUsageKey;

  if (resetUsage) {
    resetUsageSeconds(usageKey);
  }

  loadUsageSeconds(usageKey, (initialSeconds) => {
    if (
      runId !== trackerRunId ||
      usageKey !== currentUsageKey ||
      catIsActive ||
      !currentSnsEnabled
    ) {
      return;
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
      if (usageKey !== currentUsageKey || catIsActive || !currentSnsEnabled) {
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
        showCat(breakTime, usageLimit, () => {
          if (currentSnsEnabled && usageKey === currentUsageKey) {
            startTracking(currentUsageLimit, currentBreakTime);
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

  catAssetsPrepared = true;
}

function chooseCatSet() {
  const index = Math.floor(Math.random() * CAT_VIDEO_SETS.length);
  return CAT_VIDEO_SETS[index] || CAT_VIDEO_SETS[0];
}

function prepareVideo(src) {
  const video = document.createElement('video');
  video.src = chrome.runtime.getURL(src);
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.load();
  return video;
}

chrome.storage.local.get(null, (settings) => {
  applySettings(settings);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  const settingsChanged = Object.keys(changes).some((key) =>
    SETTINGS_STORAGE_KEYS.has(key)
  );

  if (!settingsChanged) return;

  chrome.storage.local.get(null, (settings) => {
    applySettings(settings, { resetUsage: true });
  });
});

function showCat(breakMinutes, usageLimit, onBreakEnd) {
  const showRunId = ++pendingShowRunId;
  const shadow = getShadowRoot();
  const host = document.getElementById(SHADOW_HOST_ID);
  if (!shadow || !host) return;

  if (shadow.getElementById(OVERLAY_ID)) {
    return;
  }

  host.style.width = '100vw';
  host.style.height = '100vh';
  host.style.pointerEvents = 'auto';

  const catSet = chooseCatSet();

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.setProperty('opacity', '1', 'important');
  overlay.style.transition = '';

  // カウントダウン
  const countdown = document.createElement('div');
  countdown.id = 'cat-gatekeeper-countdown';
  if (catSet.countdown) {
    countdown.style.top = catSet.countdown.top;
    countdown.style.left = catSet.countdown.left;
  }
  countdown.style.zIndex = catSet.countdown?.zIndex ?? '2';
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
        removeShadowHost();
        document.documentElement.style.overflow = '';
        document.removeEventListener('wheel', preventScroll);
        document.removeEventListener('touchmove', preventScroll);
        onBreakEnd();
      }, 1000);
    }
  }
  updateCountdown();

  // neko1
  const video = prepareVideo(catSet.entry);
  video.autoplay = true;
  video.style.opacity = '1';
  video.style.zIndex = '1';

  // neko2（先読み・非表示）
  const videoSleep = prepareVideo(catSet.sleep);
  videoSleep.loop = true;
  videoSleep.style.display = 'none';
  videoSleep.style.opacity = '1';
  videoSleep.style.zIndex = '1';

  overlay.appendChild(countdown);
  overlay.appendChild(video);
  overlay.appendChild(videoSleep);

  // neko1が終わったらneko2に切り替え
  video.addEventListener('ended', () => {
    videoSleep.style.display = 'block';
    videoSleep.classList.add('sleeping');
    videoSleep.currentTime = 0;
    videoSleep.play().catch(() => {});

    requestAnimationFrame(() => {
      video.style.display = 'none';
    });
  });

  ensureShadowStyles(shadow, () => {
    const currentHost = document.getElementById(SHADOW_HOST_ID);
    if (
      showRunId === pendingShowRunId &&
      currentHost?.shadowRoot === shadow &&
      !shadow.getElementById(OVERLAY_ID)
    ) {
      shadow.appendChild(overlay);
      document.documentElement.style.overflow = 'hidden';
      document.addEventListener('wheel', preventScroll, { passive: false });
      document.addEventListener('touchmove', preventScroll, { passive: false });

      // ページ上の動画を一時停止（猫の動画は除く）
      document.querySelectorAll('video').forEach(v => {
        if (v !== video && v !== videoSleep && !shadow.contains(v)) v.pause();
      });
    }
  });
}
