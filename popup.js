// 翻訳を適用
document.querySelectorAll('[data-i18n]').forEach(el => {
  el.textContent = chrome.i18n.getMessage(el.dataset.i18n);
});

const shared = globalThis.CatGatekeeperShared;

function mergeSettingsWithDefaults(settings) {
  return shared.normalizeSettings(settings);
}

function getClampedNumberValue(inputId, fallbackValue) {
  const input = document.getElementById(inputId);
  const parsedValue = Number.parseInt(input.value, 10);
  const minValue = Number.parseInt(input.min, 10);
  const maxValue = Number.parseInt(input.max, 10);

  if (Number.isNaN(parsedValue)) {
    return fallbackValue;
  }

  return Math.min(Math.max(parsedValue, minValue), maxValue);
}

// 猫が出てるときだけ閉じるボタンを表示
const dismissBtn = document.getElementById('dismissBtn');
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CAT_STATUS' }, (res) => {
    void chrome.runtime.lastError;
    if (res?.catIsActive) dismissBtn.style.display = 'block';
  });
});

dismissBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'DISMISS_CAT' }, () => {
      void chrome.runtime.lastError;
    });
    dismissBtn.style.display = 'none';
  });
});

const defaults = {
  ...shared.DEFAULT_SETTINGS,
};

// 設定を読み込む
chrome.storage.local.get(defaults, (settings) => {
  const mergedSettings = mergeSettingsWithDefaults(settings);

  document.getElementById('usageLimit').value = mergedSettings.usageLimit;
  document.getElementById('breakTime').value = mergedSettings.breakTime;
  document.getElementById('customDomains').value = mergedSettings.customDomains.join('\n');
  document.getElementById('sns-x').checked = mergedSettings.sns.x;
  document.getElementById('sns-youtube').checked = mergedSettings.sns.youtube;
  document.getElementById('sns-facebook').checked = mergedSettings.sns.facebook;
  document.getElementById('sns-reddit').checked = mergedSettings.sns.reddit;
  document.getElementById('sns-threads').checked = mergedSettings.sns.threads;
  document.getElementById('sns-bluesky').checked = mergedSettings.sns.bluesky;
});

// 設定を保存する
document.getElementById('saveBtn').addEventListener('click', () => {
  const settings = {
    usageLimit: getClampedNumberValue('usageLimit', defaults.usageLimit),
    breakTime: getClampedNumberValue('breakTime', defaults.breakTime),
    customDomains: shared.normalizeDomainList(document.getElementById('customDomains').value),
    sns: {
      x: document.getElementById('sns-x').checked,
      youtube: document.getElementById('sns-youtube').checked,
      facebook: document.getElementById('sns-facebook').checked,
      reddit: document.getElementById('sns-reddit').checked,
      threads: document.getElementById('sns-threads').checked,
      bluesky: document.getElementById('sns-bluesky').checked,
    }
  };

  document.getElementById('usageLimit').value = settings.usageLimit;
  document.getElementById('breakTime').value = settings.breakTime;
  document.getElementById('customDomains').value = settings.customDomains.join('\n');

  chrome.storage.local.set(settings, () => {
    const msg = document.getElementById('savedMsg');
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', 2000);
  });
});
