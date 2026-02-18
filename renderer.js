
// Chart.js is loaded via CDN script tag in index.html

// ============ DEFAULT SETTINGS ============

const DEFAULT_SETTINGS = {
  general: { alwaysOnTop: true },
  timer: {
    breakTimer: {
      enabled: false,
      breakMinutes: 15,
    },
    sessionNotes: { enabled: true },
    idleDetection: { enabled: false, timeoutMinutes: 10 },
  },
  shortcuts: {
    startPause: 'Space', reset: 'Ctrl+R', end: 'Ctrl+Shift+E',
    minimize: 'Escape', showHelp: '?', globalToggle: 'Ctrl+Shift+F',
  },
  appearance: { theme: 'dark', accentColor: 'white' },
  goals: { dailyHours: 4, weeklyHours: 20 },
  miniTimer: { position: { x: null, y: null } },
  weeklyReport: { enabled: false, lastSent: null },
};

function mergeDefaults(target, defaults) {
  const result = { ...defaults };
  if (!target) return result;
  for (const key in defaults) {
    if (key in target) {
      if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
        result[key] = mergeDefaults(target[key], defaults[key]);
      } else {
        result[key] = target[key];
      }
    }
  }
  return result;
}

// ============ DOM ELEMENTS ============

const hoursEl = document.getElementById('hours');
const minutesEl = document.getElementById('minutes');
const secondsEl = document.getElementById('seconds');
const timeDisplay = document.querySelector('.time-display');
const timerStatus = document.getElementById('timerStatus');
const ringProgress = document.getElementById('ringProgress');
const timerRing = document.querySelector('.timer-ring');
const startBtn = document.getElementById('startBtn');
const startBtnText = document.getElementById('startBtnText');
const startIcon = document.getElementById('startIcon');
const pauseBtn = document.getElementById('pauseBtn');
const pauseBtnText = document.getElementById('pauseBtnText');
const pauseIcon = document.getElementById('pauseIcon');
const resetBtn = document.getElementById('resetBtn');
const setCustomBtn = document.getElementById('setCustomTime');
const inputHours = document.getElementById('inputHours');
const inputMinutes = document.getElementById('inputMinutes');
const inputSeconds = document.getElementById('inputSeconds');
const presetBtns = document.querySelectorAll('.preset-btn');
const taskLabelInput = document.getElementById('taskLabel');
const taskDropdown = document.getElementById('taskDropdown');
const sessionCountEl = document.getElementById('sessionCount');
const todayTimeEl = document.getElementById('todayTime');
const navIcons = document.querySelectorAll('.nav-icon[data-view]');
const views = document.querySelectorAll('.view');

// Dashboard elements
const dashTodayHours = document.getElementById('dashTodayHours');
const dashWeekHours = document.getElementById('dashWeekHours');
const dashTotalSessions = document.getElementById('dashTotalSessions');
const dashTopTask = document.getElementById('dashTopTask');
const chartTabs = document.querySelectorAll('.chart-tab');
const taskTable = document.getElementById('taskTable');
const exportCsvBtn = document.getElementById('exportCsv');

// Break bar elements
const breakBar = document.getElementById('breakBar');
const breakMinutesInput = document.getElementById('breakMinutesInput');

// Shortcut overlay
const shortcutOverlay = document.getElementById('shortcutOverlay');
const shortcutOverlayClose = document.getElementById('shortcutOverlayClose');

// Notes modal
const notesModal = document.getElementById('notesModal');
const sessionNotesInput = document.getElementById('sessionNotesInput');
const notesSkipBtn = document.getElementById('notesSkipBtn');
const notesSaveBtn = document.getElementById('notesSaveBtn');

// Idle modal
const idleModal = document.getElementById('idleModal');
const idleDismissBtn = document.getElementById('idleDismissBtn');
const idleResumeBtn = document.getElementById('idleResumeBtn');

// Title bar
document.getElementById('tbMin').addEventListener('click', () => {
  if (isRunning) {
    window.electronAPI.send('timer-is-running', true);
  } else {
    window.electronAPI.send('window-minimize');
  }
});
document.getElementById('tbMax').addEventListener('click', () => window.electronAPI.send('window-maximize'));
document.getElementById('tbClose').addEventListener('click', () => window.electronAPI.send('window-close'));

// ============ STATE ============

let totalSeconds = 25 * 60;
let remainingSeconds = totalSeconds;
let timerInterval = null;
let isRunning = false;
let isPaused = false;
let sessionStartTime = null;
let appData = { sessions: [], labels: [], settings: {} };
let settings = { ...DEFAULT_SETTINGS };
let historyChart = null;
let currentChartRange = 'daily';
let pendingNotesSessionIndex = -1;

// Break timer state
let isBreakMode = false;
let pomodoroCount = 0;
let lastFocusDuration = 25 * 60; // Remember focus duration for break→focus repeat cycle

// Ring circumference for progress
const RING_CIRCUMFERENCE = 2 * Math.PI * 88; // ~553

// ============ THEME ============

function applyTheme(theme, accent) {
  document.body.setAttribute('data-theme', theme || 'dark');
  if (accent && accent !== 'white') {
    document.body.setAttribute('data-accent', accent);
  } else {
    document.body.removeAttribute('data-accent');
  }
  const bgColor = theme === 'light' ? '#ffffff' : '#0a0a0a';
  window.electronAPI.send('theme-changed', bgColor);
  window.electronAPI.send('theme-sync', { theme: theme || 'dark', accent: accent || 'white' });
  if (historyChart) updateChart(currentChartRange);
}

function getThemeColor(varName) {
  return getComputedStyle(document.body).getPropertyValue(varName).trim();
}

