# FocusFlow — Claude Code Project Brief

> Read this file first before doing anything. It contains everything you need to know about this project, how it was built, what's been done, and what still needs doing.

---

## What Is FocusFlow?

FocusFlow is a **Windows desktop focus timer app** built with Electron. It was created by the owner for personal use and is being prepared for public release as a free download with a "Buy Me a Coffee" support option.

**Tagline:** Find Focus. Feel Flow.

The app is polished, fully functional, and visually professional. The owner is a "vibe coder" — not a traditional developer — who builds with Claude's help. Keep explanations clear, avoid unnecessary jargon, and always explain *why* you're making a change, not just what you're changing.

---

## Project Location

```
G:\01 Projects\Internal Projects\Focus Flow\Dev
```

---

## Tech Stack

- **Electron** v28 — desktop app framework
- **HTML / CSS / Vanilla JS** — no frontend framework
- **Chart.js** v4 — for dashboard charts (loaded from node_modules, not CDN)
- **electron-builder** — builds the Windows installer (.exe)
- **electron-updater** — handles auto-updates via GitHub Releases

---

## File Structure

```
Dev/
├── main.js          — Main process: windows, tray, IPC handlers, auto-updater, idle detection
├── preload.js       — Secure IPC bridge (contextBridge) between main and renderer
├── renderer.js      — All UI logic, timer, sessions, charts, settings (~1400 lines)
├── index.html       — Main app window HTML
├── mini.html        — Floating mini timer window (160x160px transparent overlay)
├── styles.css       — All app styles, themes, accent colors
├── package.json     — Dependencies and electron-builder config
├── icon.png         — App icon
├── icon.ico         — App icon (Windows)
├── tray-icon.png    — System tray icon
├── node_modules/    — Dependencies (never edit, never commit)
└── dist/            — Built installers output (never edit)
```

---

## Features (Complete List)

### Timer
- Flexible timer: presets (30m, 60m, 90m, 2h, 3h) + custom hours/minutes/seconds
- Animated circular SVG progress ring
- Start / Pause / Resume / Reset / End session
- Break timer — auto-starts break after focus session, then auto-restarts focus
- Pomodoro session counting

### Mini Floating Timer
- 160×160px transparent circular overlay
- Stays above ALL windows using 'screen-saver' always-on-top level
- Draggable — saves position per monitor, restores on next launch
- Click to restore main window, right-click for context menu
- Shows time, progress ring, and status (focusing/break/paused)

### Session Tracking
- Labels with autocomplete dropdown (remembers past labels)
- Session notes modal after each session
- Saves to JSON file in user's AppData folder

### Dashboard
- Today / This Week / Total Sessions / Top Task stats
- Time History chart (Day/Week/Month/Year tabs) via Chart.js
- Task Breakdown table with hours, sessions, percentage
- CSV export

### Goals
- Daily and weekly hour goals with progress bars
- Day streak counter
- Best day / best week records
- Weekly comparison (this week vs last week) with % change
- Activity heatmap — last 90 days, GitHub-style, intensity based on daily goal %
- Daily motivational quote (rotates daily)
- Weekly report — optional Sunday notification with week summary

### Settings
- Always on Top toggle
- Break Timer toggle + break duration input
- Session Notes toggle
- Idle Detection toggle + timeout (auto-pauses timer when user is away)
- Theme: Dark / Light
- Accent colors: White, Blue, Green, Purple, Orange, Red
- Goals: daily hours, weekly hours
- Weekly Report toggle
- Data location display
- Keyboard shortcuts reference

### System Integration
- System tray icon with Pause/Resume/Reset/Show/Quit menu
- Desktop notifications on session complete + weekly report
- Global shortcut: Ctrl+Shift+F (show/hide)
- Single instance lock
- Hides from taskbar when timer is running (prevents Chromium throttling freeze)
- Animated window resize when switching compact ↔ full width views

### Auto-Updater
- Uses electron-updater + GitHub Releases
- Checks silently on launch (5 second delay)
- Shows in-app toast when update is available / downloaded
- "Restart now" button in toast triggers install

---

## Security Architecture (Important — Already Implemented)

The app uses **secure Electron settings**:
- `nodeIntegration: false`
- `contextIsolation: true`
- `preload: preload.js`

This means renderer files (`renderer.js`, `mini.html`) do NOT use `require('electron')`. Instead they use `window.electronAPI` which is exposed by `preload.js` via `contextBridge`.

