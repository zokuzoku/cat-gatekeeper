const enabledInput = document.getElementById('enabled');
const durationInput = document.getElementById('breakDurationMinutes');
const scheduleInput = document.getElementById('scheduleTimes');
const autoLaunchInput = document.getElementById('autoLaunch');
const launchMinimizedInput = document.getElementById('launchMinimized');
const saveButton = document.getElementById('save');
const startNowButton = document.getElementById('startNow');
const statusText = document.getElementById('status');

function setStatus(message) {
  statusText.textContent = message;
  window.clearTimeout(setStatus.timer);
  setStatus.timer = window.setTimeout(() => {
    statusText.textContent = '';
  }, 2600);
}

function readForm() {
  return {
    enabled: enabledInput.checked,
    breakDurationMinutes: durationInput.value,
    scheduleTimes: scheduleInput.value.split('\n'),
    autoLaunch: autoLaunchInput.checked,
    launchMinimized: launchMinimizedInput.checked,
  };
}

function writeForm(settings) {
  enabledInput.checked = settings.enabled;
  durationInput.value = settings.breakDurationMinutes;
  scheduleInput.value = settings.scheduleTimes.join('\n');
  autoLaunchInput.checked = settings.autoLaunch;
  launchMinimizedInput.checked = settings.launchMinimized;
}

async function loadSettings() {
  const settings = await window.pausaActiva.getSettings();
  writeForm(settings);
}

saveButton.addEventListener('click', async () => {
  const savedSettings = await window.pausaActiva.saveSettings(readForm());
  writeForm(savedSettings);
  setStatus('Configuracion guardada.');
});

startNowButton.addEventListener('click', async () => {
  await window.pausaActiva.saveSettings(readForm());
  await window.pausaActiva.startBreakNow();
  setStatus('Pausa iniciada.');
});

loadSettings().catch(() => {
  setStatus('No se pudo cargar la configuracion.');
});