// ============ DATA ============

async function loadAppData() {
  appData = await window.electronAPI.invoke('load-data');
  if (!appData.sessions) appData.sessions = [];
  if (!appData.labels) appData.labels = [];
  settings = mergeDefaults(appData.settings, DEFAULT_SETTINGS);
  applySettings();
  updateStats();
}

async function saveAppData() {
  appData.settings = settings;
  await window.electronAPI.invoke('save-data', appData);
}

function addSession(duration, label) {
  const now = new Date();
  const session = {
    date: now.toISOString().split('T')[0],
    start: new Date(now.getTime() - duration * 1000).toISOString(),
    end: now.toISOString(),
    duration: duration,
    label: label || 'Unlabeled',
    notes: '',
  };
  appData.sessions.push(session);

  if (label && !appData.labels.includes(label)) {
    appData.labels.push(label);
  }

  saveAppData();
  updateStats();

  // Return index for notes attachment
  return appData.sessions.length - 1;
}

// ============ AUDIO ============

function playAlarmSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const pattern = [
      { freq: 800, dur: 0.12, gap: 0.08 },
      { freq: 800, dur: 0.12, gap: 0.08 },
      { freq: 800, dur: 0.12, gap: 0.25 },
      { freq: 1000, dur: 0.12, gap: 0.08 },
      { freq: 1000, dur: 0.12, gap: 0.08 },
      { freq: 1000, dur: 0.12, gap: 0 },
    ];
    let t = ctx.currentTime;
    pattern.forEach(({ freq, dur, gap }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + dur);
      osc.start(t);
      osc.stop(t + dur);
      t += dur + gap;
    });
  } catch (e) {}
}

// ============ DISPLAY ============

function formatTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return {
    h: String(h).padStart(2, '0'),
    m: String(m).padStart(2, '0'),
    s: String(s).padStart(2, '0'),
  };
}

function updateDisplay() {
  const t = formatTime(remainingSeconds);
  hoursEl.textContent = t.h;
  minutesEl.textContent = t.m;
  secondsEl.textContent = t.s;

  // Ring progress
  if (totalSeconds > 0) {
    const elapsed = totalSeconds - remainingSeconds;
    const pct = elapsed / totalSeconds;
    const offset = RING_CIRCUMFERENCE * (1 - pct);
    ringProgress.style.strokeDashoffset = offset;
  }

  // Send to mini window
  const progress = totalSeconds > 0 ? (totalSeconds - remainingSeconds) / totalSeconds : 0;
  const status = isBreakMode ? 'break' : (isRunning ? (isPaused ? 'paused' : 'focusing') : 'ready');
  window.electronAPI.send('timer-tick', {
    time: `${t.h}:${t.m}:${t.s}`,
    progress: progress,
    status: status,
  });
}

function updateStats() {
  const today = new Date().toISOString().split('T')[0];
  const todaySessions = appData.sessions.filter(s => s.date === today);
  const todaySecs = todaySessions.reduce((a, s) => a + s.duration, 0);

  sessionCountEl.textContent = todaySessions.length;
  todayTimeEl.textContent = formatDuration(todaySecs);
}

function formatDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ============ TIMER ============

function setTime(seconds) {
  stopTimer();
  totalSeconds = seconds;
  remainingSeconds = seconds;
  updateDisplay();
  ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE;
  timeDisplay.className = 'time-display';
  timerStatus.textContent = 'ready';
  timerRing.classList.remove('finished');
  updateStartButton(false);
}

function updateStartButton(running) {
  if (running) {
    // End mode
    startBtn.disabled = false;
    startBtn.classList.add('end-mode');
    startBtnText.textContent = 'End';
    startIcon.innerHTML = '<rect x="4" y="4" width="16" height="16" rx="2"/>';
  } else {
    // Start mode
    startBtn.disabled = false;
    startBtn.classList.remove('end-mode');
    startBtnText.textContent = 'Start';
    startIcon.innerHTML = '<polygon points="6,3 20,12 6,21"/>';
  }
}

function startTimer() {
  if (remainingSeconds <= 0) return;

  isRunning = true;
  isPaused = false;
  sessionStartTime = new Date();
  if (!isBreakMode) lastFocusDuration = totalSeconds;
  window.electronAPI.send('timer-state-changed', true);
  timeDisplay.className = 'time-display running';
  timerStatus.textContent = isBreakMode ? 'break' : 'focusing';
  timerRing.classList.remove('finished');
  updateStartButton(true);
  pauseBtn.disabled = false;
  pauseBtnText.textContent = 'Pause';
  pauseIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';

  timerInterval = setInterval(() => {
    remainingSeconds--;
    updateDisplay();
    if (remainingSeconds <= 0) timerFinished();
  }, 1000);
}

function pauseTimer() {
  if (!isRunning) return;

  if (isPaused) {
    isPaused = false;
    timeDisplay.className = 'time-display running';
    timerStatus.textContent = isBreakMode ? 'break' : 'focusing';
    pauseBtnText.textContent = 'Pause';
    pauseIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    timerInterval = setInterval(() => {
      remainingSeconds--;
      updateDisplay();
      if (remainingSeconds <= 0) timerFinished();
    }, 1000);
  } else {
    isPaused = true;
    clearInterval(timerInterval);
    timerInterval = null;
    timeDisplay.className = 'time-display paused';
    timerStatus.textContent = 'paused';
    pauseBtnText.textContent = 'Resume';
    pauseIcon.innerHTML = '<polygon points="6,3 20,12 6,21"/>';
  }
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  isRunning = false;
  isPaused = false;
  window.electronAPI.send('timer-state-changed', false);
  updateStartButton(false);
  pauseBtn.disabled = true;
  pauseBtnText.textContent = 'Pause';
  pauseIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
}

