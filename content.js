const shared = globalThis.CatGatekeeperShared;

// Pre-load assets
const preloadVideo = document.createElement('video');
preloadVideo.preload = 'auto';
preloadVideo.muted = true;

const preloadSleep = document.createElement('video');
preloadSleep.preload = 'auto';
preloadSleep.muted = true;

const preventScroll = (e) => e.preventDefault();

const hostname = location.hostname;
const USAGE_STORAGE_KEY = 'catGatekeeperUsage';
const USAGE_STALE_AFTER_MS = 30 * 60 * 1000;
const USAGE_SAVE_INTERVAL_SECONDS = 5;

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

// Shadow DOM helper
function getShadowRoot() {
  const hostId = 'cat-gk-host';
  let host = document.getElementById(hostId);
  if (!host) {
    host = document.createElement('div');
    host.id = hostId;
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.left = '0';
    host.style.width = '0';
    host.style.height = '0';
    host.style.zIndex = '2147483647';
    // Ensure the host doesn't block clicks when empty
    host.style.pointerEvents = 'none';
    document.documentElement.appendChild(host);
  }
  if (!host.shadowRoot) {
    host.attachShadow({ mode: 'open' });
  }
  return host.shadowRoot;
}

// Handle messages from the popup
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

  if (message.type === 'UPDATE_SETTINGS') {
    stopTracker();
    applySettings(message.settings, { resetUsage: true });
  }

  if (message.type === 'DISMISS_CAT') {
    const shadow = getShadowRoot();
    const overlay = shadow.getElementById('cat-gatekeeper-overlay');
    if (!overlay) return;
    const dismissedUsageKey = currentUsageKey;
    catIsActive = false;
    stopCountdown();
    resetUsageSeconds(dismissedUsageKey);
    overlay.style.transition = 'opacity 0.5s';
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
      const host = document.getElementById('cat-gk-host');
      if (host) {
        host.remove();
      }
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

  preloadVideo.src = chrome.runtime.getURL('assets/neko1.webm');
  preloadSleep.src = chrome.runtime.getURL('assets/neko2.webm');
  preloadVideo.load();
  preloadSleep.load();
  catAssetsPrepared = true;
}

chrome.storage.local.get(null, (settings) => {
  applySettings(settings);
});

function showCat(breakMinutes, usageLimit, onBreakEnd) {
  const shadow = getShadowRoot();
  const host = document.getElementById('cat-gk-host');

  // Prevent duplicate overlays
  if (shadow.getElementById('cat-gatekeeper-overlay')) {
    return;
  }

  // Activate host
  host.style.width = '100vw';
  host.style.height = '100vh';
  host.style.pointerEvents = 'auto';

  // Inject CSS into Shadow DOM
  if (!shadow.querySelector('link')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('content.css');
    shadow.appendChild(link);
  }

  const overlay = document.createElement('div');
  overlay.id = 'cat-gatekeeper-overlay';
  overlay.style.setProperty('opacity', '1', 'important');
  overlay.style.transition = '';

  // Countdown timer
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
        if (host) host.remove();
        document.documentElement.style.overflow = '';
        document.removeEventListener('wheel', preventScroll);
        document.removeEventListener('touchmove', preventScroll);
        onBreakEnd();
      }, 1000);
    }
  }
  updateCountdown();

  // neko1 video
  const video = document.createElement('video');
  video.src = chrome.runtime.getURL('assets/neko1.webm');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.style.opacity = '1';

  // neko2 video (preload and hidden)
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
  shadow.appendChild(overlay);
  document.documentElement.style.overflow = 'hidden';
  document.addEventListener('wheel', preventScroll, { passive: false });
  document.addEventListener('touchmove', preventScroll, { passive: false });

  // Pause page videos (excluding the cat videos)
  document.querySelectorAll('video').forEach(v => {
    if (v !== video && v !== videoSleep && !shadow.contains(v)) v.pause();
  });

  // Switch to neko2 when neko1 ends
  video.addEventListener('ended', () => {
    video.style.display = 'none';
    videoSleep.style.display = 'block';
    videoSleep.classList.add('sleeping');
    videoSleep.play();
  });
}


