const params = new URLSearchParams(window.location.search);
const minutes = Math.min(Math.max(Number.parseInt(params.get('minutes'), 10) || 5, 1), 120);
const introPath = params.get('intro') || '';
const loopPath = params.get('loop') || '';
const countdown = document.getElementById('countdown');
const introVideo = document.getElementById('introVideo');
const loopVideo = document.getElementById('loopVideo');
const missingVideo = document.getElementById('missingVideo');

let remainingSeconds = minutes * 60;

function toFileUrl(filePath) {
  if (!filePath) return '';
  return encodeURI(`file:///${filePath.replace(/\\/g, '/').replace(/^\/+/, '')}`);
}

function updateCountdown() {
  const minuteValue = Math.floor(remainingSeconds / 60);
  const secondValue = remainingSeconds % 60;
  countdown.textContent = `${minuteValue}:${String(secondValue).padStart(2, '0')}`;

  if (remainingSeconds <= 0) {
    window.pausaActiva.finishBreak();
    return;
  }

  remainingSeconds -= 1;
  window.setTimeout(updateCountdown, 1000);
}

function showFallback() {
  introVideo.hidden = true;
  loopVideo.hidden = true;
  missingVideo.hidden = false;
}

function setupVideos() {
  const introUrl = toFileUrl(introPath);
  const loopUrl = toFileUrl(loopPath);

  if (!introUrl && !loopUrl) {
    showFallback();
    return;
  }

  if (introUrl) {
    introVideo.src = introUrl;
  } else {
    introVideo.hidden = true;
  }

  if (loopUrl) {
    loopVideo.src = loopUrl;
  }

  introVideo.addEventListener('ended', () => {
    introVideo.hidden = true;

    if (loopUrl) {
      loopVideo.hidden = false;
      loopVideo.play();
    } else {
      showFallback();
    }
  });

  introVideo.addEventListener('error', () => {
    if (loopUrl) {
      introVideo.hidden = true;
      loopVideo.hidden = false;
      loopVideo.play();
    } else {
      showFallback();
    }
  });
}

setupVideos();
updateCountdown();