function resetTimer() {
  stopTimer();
  isBreakMode = false;
  document.body.classList.remove('break-mode');
  remainingSeconds = totalSeconds;
  updateDisplay();
  ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE;
  timeDisplay.className = 'time-display';
  timerStatus.textContent = 'ready';
  timerRing.classList.remove('finished');
}

function endTimer() {
  // Save elapsed time as a session
  if (!isRunning || isBreakMode) return;
  const elapsed = totalSeconds - remainingSeconds;
  if (elapsed < 10) {
    // Less than 10 seconds — just reset, don't log
    resetTimer();
    return;
  }
  const label = taskLabelInput.value.trim();
  stopTimer();
  isBreakMode = false;
  document.body.classList.remove('break-mode');

  const sessionIdx = addSession(elapsed, label);

  // Notify
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  let desc = '';
  if (h > 0) desc += h + 'h ';
  if (m > 0) desc += m + 'm';
  if (!desc) desc = elapsed + 's';
  if (label) desc += ' — ' + label;
  window.electronAPI.send('timer-finished', desc.trim());

  // Session notes prompt
  if (settings.timer.sessionNotes.enabled) {
    pendingNotesSessionIndex = sessionIdx;
    showNotesModal();
  }

  // Reset display
  remainingSeconds = totalSeconds;
  updateDisplay();
  ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE;
  timeDisplay.className = 'time-display';
  timerStatus.textContent = 'done';
  timerRing.classList.remove('finished');

  setTimeout(() => {
    if (timerStatus.textContent === 'done') timerStatus.textContent = 'ready';
  }, 5000);
}

function timerFinished() {
  const elapsed = totalSeconds;
  const label = taskLabelInput.value.trim();
  stopTimer();

  if (isBreakMode) {
    // Break finished — auto-repeat: start the focus timer again
    isBreakMode = false;
    document.body.classList.remove('break-mode');
    playAlarmSound();

    // Restore the previous focus duration and auto-start
    totalSeconds = lastFocusDuration;
    remainingSeconds = lastFocusDuration;
    timerRing.classList.remove('finished');
    updateDisplay();
    ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE;
    timeDisplay.className = 'time-display';

    // Auto-start focus after a brief pause
    setTimeout(() => {
      startTimer();
    }, 1500);
    return;
  }

  // Focus session finished
  timerRing.classList.add('finished');
  timerStatus.textContent = "time's up!";
  playAlarmSound();

  // Log session
  const sessionIdx = addSession(elapsed, label);
  pomodoroCount++;

  // Notify
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  let desc = '';
  if (h > 0) desc += h + 'h ';
  if (m > 0) desc += m + 'm';
  if (!desc) desc = elapsed + 's';
  if (label) desc += ' — ' + label;
  window.electronAPI.send('timer-finished', desc.trim());

  // Session notes prompt
  if (settings.timer.sessionNotes.enabled) {
    pendingNotesSessionIndex = sessionIdx;
    showNotesModal();
  }

  // Auto-start break if enabled
  if (settings.timer.breakTimer.enabled) {
    setTimeout(() => {
      startBreak();
    }, 1500);
  } else {
    setTimeout(() => {
      timerRing.classList.remove('finished');
      timerStatus.textContent = 'done';
    }, 8000);
  }
}

// ============ BREAK TIMER ============

function getBreakMinutes() {
  return settings.timer.breakTimer.breakMinutes || 15;
}

function startBreak() {
  const breakDuration = getBreakMinutes() * 60;

  isBreakMode = true;
  document.body.classList.add('break-mode');
  totalSeconds = breakDuration;
  remainingSeconds = breakDuration;
  timerRing.classList.remove('finished');
  updateDisplay();
  ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE;
  startTimer();
}

function updateBreakBar() {
  if (settings.timer.breakTimer.enabled) {
    breakBar.style.display = '';
    breakMinutesInput.value = getBreakMinutes();
  } else {
    breakBar.style.display = 'none';
  }
}

// ============ SESSION NOTES ============

function showNotesModal() {
  sessionNotesInput.value = '';
  notesModal.style.display = '';
  sessionNotesInput.focus();
}

function hideNotesModal() {
  notesModal.style.display = 'none';
}

notesSkipBtn.addEventListener('click', () => {
  pendingNotesSessionIndex = -1;
  hideNotesModal();
});

notesSaveBtn.addEventListener('click', () => {
  const notes = sessionNotesInput.value.trim();
  if (notes && pendingNotesSessionIndex >= 0 && pendingNotesSessionIndex < appData.sessions.length) {
    appData.sessions[pendingNotesSessionIndex].notes = notes;
    saveAppData();
  }
  pendingNotesSessionIndex = -1;
  hideNotesModal();
});

// Enter key saves notes (Shift+Enter for line break)
sessionNotesInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    notesSaveBtn.click();
  }
});

// ============ SHORTCUT OVERLAY ============

function toggleShortcutOverlay() {
  if (shortcutOverlay.style.display === 'none') {
    shortcutOverlay.style.display = '';
  } else {
    shortcutOverlay.style.display = 'none';
  }
}

shortcutOverlayClose.addEventListener('click', () => {
  shortcutOverlay.style.display = 'none';
});

shortcutOverlay.addEventListener('click', (e) => {
  if (e.target === shortcutOverlay) shortcutOverlay.style.display = 'none';
});

// ============ IDLE DETECTION ============

function showIdleModal() {
  idleModal.style.display = '';
}

function hideIdleModal() {
  idleModal.style.display = 'none';
}

