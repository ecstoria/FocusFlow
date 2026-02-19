const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, globalShortcut, powerMonitor } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// ─── Auto-updater configuration ───────────────────────────────────────────────
// Points to your GitHub releases. Replace YOUR_GITHUB_USERNAME and YOUR_REPO_NAME.
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'ecstoria',
  repo: 'FocusFlow',
});
autoUpdater.autoDownload = true;        // Download silently in background
autoUpdater.autoInstallOnAppQuit = true; // Install when user quits

autoUpdater.on('update-available', () => {
  if (mainWindow) mainWindow.webContents.send('update-available');
});

autoUpdater.on('update-downloaded', () => {
  if (mainWindow) mainWindow.webContents.send('update-downloaded');
  // Show system notification too
  if (Notification.isSupported()) {
    new Notification({
      title: 'FocusFlow Update Ready',
      body: 'A new version has been downloaded. It will install when you quit FocusFlow.',
      silent: false,
    }).show();
  }
});

autoUpdater.on('error', (err) => {
  console.warn('[updater] Auto-update error:', err.message);
});
// ──────────────────────────────────────────────────────────────────────────────

let mainWindow;
let miniWindow;
let tray = null;
let isAlwaysOnTop = true; // ON by default
let isTimerRunning = false; // Track timer state in main process (renderer may be throttled when minimized)
let currentTheme = 'dark';
let currentAccent = 'white';

// Idle detection state
let idleCheckInterval = null;
let idleEnabled = false;
let idleTimeoutMinutes = 10;
let isIdlePaused = false;

// Single instance lock — prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to open a second instance — focus the existing window
    if (mainWindow) {
      if (mainWindow.isMinimized() || !mainWindow.isVisible()) {
        restoreMainWindow();
      } else {
        mainWindow.focus();
      }
    }
  });
}

// Data file path
const dataDir = path.join(app.getPath('userData'));
const dataFile = path.join(dataDir, 'focusflow-data.json');

function loadData() {
  try {
    if (fs.existsSync(dataFile)) {
      return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    }
  } catch (e) {
    console.warn('Failed to load data:', e);
  }
  return { sessions: [], labels: [] };
}

function saveData(data) {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to save data:', e);
  }
}

// Window size constants
const COMPACT_WIDTH = 460;
const FULL_WIDTH = 900;
const WINDOW_HEIGHT = 620;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: COMPACT_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: COMPACT_WIDTH,
    minHeight: 550,
    resizable: true,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0a',
    show: false, // Don't show until ready to prevent artifact on launch
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,        // ✅ Security fix: no direct Node access in renderer
      contextIsolation: true,        // ✅ Security fix: renderer is isolated from main
      preload: path.join(__dirname, 'preload.js'), // Secure IPC bridge
    },
  });

  mainWindow.loadFile('index.html');
  mainWindow.setAlwaysOnTop(true); // Default ON

  // Show window only after content is fully rendered to prevent launch artifact
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Normal minimize behavior (only fires when timer is NOT running,
  // because when timer IS running the app is hidden from taskbar)
  mainWindow.on('minimize', () => {
    // Safety fallback: if timer is somehow running, switch to mini mode
    if (isTimerRunning) {
      switchToMiniMode();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    hideMiniWindow();
    destroyTray();
    app.quit();
  });
}

function createMiniWindow() {
  if (miniWindow) return;

  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Try to use saved position from settings
  let posX = width - 200;
  let posY = height - 200;
  try {
    const data = loadData();
    if (data.settings && data.settings.miniTimer && data.settings.miniTimer.position) {
      const saved = data.settings.miniTimer.position;
      if (saved.x !== null && saved.y !== null) {
        posX = saved.x;
        posY = saved.y;
      }
    }
  } catch (e) {}

  // Validate position is visible on any connected display
  const allDisplays = screen.getAllDisplays();
  let isVisible = false;
  for (const display of allDisplays) {
    const b = display.bounds;
    // Check if the mini window center point falls within this display
    const centerX = posX + 80;
    const centerY = posY + 80;
    if (centerX >= b.x && centerX < b.x + b.width && centerY >= b.y && centerY < b.y + b.height) {
      isVisible = true;
      break;
    }
  }
  // If not visible on any display, reset to primary display
  if (!isVisible) {
    posX = width - 200;
    posY = height - 200;
  }

  const MINI_SIZE = 160;

  miniWindow = new BrowserWindow({
    width: MINI_SIZE,
    height: MINI_SIZE,
    x: posX,
    y: posY,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: false, // Set properly after creation
    focusable: true,
    webPreferences: {
      nodeIntegration: false,        // ✅ Security fix
      contextIsolation: true,        // ✅ Security fix
      preload: path.join(__dirname, 'preload.js'), // Secure IPC bridge
    },
  });

  miniWindow.loadFile('mini.html');

  // Force exact size after creation — prevents DPI/multi-monitor scaling issues
  miniWindow.setContentSize(MINI_SIZE, MINI_SIZE);
  miniWindow.setMinimumSize(MINI_SIZE, MINI_SIZE);
  miniWindow.setMaximumSize(MINI_SIZE, MINI_SIZE);

  // Use 'screen-saver' level to ensure mini timer stays above ALL windows
  if (isAlwaysOnTop) {
    miniWindow.setAlwaysOnTop(true, 'screen-saver');
  }

  // Sync theme to mini window once loaded
  miniWindow.webContents.on('did-finish-load', () => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.webContents.send('apply-theme', { theme: currentTheme, accent: currentAccent });
      // Re-enforce size after load to counter any DPI rescaling
      miniWindow.setContentSize(MINI_SIZE, MINI_SIZE);
    }
  });

  miniWindow.on('closed', () => {
    miniWindow = null;
  });
}