**Pattern to always use in renderer files:**
```js
// ✅ Correct
window.electronAPI.send('channel-name', data);
window.electronAPI.on('channel-name', (data) => { ... });   // NOTE: no 'event' param
window.electronAPI.invoke('channel-name', data);

// ❌ Never do this in renderer files
const { ipcRenderer } = require('electron');
ipcRenderer.send(...);
```

**Important:** The `on()` callbacks receive data directly — NOT `(event, data)`. The preload strips the event object. Always write `(data) => {}` not `(event, data) => {}`.

**Chart.js** is loaded via script tag in `index.html` from node_modules — NOT via require():
```html
<script src="node_modules/chart.js/dist/chart.umd.js"></script>
```

---

## Auto-Updater Setup (TODO — Not Yet Configured)

Two placeholders need to be filled in before building for release:

**In `main.js`** (around line 15):
```js
owner: 'YOUR_GITHUB_USERNAME',
repo: 'YOUR_REPO_NAME',
```

**In `package.json`** (in the "publish" section):
```json
"owner": "YOUR_GITHUB_USERNAME",
"repo": "YOUR_REPO_NAME"
```

**Workflow for releasing updates:**
1. Make changes to the app
2. Bump version in `package.json` (e.g. `"version": "3.0.1"`)
3. Run `npm run release` — builds installer AND publishes to GitHub Releases automatically
4. Users with the app installed get a silent notification on next launch

---

## Landing Page

A standalone `focusflow-landing.html` file exists (single file, no dependencies).

**Two placeholders to update before going live:**
- Buy Me a Coffee URL: search for `https://www.buymeacoffee.com/` and replace with real URL
- Feedback form endpoint: search for `YOUR_FORM_ID` and replace with Formspree form ID (free at formspree.io)
- Download button: search for `href="#"` on the big download button and replace with Gumroad or direct link

**Hosting:** Deploy to GitHub Pages (free). Just push the HTML file to a repo and enable Pages in settings.

---

## What's Been Done (v3.0.0)

- [x] Full timer with presets, custom time, break timer
- [x] Mini floating overlay timer
- [x] Session tracking with labels, notes, CSV export
- [x] Dashboard with Chart.js charts
- [x] Goals view with heatmap, streaks, weekly comparison
- [x] Settings with theme, accent, idle detection, goals
- [x] System tray, notifications, global shortcut
- [x] Security fix (contextIsolation + preload)
- [x] Auto-updater wired up (needs GitHub details filled in)
- [x] Landing page with feedback form

---

## What Still Needs Doing

- [ ] Fill in GitHub username + repo name in `main.js` and `package.json`
- [ ] Set up GitHub repo for releases
- [ ] Create Formspree account, get form ID, update landing page
- [ ] Create Buy Me a Coffee account, update landing page links
- [ ] Set up Gumroad listing (free download) or direct GitHub download link
- [ ] Deploy landing page to GitHub Pages
- [ ] Test full build: `npm run build` and install the .exe
- [ ] Test auto-updater end-to-end with a version bump

---

## Owner Preferences & Style Notes

- **Vibe coder** — built with Claude, not a traditional developer
- Prefers clear explanations of *why* changes are made
- App aesthetic: dark, minimal, premium — like Notion/Linear
- Wants the app to stay simple and not get bloated
- Updates driven by personal use — ships when something genuinely needs fixing
- Monetization: free download + "Buy Me a Coffee" (no pressure, no subscriptions)
- Tone: casual and direct, not overly formal

---

## Commands

```bash
npm start          # Run app in development mode
npm run build      # Build Windows installer to /dist
npm run release    # Build AND publish to GitHub Releases (for updates)
npm install        # Reinstall dependencies (after cloning or after package.json changes)
```

---

## Known Quirks & Notes

- The `node_modules` folder should never be committed to git — it's in `.gitignore`
- `dist/` folder contains old build versions (2.0.0 through 3.0.0) — safe to clean up
- `generate-icon.js`, `generate-icon-v2.js`, `generate-icon-v3.js` — old utility scripts, can be deleted
- `_writer.js` — old utility script, can be deleted
- `nul` file in root — unknown leftover, can be deleted
- The `icon-options.html` file is a dev utility for previewing icon designs, not part of the app
- Always test `npm start` after any changes before building
- The app hides from taskbar when timer is running — this is intentional to prevent a Chromium freeze bug