idleDismissBtn.addEventListener('click', () => {
  hideIdleModal();
});

idleResumeBtn.addEventListener('click', () => {
  hideIdleModal();
  if (isRunning && isPaused) pauseTimer(); // Resume
});

window.electronAPI.on('idle-detected', () => {
  if (isRunning && !isPaused) {
    pauseTimer();
    timerStatus.textContent = 'idle — paused';
    showIdleModal();
  }
});

window.electronAPI.on('idle-resumed', () => {
  if (timerStatus.textContent === 'idle — paused') {
    timerStatus.textContent = 'paused';
  }
});

// ============ TASK LABEL DROPDOWN ============

function showDropdown() {
  const query = taskLabelInput.value.toLowerCase();
  const filtered = appData.labels.filter(l => l.toLowerCase().includes(query));
  if (filtered.length === 0) {
    taskDropdown.classList.remove('visible');
    return;
  }
  taskDropdown.innerHTML = filtered.map(l =>
    `<div class="task-dropdown-item">${l}</div>`
  ).join('');
  taskDropdown.classList.add('visible');

  taskDropdown.querySelectorAll('.task-dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      taskLabelInput.value = item.textContent;
      taskDropdown.classList.remove('visible');
    });
  });
}

taskLabelInput.addEventListener('focus', showDropdown);
taskLabelInput.addEventListener('input', showDropdown);
document.addEventListener('click', (e) => {
  if (!e.target.closest('.task-input-wrapper')) {
    taskDropdown.classList.remove('visible');
  }
});

// ============ EVENT LISTENERS ============

startBtn.addEventListener('click', () => {
  if (isRunning) {
    endTimer();
  } else {
    startTimer();
  }
});
pauseBtn.addEventListener('click', pauseTimer);
resetBtn.addEventListener('click', resetTimer);

setCustomBtn.addEventListener('click', () => {
  const h = parseInt(inputHours.value) || 0;
  const m = parseInt(inputMinutes.value) || 0;
  const s = parseInt(inputSeconds.value) || 0;
  const total = h * 3600 + m * 60 + s;
  if (total > 0) {
    presetBtns.forEach(b => b.classList.remove('active'));
    setTime(total);
  }
});

presetBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const mins = parseInt(btn.dataset.minutes);
    presetBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setTime(mins * 60);
    inputHours.value = Math.floor(mins / 60);
    inputMinutes.value = mins % 60;
    inputSeconds.value = 0;
  });
});

[inputHours, inputMinutes, inputSeconds].forEach(input => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') setCustomBtn.click();
  });
});

// Break minutes input
breakMinutesInput.addEventListener('change', () => {
  const val = Math.max(1, Math.min(60, parseInt(breakMinutesInput.value) || 15));
  breakMinutesInput.value = val;
  settings.timer.breakTimer.breakMinutes = val;
  saveAppData();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Don't trigger if typing in an input or textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  // ? — show shortcuts overlay
  if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
    e.preventDefault();
    toggleShortcutOverlay();
    return;
  }

  // Escape — close overlays or minimize
  if (e.code === 'Escape') {
    if (shortcutOverlay.style.display !== 'none') {
      shortcutOverlay.style.display = 'none';
      return;
    }
    if (notesModal.style.display !== 'none') {
      hideNotesModal();
      pendingNotesSessionIndex = -1;
      return;
    }
    if (idleModal.style.display !== 'none') {
      hideIdleModal();
      return;
    }
    if (isRunning) {
      window.electronAPI.send('timer-is-running', true);
    } else {
      window.electronAPI.send('window-minimize');
    }
    return;
  }

  // Space — start/pause
  if (e.code === 'Space') {
    e.preventDefault();
    if (isRunning) pauseTimer();
    else startTimer();
    return;
  }

  // Ctrl+R — reset
  if (e.ctrlKey && !e.shiftKey && e.code === 'KeyR') {
    e.preventDefault();
    resetTimer();
    return;
  }

  // Ctrl+Shift+E — end session
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyE') {
    e.preventDefault();
    endTimer();
    return;
  }
});

// View switching with dynamic window width
const COMPACT_WIDTH = 460;
const FULL_WIDTH = 900;

navIcons.forEach(icon => {
  icon.addEventListener('click', () => {
    const viewId = icon.dataset.view;
    navIcons.forEach(n => n.classList.remove('active'));
    icon.classList.add('active');
    views.forEach(v => v.classList.remove('active'));
    document.getElementById(viewId + 'View').classList.add('active');

    // Resize window: compact for timer, full for everything else
    if (viewId === 'timer') {
      window.electronAPI.send('set-window-width', COMPACT_WIDTH);
    } else {
      window.electronAPI.send('set-window-width', FULL_WIDTH);
    }

    if (viewId === 'dashboard') refreshDashboard();
    if (viewId === 'goals') refreshGoals();
  });
});

// IPC handlers
window.electronAPI.on('check-timer-running', () => {
  window.electronAPI.send('timer-is-running', isRunning);
});

window.electronAPI.on('check-timer-running-or-minimize', () => {
  if (isRunning) {
    window.electronAPI.send('timer-is-running', true);
  } else {
    window.electronAPI.send('window-minimize');
  }
});

window.electronAPI.on('remote-pause', () => pauseTimer());
window.electronAPI.on('remote-end', () => endTimer());
window.electronAPI.on('remote-reset', () => resetTimer());

// Save mini timer drag position
window.electronAPI.on('mini-position-saved', (position) => {
  settings.miniTimer.position = { x: position.x, y: position.y };
  saveAppData();
});

// ============ SETTINGS ============