function hideMiniWindow() {
  if (miniWindow) {
    miniWindow.close();
    miniWindow = null;
  }
}

function createTray() {
  if (tray) return;

  // Use main icon resized for tray — ensures tray matches the actual app logo
  // Windows tray icons are typically 16x16 at 100% DPI, 32x32 at 200% DPI
  // Provide a larger icon and let Electron/OS handle DPI scaling
  const iconPath = path.join(__dirname, 'icon.png');
  const fullIcon = nativeImage.createFromPath(iconPath);
  // Create multi-resolution tray icon for crisp rendering at all DPI levels
  const trayIcon = nativeImage.createFromBuffer(
    fullIcon.resize({ width: 32, height: 32, quality: 'best' }).toPNG(),
    { scaleFactor: 2.0 }
  );
  tray = new Tray(trayIcon);
  tray.setToolTip('FocusFlow');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show FocusFlow', click: () => restoreMainWindow() },
    { type: 'separator' },
    { label: 'Pause / Resume', click: () => { if (mainWindow) mainWindow.webContents.send('remote-pause'); } },
    { label: 'Reset', click: () => { if (mainWindow) mainWindow.webContents.send('remote-reset'); restoreMainWindow(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => restoreMainWindow());
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

function switchToMiniMode() {
  if (!mainWindow) return;
  // skipTaskbar is already set by timer-state-changed handler
  mainWindow.hide();
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  createTray();
  createMiniWindow();
}

function restoreMainWindow() {
  // Close mini window and tray first
  hideMiniWindow();
  destroyTray();

  if (mainWindow) {
    // Only restore taskbar if timer is not running.
    // When timer IS running, keep hidden from taskbar to prevent
    // native minimize via taskbar click (causes Chromium freeze).
    if (!isTimerRunning) {
      mainWindow.setSkipTaskbar(false);
    }
    // Ensure clean state: restore if minimized, show if hidden
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
  }
}

app.whenReady().then(() => {
  createWindow();

  // Check for updates after a short delay (let the window load first)
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      console.warn('[updater] Update check failed (offline?):', err.message);
    });
  }, 5000);

  // Global shortcut: Ctrl+Shift+F to show/hide
  globalShortcut.register('Ctrl+Shift+F', () => {
    if (mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized()) {
      // Window is visible — if timer running, go to mini mode; otherwise just minimize
      if (isTimerRunning) {
        switchToMiniMode();
      } else {
        mainWindow.minimize();
      }
    } else {
      restoreMainWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  app.quit();
});

// IPC Handlers

ipcMain.on('theme-changed', (event, bgColor) => {
  if (mainWindow) {
    mainWindow.setBackgroundColor(bgColor);
  }
});

ipcMain.on('theme-sync', (event, data) => {
  currentTheme = data.theme || 'dark';
  currentAccent = data.accent || 'white';
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.webContents.send('apply-theme', { theme: currentTheme, accent: currentAccent });
  }
});

ipcMain.on('set-always-on-top', (event, value) => {
  isAlwaysOnTop = value;
  if (mainWindow) mainWindow.setAlwaysOnTop(value);
  if (miniWindow) {
    if (value) {
      miniWindow.setAlwaysOnTop(true, 'screen-saver');
    } else {
      miniWindow.setAlwaysOnTop(false);
    }
  }
});

ipcMain.on('timer-finished', (event, label) => {
  isTimerRunning = false;
  restoreMainWindow();
  if (Notification.isSupported()) {
    new Notification({
      title: 'FocusFlow',
      body: `${label} — Time's up! Take a break.`,
      silent: false,
    }).show();
  }
});

// Keep main-process timer state in sync and hide/show taskbar icon
ipcMain.on('timer-state-changed', (event, running) => {
  isTimerRunning = running;
  if (mainWindow) {
    // Hide from taskbar immediately when timer starts so the user
    // can't click the taskbar icon (which causes Chromium throttling freeze).
    // Restore taskbar presence when timer stops.
    mainWindow.setSkipTaskbar(running);
  }
});

ipcMain.on('timer-is-running', (event, running) => {
  isTimerRunning = running;
  if (running && mainWindow) {
    switchToMiniMode();
  }
});

ipcMain.on('timer-tick', (event, data) => {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.webContents.send('update-time', data);
  }
});

