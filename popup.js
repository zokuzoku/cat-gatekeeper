// 翻訳を適用
document.querySelectorAll('[data-i18n]').forEach(el => {
  el.textContent = chrome.i18n.getMessage(el.dataset.i18n);
});

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
  usageLimit: 60,
  breakTime: 5,
  sns: {
    x: true,
    instagram: true,
    tiktok: true,
    youtube: true,
  }
};

// 設定を読み込む
chrome.storage.local.get(defaults, (settings) => {
  document.getElementById('usageLimit').value = settings.usageLimit;
  document.getElementById('breakTime').value = settings.breakTime;
  document.getElementById('sns-x').checked = settings.sns.x;
  document.getElementById('sns-instagram').checked = settings.sns.instagram;
  document.getElementById('sns-tiktok').checked = settings.sns.tiktok;
  document.getElementById('sns-youtube').checked = settings.sns.youtube;
});

// 設定を保存する
document.getElementById('saveBtn').addEventListener('click', () => {
  const settings = {
    usageLimit: getClampedNumberValue('usageLimit', defaults.usageLimit),
    breakTime: getClampedNumberValue('breakTime', defaults.breakTime),
    sns: {
      x: document.getElementById('sns-x').checked,
      instagram: document.getElementById('sns-instagram').checked,
      tiktok: document.getElementById('sns-tiktok').checked,
      youtube: document.getElementById('sns-youtube').checked,
    }
  };

  document.getElementById('usageLimit').value = settings.usageLimit;
  document.getElementById('breakTime').value = settings.breakTime;

  chrome.storage.local.set(settings, () => {
    const msg = document.getElementById('savedMsg');
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', 2000);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'UPDATE_SETTINGS', settings }, () => {
        void chrome.runtime.lastError;
      });
    });
  });
});