function applySettings() {
  // Theme
  applyTheme(settings.appearance.theme, settings.appearance.accentColor);

  // Always on top
  window.electronAPI.send('set-always-on-top', settings.general.alwaysOnTop);

  // Break bar visibility
  updateBreakBar();

  // Idle detection
  window.electronAPI.send('set-idle-detection', {
    enabled: settings.timer.idleDetection.enabled,
    timeoutMinutes: settings.timer.idleDetection.timeoutMinutes,
  });

  // Populate settings UI
  populateSettingsUI();
}

function populateSettingsUI() {
  // General
  document.getElementById('settAlwaysOnTop').checked = settings.general.alwaysOnTop;

  // Timer
  document.getElementById('settBreakTimer').checked = settings.timer.breakTimer.enabled;
  document.getElementById('settSessionNotes').checked = settings.timer.sessionNotes.enabled;
  document.getElementById('settIdleDetection').checked = settings.timer.idleDetection.enabled;
  document.getElementById('settIdleTimeoutRow').style.display = settings.timer.idleDetection.enabled ? '' : 'none';
  document.getElementById('settIdleTimeout').value = settings.timer.idleDetection.timeoutMinutes;

  // Appearance
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === settings.appearance.theme);
  });
  document.querySelectorAll('.accent-swatch').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.accent === settings.appearance.accentColor);
  });
  // Goals
  document.getElementById('settDailyGoal').value = settings.goals.dailyHours;
  document.getElementById('settWeeklyGoal').value = settings.goals.weeklyHours;
  document.getElementById('settWeeklyReport').checked = settings.weeklyReport.enabled;

  // Data path
  window.electronAPI.invoke('get-data-path').then(p => {
    document.getElementById('settDataPath').textContent = p;
  });
}

function initSettingsBindings() {
  // Always on top
  document.getElementById('settAlwaysOnTop').addEventListener('change', (e) => {
    settings.general.alwaysOnTop = e.target.checked;
    window.electronAPI.send('set-always-on-top', e.target.checked);
    saveAppData();
  });

  // Break timer toggle
  document.getElementById('settBreakTimer').addEventListener('change', (e) => {
    settings.timer.breakTimer.enabled = e.target.checked;
    updateBreakBar();
    saveAppData();
  });

  // Session notes
  document.getElementById('settSessionNotes').addEventListener('change', (e) => {
    settings.timer.sessionNotes.enabled = e.target.checked;
    saveAppData();
  });

  // Idle detection toggle
  document.getElementById('settIdleDetection').addEventListener('change', (e) => {
    settings.timer.idleDetection.enabled = e.target.checked;
    document.getElementById('settIdleTimeoutRow').style.display = e.target.checked ? '' : 'none';
    window.electronAPI.send('set-idle-detection', {
      enabled: e.target.checked,
      timeoutMinutes: settings.timer.idleDetection.timeoutMinutes,
    });
    saveAppData();
  });

  // Idle timeout
  document.getElementById('settIdleTimeout').addEventListener('change', (e) => {
    const val = Math.max(1, Math.min(60, parseInt(e.target.value) || 10));
    settings.timer.idleDetection.timeoutMinutes = val;
    e.target.value = val;
    window.electronAPI.send('set-idle-detection', {
      enabled: settings.timer.idleDetection.enabled,
      timeoutMinutes: val,
    });
    saveAppData();
  });

  // Theme toggle
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
      settings.appearance.theme = btn.dataset.theme;
      document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyTheme(settings.appearance.theme, settings.appearance.accentColor);
      saveAppData();
    });
  });

  // Accent picker
  document.querySelectorAll('.accent-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      settings.appearance.accentColor = btn.dataset.accent;
      document.querySelectorAll('.accent-swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyTheme(settings.appearance.theme, settings.appearance.accentColor);
      saveAppData();
    });
  });

  // Goals
  document.getElementById('settDailyGoal').addEventListener('change', (e) => {
    settings.goals.dailyHours = parseFloat(e.target.value) || 4;
    saveAppData();
  });
  document.getElementById('settWeeklyGoal').addEventListener('change', (e) => {
    settings.goals.weeklyHours = parseInt(e.target.value) || 20;
    saveAppData();
  });

  // Weekly report
  document.getElementById('settWeeklyReport').addEventListener('change', (e) => {
    settings.weeklyReport.enabled = e.target.checked;
    saveAppData();
  });
}

// ============ DASHBOARD ============

function refreshDashboard() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Week start (Monday)
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - mondayOffset);
  weekStart.setHours(0, 0, 0, 0);

  const todaySessions = appData.sessions.filter(s => s.date === today);
  const weekSessions = appData.sessions.filter(s => new Date(s.date) >= weekStart);

  const todaySecs = todaySessions.reduce((a, s) => a + s.duration, 0);
  const weekSecs = weekSessions.reduce((a, s) => a + s.duration, 0);

  dashTodayHours.textContent = formatDuration(todaySecs);
  dashWeekHours.textContent = formatDuration(weekSecs);
  dashTotalSessions.textContent = appData.sessions.length;

  // Top task
  const taskMap = {};
  appData.sessions.forEach(s => {
    taskMap[s.label] = (taskMap[s.label] || 0) + s.duration;
  });
  const sorted = Object.entries(taskMap).sort((a, b) => b[1] - a[1]);
  dashTopTask.textContent = sorted.length > 0 ? sorted[0][0] : '—';

  // Task breakdown table
  renderTaskTable(sorted);

  // Chart
  updateChart(currentChartRange);

  // Session history
  renderSessionHistory();
}