ipcMain.on('restore-main', () => restoreMainWindow());

ipcMain.on('show-mini-context-menu', () => {
  if (!miniWindow) return;
  Menu.buildFromTemplate([
    { label: 'Show FocusFlow', click: () => restoreMainWindow() },
    { type: 'separator' },
    { label: 'Pause / Resume', click: () => { if (mainWindow) mainWindow.webContents.send('remote-pause'); } },
    { label: 'End Session', click: () => { if (mainWindow) mainWindow.webContents.send('remote-end'); restoreMainWindow(); } },
    { label: 'Reset', click: () => { if (mainWindow) mainWindow.webContents.send('remote-reset'); restoreMainWindow(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]).popup({ window: miniWindow });
});

// Window resize for view switching (compact timer vs full width)
let resizeAnimationInterval = null;

ipcMain.on('set-window-width', (event, targetWidth) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  if (bounds.width === targetWidth) return;

  // Cancel any ongoing resize animation
  if (resizeAnimationInterval) {
    clearInterval(resizeAnimationInterval);
    resizeAnimationInterval = null;
  }

  // Set minimum size FIRST so the window CAN shrink to the target
  mainWindow.setMinimumSize(Math.min(targetWidth, COMPACT_WIDTH), 550);

  // Animate width change over ~200ms in steps
  const startWidth = bounds.width;
  const delta = targetWidth - startWidth;
  const steps = 12;
  const stepDuration = 16; // ~60fps
  let step = 0;

  // Center the resize: adjust x to keep window centered
  const startX = bounds.x;
  const totalDeltaX = -delta / 2;

  resizeAnimationInterval = setInterval(() => {
    step++;
    // Ease-out curve
    const t = step / steps;
    const ease = 1 - Math.pow(1 - t, 3);
    const currentWidth = Math.round(startWidth + delta * ease);
    const currentX = Math.round(startX + totalDeltaX * ease);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setBounds({
        x: currentX,
        y: bounds.y,
        width: currentWidth,
        height: bounds.height,
      });
    }

    if (step >= steps) {
      clearInterval(resizeAnimationInterval);
      resizeAnimationInterval = null;
      // Final enforcement: set exact target bounds and correct min width
      if (mainWindow && !mainWindow.isDestroyed()) {
        const finalX = Math.round(startX + totalDeltaX);
        mainWindow.setBounds({ x: finalX, y: bounds.y, width: targetWidth, height: bounds.height });
        mainWindow.setMinimumSize(targetWidth === COMPACT_WIDTH ? COMPACT_WIDTH : 700, 550);
      }
    }
  }, stepDuration);
});

// Window controls
ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close(); });

