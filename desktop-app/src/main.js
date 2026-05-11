const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SETTINGS = {
  enabled: true,
  breakDurationMinutes: 5,
  scheduleTimes: ['09:00', '11:00', '15:00'],
  autoLaunch: false,
  launchMinimized: true,
};

let settingsWindow = null;
let overlayWindow = null;
let tray = null;
let settings = { ...DEFAULT_SETTINGS };
const triggeredBreaks = new Set();

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function normalizeTime(value) {
  const match = String(value || '').trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function normalizeSettings(input) {
  const safeInput = input && typeof input === 'object' ? input : {};
  const scheduleTimes = Array.isArray(safeInput.scheduleTimes)
    ? safeInput.scheduleTimes
    : String(safeInput.scheduleTimes || '').split(/[\n,]+/);

  const normalizedTimes = [...new Set(scheduleTimes.map(normalizeTime).filter(Boolean))].sort();
  const duration = Number.parseInt(safeInput.breakDurationMinutes, 10);

  return {
    enabled: safeInput.enabled !== false,
    breakDurationMinutes: Number.isFinite(duration)
      ? Math.min(Math.max(duration, 1), 120)
      : DEFAULT_SETTINGS.breakDurationMinutes,
    scheduleTimes: normalizedTimes.length ? normalizedTimes : [...DEFAULT_SETTINGS.scheduleTimes],
    autoLaunch: safeInput.autoLaunch === true,
    launchMinimized: safeInput.launchMinimized !== false,
  };
}

function loadSettings() {
  try {
    const rawSettings = fs.readFileSync(getSettingsPath(), 'utf8');
    settings = normalizeSettings(JSON.parse(rawSettings));
  } catch (_error) {
    settings = { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(nextSettings) {
  settings = normalizeSettings(nextSettings);
  fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
  app.setLoginItemSettings({
    openAtLogin: settings.autoLaunch,
    openAsHidden: settings.launchMinimized,
    args: settings.launchMinimized ? ['--background-start'] : [],
  });
  return settings;
}

function resolveVideoPath(fileName, fallbackName) {
  const localPath = path.join(__dirname, 'assets', fileName);
  const packagedPath = path.join(process.resourcesPath || '', 'assets', fileName);
  const originalProjectPath = path.resolve(__dirname, '..', '..', 'assets', fallbackName);

  if (app.isPackaged && fs.existsSync(packagedPath)) return packagedPath;
  if (fs.existsSync(localPath)) return localPath;
  if (fs.existsSync(originalProjectPath)) return originalProjectPath;

  return '';
}

function getVideoSources() {
  return {
    intro: resolveVideoPath('break-start.webm', 'neko1.webm'),
    loop: resolveVideoPath('break-loop.webm', 'neko2.webm'),
  };
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 440,
    height: 620,
    minWidth: 380,
    minHeight: 520,
    title: 'Pausa Activa Gato',
    show: false,
    backgroundColor: '#171717',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      settingsWindow.hide();
    }
  });
}

function createTray() {
  const localIconPath = path.resolve(__dirname, 'assets', 'nekoicon16.png');
  const originalIconPath = path.resolve(__dirname, '..', '..', 'assets', 'nekoicon16.png');
  const iconPath = fs.existsSync(localIconPath) ? localIconPath : originalIconPath;
  const trayIcon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(trayIcon);
  tray.setToolTip('Pausa Activa Gato');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir configuracion', click: createSettingsWindow },
    { label: 'Iniciar pausa ahora', click: () => showBreakOverlay() },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]));
  tray.on('double-click', createSettingsWindow);
}

function showBreakOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.focus();
    return;
  }

  const videos = getVideoSources();
  overlayWindow = new BrowserWindow({
    fullscreen: true,
    frame: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    hasShadow: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    resizable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.loadFile(path.join(__dirname, 'overlay', 'overlay.html'), {
    query: {
      minutes: String(settings.breakDurationMinutes),
      intro: videos.intro,
      loop: videos.loop,
    },
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentTimeKey(date) {
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

function checkSchedule() {
  if (!settings.enabled) return;

  const now = new Date();
  const timeKey = getCurrentTimeKey(now);
  const breakKey = `${getDateKey(now)} ${timeKey}`;

  if (!settings.scheduleTimes.includes(timeKey) || triggeredBreaks.has(breakKey)) {
    return;
  }

  triggeredBreaks.add(breakKey);
  showBreakOverlay();
}

ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:save', (_event, nextSettings) => saveSettings(nextSettings));
ipcMain.handle('break:start-now', () => showBreakOverlay());
ipcMain.handle('break:finish', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
});

app.whenReady().then(() => {
  loadSettings();
  saveSettings(settings);
  createTray();

  if (!process.argv.includes('--background-start')) {
    createSettingsWindow();
  }

  setInterval(checkSchedule, 15 * 1000);
  checkSchedule();
});

app.on('activate', createSettingsWindow);
app.on('window-all-closed', (event) => {
  event.preventDefault();
});