function renderTaskTable(sorted) {
  const totalSecs = sorted.reduce((a, [, d]) => a + d, 0);
  const headerRow = taskTable.querySelector('.task-header');
  taskTable.innerHTML = '';
  taskTable.appendChild(headerRow);

  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No sessions yet. Start a timer to track your work.';
    taskTable.appendChild(empty);
    return;
  }

  sorted.forEach(([label, secs]) => {
    const sessions = appData.sessions.filter(s => s.label === label).length;
    const pct = totalSecs > 0 ? Math.round((secs / totalSecs) * 100) : 0;
    const row = document.createElement('div');
    row.className = 'task-row';
    row.innerHTML = `
      <span class="task-name">${label}</span>
      <span>${formatDuration(secs)}</span>
      <span>${sessions}</span>
      <span>${pct}%</span>
    `;
    taskTable.appendChild(row);
  });
}

function renderSessionHistory() {
  const sessionHistory = document.getElementById('sessionHistory');
  const sessionList = document.getElementById('sessionList');
  if (!sessionHistory || !sessionList) return;

  // Show last 20 sessions, newest first
  const recent = appData.sessions.slice(-20).reverse();
  if (recent.length === 0) {
    sessionHistory.style.display = 'none';
    return;
  }

  sessionHistory.style.display = '';
  sessionList.innerHTML = '';

  recent.forEach(s => {
    // Find the actual index in appData.sessions
    const actualIndex = appData.sessions.indexOf(s);
    const item = document.createElement('div');
    item.className = 'session-item';
    const startTime = new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const notesHtml = s.notes ? `<div class="session-item-notes">${escapeHtml(s.notes)}</div>` : '';
    item.innerHTML = `
      <div class="session-item-main">
        <span class="session-item-label">${escapeHtml(s.label)}</span>
        <span class="session-item-time">${s.date} at ${startTime}</span>
        ${notesHtml}
      </div>
      <div class="session-item-right">
        <span class="session-item-duration">${formatDuration(s.duration)}</span>
        <button class="session-delete-btn" data-index="${actualIndex}" title="Delete session">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `;
    sessionList.appendChild(item);
  });

  // Attach delete handlers
  sessionList.querySelectorAll('.session-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      if (idx >= 0 && idx < appData.sessions.length) {
        appData.sessions.splice(idx, 1);
        saveAppData();
        updateStats();
        refreshDashboard();
      }
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function updateChart(range) {
  currentChartRange = range;
  const { labels, data } = getChartData(range);

  if (historyChart) historyChart.destroy();

  // Read theme-aware colors from CSS variables
  const barColor = getThemeColor('--color-chart-bar') || 'rgba(255,255,255,0.15)';
  const barHover = getThemeColor('--color-chart-bar-hover') || 'rgba(255,255,255,0.3)';
  const gridColor = getThemeColor('--color-chart-grid') || '#111111';
  const tickColor = getThemeColor('--color-chart-tick') || '#333333';
  const tooltipBg = getThemeColor('--color-bg-elevated') || '#1a1a1a';
  const tooltipBorder = getThemeColor('--color-border-primary') || '#222';
  const tooltipTitle = getThemeColor('--color-text-secondary') || '#888';
  const tooltipBody = getThemeColor('--color-text-primary') || '#fff';

  const ctx = document.getElementById('historyChart').getContext('2d');
  historyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: barColor,
        hoverBackgroundColor: barHover,
        borderRadius: 3,
        borderSkipped: false,
        maxBarThickness: 32,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipTitle,
          bodyColor: tooltipBody,
          borderColor: tooltipBorder,
          borderWidth: 1,
          cornerRadius: 6,
          padding: 10,
          titleFont: { size: 10, weight: '400' },
          bodyFont: { size: 12, weight: '500' },
          callbacks: {
            label: (ctx) => {
              const hrs = ctx.parsed.y;
              const h = Math.floor(hrs);
              const m = Math.round((hrs - h) * 60);
              return h > 0 ? `${h}h ${m}m` : `${m}m`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: tickColor, font: { size: 10, family: 'Inter' } },
        },
        y: {
          grid: { color: gridColor, drawBorder: false },
          border: { display: false },
          ticks: {
            color: tickColor,
            font: { size: 10, family: 'Inter' },
            callback: (v) => v + 'h',
          },
          beginAtZero: true,
        },
      },
    },
  });
}

function getChartData(range) {
  const now = new Date();
  let labels = [];
  let data = [];

  if (range === 'daily') {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const dayLabel = d.toLocaleDateString('en', { weekday: 'short', day: 'numeric' });
      labels.push(dayLabel);
      const secs = appData.sessions.filter(s => s.date === key).reduce((a, s) => a + s.duration, 0);
      data.push(secs / 3600);
    }
  } else if (range === 'weekly') {
    for (let i = 11; i >= 0; i--) {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() - i * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);
      const startStr = weekStart.toISOString().split('T')[0];
      const endStr = weekEnd.toISOString().split('T')[0];
      labels.push(`W${12 - i}`);
      const secs = appData.sessions.filter(s => s.date >= startStr && s.date <= endStr).reduce((a, s) => a + s.duration, 0);
      data.push(secs / 3600);
    }
  } else if (range === 'monthly') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const monthKey = `${year}-${month}`;
      labels.push(d.toLocaleDateString('en', { month: 'short' }));
      const secs = appData.sessions.filter(s => s.date.startsWith(monthKey)).reduce((a, s) => a + s.duration, 0);
      data.push(secs / 3600);
    }
  } else if (range === 'yearly') {
    for (let i = 4; i >= 0; i--) {
      const year = now.getFullYear() - i;
      labels.push(String(year));
      const secs = appData.sessions.filter(s => s.date.startsWith(String(year))).reduce((a, s) => a + s.duration, 0);
      data.push(secs / 3600);
    }
  }

  return { labels, data };
}