// Data persistence
ipcMain.handle('load-data', () => loadData());
ipcMain.handle('save-data', (event, data) => { saveData(data); return true; });
ipcMain.handle('get-data-path', () => dataFile);

// Export CSV
ipcMain.handle('export-csv', (event, csvContent) => {
  const { dialog } = require('electron');
  return dialog.showSaveDialog(mainWindow, {
    title: 'Export Session History',
    defaultPath: 'focusflow-sessions.csv',
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
  }).then(result => {
    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, csvContent, 'utf8');
      return result.filePath;
    }
    return null;
  });
});

// Idle detection
ipcMain.on('set-idle-detection', (event, config) => {
  idleEnabled = config.enabled;
  idleTimeoutMinutes = config.timeoutMinutes || 10;

  // Clear existing interval
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }

  if (idleEnabled) {
    idleCheckInterval = setInterval(() => {
      if (!isTimerRunning || !mainWindow) return;
      const idleSeconds = powerMonitor.getSystemIdleTime();
      const timeoutSeconds = idleTimeoutMinutes * 60;

      if (idleSeconds >= timeoutSeconds && !isIdlePaused) {
        isIdlePaused = true;
        mainWindow.webContents.send('idle-detected');
        if (Notification.isSupported()) {
          new Notification({
            title: 'FocusFlow',
            body: 'Timer paused — you seem idle.',
            silent: true,
          }).show();
        }
      } else if (idleSeconds < 5 && isIdlePaused) {
        isIdlePaused = false;
        mainWindow.webContents.send('idle-resumed');
      }
    }, 5000);
  }
});

// Mini timer drag support
ipcMain.on('mini-drag-start', () => {
  // Send current position back to mini window for absolute drag calculation
  if (miniWindow && !miniWindow.isDestroyed()) {
    const [x, y] = miniWindow.getPosition();
    miniWindow.webContents.send('mini-drag-start-pos', { x, y });
  }
});

ipcMain.on('mini-dragging', (event, pos) => {
  if (miniWindow && !miniWindow.isDestroyed()) {
    // Use setPosition with absolute coordinates — avoids setBounds DPI rescaling
    // that causes the window to disappear on monitors with different scale factors
    miniWindow.setPosition(Math.round(pos.x), Math.round(pos.y), false);
  }
});

ipcMain.on('mini-drag-end', () => {
  // Save current window position to settings via renderer
  if (miniWindow && !miniWindow.isDestroyed()) {
    const [x, y] = miniWindow.getPosition();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mini-position-saved', { x, y });
    }
  }
});

// Auto-updater: renderer can trigger install-and-restart
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});

// Weekly report check (runs hourly on Sundays)
function checkWeeklyReport() {
  try {
    const data = loadData();
    if (!data.settings || !data.settings.weeklyReport || !data.settings.weeklyReport.enabled) return;

    const now = new Date();
    if (now.getDay() !== 0) return; // Only on Sundays

    const lastSent = data.settings.weeklyReport.lastSent;
    const today = now.toISOString().split('T')[0];
    if (lastSent === today) return; // Already sent today

    // Calculate this week's stats (Mon–Sun)
    const mondayOffset = 6; // Sunday = day 0, so Monday was 6 days ago
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - mondayOffset);
    weekStart.setHours(0, 0, 0, 0);

    const weekSessions = data.sessions.filter(s => new Date(s.date) >= weekStart);
    const weekSecs = weekSessions.reduce((a, s) => a + s.duration, 0);
    const weekHrs = (weekSecs / 3600).toFixed(1);
    const sessionCount = weekSessions.length;

    if (Notification.isSupported()) {
      new Notification({
        title: 'FocusFlow — Weekly Report',
        body: `This week: ${weekHrs}h across ${sessionCount} sessions. Keep up the great work!`,
        silent: false,
      }).show();
    }

    // Mark as sent
    data.settings.weeklyReport.lastSent = today;
    saveData(data);
  } catch (e) {
    console.warn('Weekly report check failed:', e);
  }
}

// Schedule weekly report checks (every hour)
setInterval(checkWeeklyReport, 3600000);
// Also check shortly after launch
setTimeout(checkWeeklyReport, 10000);
