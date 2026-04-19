// 翻訳を適用
document.querySelectorAll('[data-i18n]').forEach(el => {
  el.textContent = chrome.i18n.getMessage(el.dataset.i18n);
});

// 猫が出てるときだけ閉じるボタンを表示
const dismissBtn = document.getElementById('dismissBtn');
chrome.storage.local.get({ catActive: false }, (data) => {
  if (data.catActive) dismissBtn.style.display = 'block';
});

dismissBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'DISMISS_CAT' });
    chrome.storage.local.set({ catActive: false });
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
    usageLimit: parseInt(document.getElementById('usageLimit').value),
    breakTime: parseInt(document.getElementById('breakTime').value),
    sns: {
      x: document.getElementById('sns-x').checked,
      instagram: document.getElementById('sns-instagram').checked,
      tiktok: document.getElementById('sns-tiktok').checked,
      youtube: document.getElementById('sns-youtube').checked,
    }
  };

  chrome.storage.local.set(settings, () => {
    const msg = document.getElementById('savedMsg');
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', 2000);
  });
});