// Chart tab switching
chartTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    chartTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    updateChart(tab.dataset.range);
  });
});

// Export CSV
exportCsvBtn.addEventListener('click', async () => {
  if (appData.sessions.length === 0) return;

  let csv = 'Date,Start,End,Duration (min),Label,Notes\n';
  appData.sessions.forEach(s => {
    const startTime = new Date(s.start).toLocaleTimeString();
    const endTime = new Date(s.end).toLocaleTimeString();
    const mins = Math.round(s.duration / 60);
    const notes = (s.notes || '').replace(/"/g, '""');
    csv += `${s.date},${startTime},${endTime},${mins},"${s.label}","${notes}"\n`;
  });

  await window.electronAPI.invoke('export-csv', csv);
});

// ============ GOALS ============

const MOTIVATIONAL_QUOTES = [
  '"The secret of getting ahead is getting started." — Mark Twain',
  '"Focus is not about saying yes. It\'s about saying no." — Steve Jobs',
  '"It is during our darkest moments that we must focus to see the light." — Aristotle',
  '"Concentrate all your thoughts upon the work at hand." — Alexander Graham Bell',
  '"The successful warrior is the average man, with laser-like focus." — Bruce Lee',
  '"Where focus goes, energy flows." — Tony Robbins',
  '"Do not dwell in the past. Do not dream of the future. Concentrate on the present." — Buddha',
  '"You can always find a distraction if you\'re looking for one." — Tom Kite',
  '"The main thing is to keep the main thing the main thing." — Stephen Covey',
  '"Lack of direction, not lack of time, is the problem." — Zig Ziglar',
  '"Your focus determines your reality." — Qui-Gon Jinn',
  '"The shorter way to do many things is to do one thing at a time." — Mozart',
  '"Starve your distractions. Feed your focus." — Unknown',
  '"It\'s not that I\'m so smart, it\'s just that I stay with problems longer." — Albert Einstein',
  '"Energy flows where attention goes." — Michael Beckwith',
  '"Deep work is the ability to focus without distraction on a cognitively demanding task." — Cal Newport',
  '"The ability to concentrate was the most important talent in my success." — John D. Rockefeller',
  '"Nothing can add more power to your life than concentrating your energies." — Nido Qubein',
  '"People think focus means saying yes. But it means saying no to the 100 other good ideas." — Steve Jobs',
  '"What you stay focused on will grow." — Roy T. Bennett',
  '"Be where you are, not where you think you should be." — Unknown',
  '"Small daily improvements are the key to staggering long-term results." — Unknown',
  '"Discipline is choosing between what you want now and what you want most." — Abraham Lincoln',
  '"A year from now you may wish you had started today." — Karen Lamb',
  '"The only way to do great work is to love what you do." — Steve Jobs',
  '"Action is the foundational key to all success." — Pablo Picasso',
  '"Amateurs sit and wait for inspiration. The rest of us just get up and go to work." — Stephen King',
  '"You don\'t have to be great to start, but you have to start to be great." — Zig Ziglar',
  '"Don\'t count the days, make the days count." — Muhammad Ali',
  '"Productivity is never an accident. It is always the result of intelligent effort." — Paul J. Meyer',
];

function refreshGoals() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Week boundaries (Monday–Sunday)
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - mondayOffset);
  weekStart.setHours(0, 0, 0, 0);

  // Daily progress
  const todaySecs = appData.sessions.filter(s => s.date === today).reduce((a, s) => a + s.duration, 0);
  const todayHrs = todaySecs / 3600;
  const dailyGoal = settings.goals.dailyHours;
  const dailyPct = Math.min(100, (todayHrs / dailyGoal) * 100);
  document.getElementById('goalDailyValue').textContent = `${todayHrs.toFixed(1)}h / ${dailyGoal}h`;
  document.getElementById('goalDailyFill').style.width = dailyPct + '%';

  // Weekly progress
  const weekSecs = appData.sessions.filter(s => new Date(s.date) >= weekStart).reduce((a, s) => a + s.duration, 0);
  const weekHrs = weekSecs / 3600;
  const weeklyGoal = settings.goals.weeklyHours;
  const weeklyPct = Math.min(100, (weekHrs / weeklyGoal) * 100);
  document.getElementById('goalWeeklyValue').textContent = `${weekHrs.toFixed(1)}h / ${weeklyGoal}h`;
  document.getElementById('goalWeeklyFill').style.width = weeklyPct + '%';

  // Streak (consecutive days meeting daily goal, going backwards from today)
  let streak = 0;
  const checkDate = new Date(now);
  checkDate.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const dateStr = checkDate.toISOString().split('T')[0];
    const daySecs = appData.sessions.filter(s => s.date === dateStr).reduce((a, s) => a + s.duration, 0);
    if (daySecs / 3600 >= dailyGoal) {
      streak++;
    } else {
      // If it's today and they haven't reached the goal yet, don't break the streak
      if (i === 0) {
        checkDate.setDate(checkDate.getDate() - 1);
        continue;
      }
      break;
    }
    checkDate.setDate(checkDate.getDate() - 1);
  }
  document.getElementById('goalStreakValue').textContent = streak;

  // Best day
  const dayMap = {};
  appData.sessions.forEach(s => { dayMap[s.date] = (dayMap[s.date] || 0) + s.duration; });
  const bestDaySecs = Math.max(0, ...Object.values(dayMap));
  document.getElementById('goalBestDayValue').textContent = formatDuration(bestDaySecs);

  // Best week (iterate all sessions, group by ISO week)
  const weekMap = {};
  appData.sessions.forEach(s => {
    const d = new Date(s.date);
    const day = d.getDay();
    const mondayOff = day === 0 ? 6 : day - 1;
    const monday = new Date(d);
    monday.setDate(d.getDate() - mondayOff);
    const weekKey = monday.toISOString().split('T')[0];
    weekMap[weekKey] = (weekMap[weekKey] || 0) + s.duration;
  });
  const bestWeekSecs = Math.max(0, ...Object.values(weekMap));
  document.getElementById('goalBestWeekValue').textContent = formatDuration(bestWeekSecs);

  // Weekly comparison
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekStart);
  lastWeekEnd.setTime(lastWeekEnd.getTime() - 1);
  const lastWeekSecs = appData.sessions.filter(s => {
    const d = new Date(s.date);
    return d >= lastWeekStart && d < weekStart;
  }).reduce((a, s) => a + s.duration, 0);
  const lastWeekHrs = lastWeekSecs / 3600;

  const maxHrs = Math.max(weekHrs, lastWeekHrs, 1);
  document.getElementById('compThisWeekFill').style.width = (weekHrs / maxHrs * 100) + '%';
  document.getElementById('compThisWeekValue').textContent = weekHrs.toFixed(1) + 'h';
  document.getElementById('compLastWeekFill').style.width = (lastWeekHrs / maxHrs * 100) + '%';
  document.getElementById('compLastWeekValue').textContent = lastWeekHrs.toFixed(1) + 'h';

  const compChangeEl = document.getElementById('compChange');
  if (lastWeekHrs > 0) {
    const pctChange = ((weekHrs - lastWeekHrs) / lastWeekHrs * 100).toFixed(0);
    if (pctChange > 0) {
      compChangeEl.textContent = `+${pctChange}% vs last week`;
      compChangeEl.className = 'comparison-change positive';
    } else if (pctChange < 0) {
      compChangeEl.textContent = `${pctChange}% vs last week`;
      compChangeEl.className = 'comparison-change negative';
    } else {
      compChangeEl.textContent = 'Same as last week';
      compChangeEl.className = 'comparison-change';
    }
  } else {
    compChangeEl.textContent = '';
    compChangeEl.className = 'comparison-change';
  }

  // Heat map — last 91 days (13 weeks)
  renderHeatmap();

  // Daily quote
  const dayIndex = Math.floor(Date.now() / 86400000) % MOTIVATIONAL_QUOTES.length;
  document.getElementById('dailyQuoteText').textContent = MOTIVATIONAL_QUOTES[dayIndex];
}

function renderHeatmap() {
  const container = document.getElementById('heatmapContainer');
  container.innerHTML = '';

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Build day map
  const dayMap = {};
  appData.sessions.forEach(s => { dayMap[s.date] = (dayMap[s.date] || 0) + s.duration; });

  // Start from 90 days ago, aligned to start of week (Monday)
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 90);
  // Align to Monday
  const startDay = startDate.getDay();
  const startMondayOff = startDay === 0 ? 6 : startDay - 1;
  startDate.setDate(startDate.getDate() - startMondayOff);

  const dailyGoalSecs = settings.goals.dailyHours * 3600;
  const cursor = new Date(startDate);

  while (cursor <= now) {
    const dateStr = cursor.toISOString().split('T')[0];
    const secs = dayMap[dateStr] || 0;

    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.title = `${dateStr}: ${formatDuration(secs)}`;

    // Intensity levels based on fraction of daily goal
    if (secs > 0) {
      const ratio = secs / dailyGoalSecs;
      if (ratio >= 1) cell.classList.add('level-4');
      else if (ratio >= 0.75) cell.classList.add('level-3');
      else if (ratio >= 0.5) cell.classList.add('level-2');
      else cell.classList.add('level-1');
    }

    container.appendChild(cell);
    cursor.setDate(cursor.getDate() + 1);
  }
}

// ============ AUTO-UPDATER ============

window.electronAPI.on('update-available', () => {
  // Show a subtle toast notification in the app
  const toast = document.createElement('div');
  toast.id = 'updateToast';
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 9999;
    background: #1a1a1a; border: 1px solid rgba(232,255,71,0.3);
    border-radius: 8px; padding: 14px 18px;
    font-family: 'DM Sans', 'Inter', sans-serif; font-size: 13px;
    color: #e8ff47; display: flex; align-items: center; gap: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    animation: slideIn 0.3s ease;
  `;
  toast.innerHTML = `
    <style>@keyframes slideIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }</style>
    <span>⬇</span>
    <span>Update downloading in background...</span>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
});

window.electronAPI.on('update-downloaded', () => {
  const existing = document.getElementById('updateToast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 9999;
    background: #1a1a1a; border: 1px solid rgba(232,255,71,0.5);
    border-radius: 8px; padding: 14px 18px;
    font-family: 'DM Sans', 'Inter', sans-serif; font-size: 13px;
    color: #fff; display: flex; align-items: center; gap: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  `;
  toast.innerHTML = `
    <span style="color:#e8ff47">✓</span>
    <span>Update ready — installs when you quit.</span>
    <button onclick="window.electronAPI.send('install-update')" style="
      background: #e8ff47; color: #000; border: none; border-radius: 4px;
      padding: 6px 12px; font-size: 12px; font-weight: 500;
      cursor: pointer; white-space: nowrap;
    ">Restart now</button>
  `;
  document.body.appendChild(toast);
});

// ============ INIT ============

initSettingsBindings();

loadAppData().then(() => {
  updateDisplay();
  ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE;
});
