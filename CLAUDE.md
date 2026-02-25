# FocusFlow — Claude Code Project Brief

> Read this file first before doing anything. It contains everything you need to know about this project, how it was built, what's been done, and what still needs doing.

---

## What Is FocusFlow?

FocusFlow is a **Windows desktop focus timer app** built with Electron. It is live and publicly available as a free/pay-what-you-want download via Gumroad, with a landing page at focusflow-app.com.

**Tagline:** Find Focus. Feel Flow.

The app is polished, fully functional, and visually professional. The owner is a "vibe coder" — not a traditional developer — who builds with Claude's help. Keep explanations clear, avoid unnecessary jargon, and always explain *why* you're making a change, not just what you're changing.

---

## Project Location

```
G:\01 Projects\Internal Projects\Focus Flow\Dev   ← app source code
G:\01 Projects\Internal Projects\Focus Flow\Site  ← landing page (focusflow-site repo)
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
├── focusflow-landing.html — Landing page source (also copied to Site/ for deployment)
├── node_modules/    — Dependencies (never edit, never commit)
└── dist/            — Built installers output (never edit, never commit)

Site/
├── index.html       — Landing page (copy of focusflow-landing.html)
└── icon.png         — Favicon for the landing page
```

---

## Accounts & Services

| Service | Details |
|---|---|
| **GitHub (app repo)** | `github.com/ecstoria/FocusFlow` — public repo, source code |
| **GitHub (landing page repo)** | `github.com/ecstoria/focusflow-site` — public repo, GitHub Pages |
| **GitHub username** | `ecstoria` |
| **Landing page** | `focusflow-app.com` → hosted on GitHub Pages via `focusflow-site` repo |
| **Domain registrar** | Namecheap — `focusflow-app.com` |
| **Gumroad** | `ecstoria.gumroad.com/l/uiomcc` — free/pay-what-you-want download |
| **Formspree** | `formspree.io/f/mlgwlowj` — feedback form, sends to `hello@ecstoria.com` |
| **GH_TOKEN** | Set as system environment variable for `npm run release` |

> **Note:** Formspree email is currently `hello@ecstoria.com` on Microsoft email. Update to a Google Workspace alias when migrating.

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
- Accent colors: White, Blue, Green, Purple, Orange, Red, **Lime (#e8ff47)**
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
- Uses electron-updater + GitHub Releases (`ecstoria/FocusFlow`)
- Checks silently on launch (5 second delay)
- Shows in-app toast when update is available / downloaded
- "Restart now" button in toast triggers install
- `npm run release` builds, publishes, AND auto-publishes (no manual draft step needed)

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

## Auto-Updater Setup (Fully Configured ✅)

Already configured and working end-to-end.

**In `main.js`:**
```js
owner: 'ecstoria',
repo: 'FocusFlow',
```

**In `package.json`:**
```json
"owner": "ecstoria",
"repo": "FocusFlow"
```

**Release workflow:**
1. Make changes to the app
2. Bump version in `package.json` (e.g. `"version": "3.0.6"`)
3. Run `npm run release` — builds installer, publishes to GitHub Releases, auto-publishes (no draft)
4. Users with the app installed get a silent notification on next launch + "Restart now" button

---

## Landing Page

Lives in two places:
- **Source:** `Dev/focusflow-landing.html`
- **Deployed:** `Site/index.html` → `github.com/ecstoria/focusflow-site` → `focusflow-app.com`

**When you update the landing page:**
1. Edit `Dev/focusflow-landing.html`
2. Copy it to `Site/index.html`
3. Commit and push in the `Site/` folder

**Live links already configured:**
- Gumroad download: `https://ecstoria.gumroad.com/l/uiomcc`
- Formspree feedback: `https://formspree.io/f/mlgwlowj`

---

## What's Been Done (v3.0.6)

- [x] Full timer with presets, custom time, break timer
- [x] Mini floating overlay timer
- [x] Session tracking with labels, notes, CSV export
- [x] Dashboard with Chart.js charts
- [x] Goals view with heatmap, streaks, weekly comparison
- [x] Settings with theme, accent, idle detection, goals
- [x] Lime accent color (#e8ff47) added — matches landing page brand color
- [x] System tray, notifications, global shortcut
- [x] Security fix (contextIsolation + preload)
- [x] Auto-updater fully working (ecstoria/FocusFlow on GitHub)
- [x] Landing page live at focusflow-app.com
- [x] Custom domain (focusflow-app.com) via Namecheap + GitHub Pages
- [x] Gumroad listing live (free/pay-what-you-want)
- [x] Formspree feedback form connected (hello@ecstoria.com)
- [x] GitHub CLI installed, `npm run release` fully automated
- [x] Favicon added to landing page

---

## What Still Needs Doing

- [ ] Update Formspree email to a dedicated alias when migrating to Google Workspace
- [ ] Update Gumroad `.exe` file if a new major version is released (auto-updater handles minor updates)

---

## Future Ideas

> Ideas discussed and filtered. None of these are committed — just captured for future sessions. Value Score = how much value this feature adds to users (1-5 stars).

| # | Idea | Priority | Complexity | Market Value | Value Score | Notes |
|---|---|---|---|---|---|---|
| 1 | **365 day heatmap** | High | Low | Medium | ⭐⭐⭐⭐ | Extend 90-day heatmap to full year. Easy win, very satisfying for users. |
| 2 | **Rectangle mini timer option** | Low | Low | Low | ⭐⭐ | Shape choice in Settings. Nice to have — circle stays default. |
| 3 | **Categories & subcategories** | Medium | High | High | ⭐⭐⭐⭐ | Hierarchical labels e.g. Work → Sales. Dashboard filters by category. Touches data structure + entire dashboard. |
| 4 | **Mac desktop app** | Medium | Low | High | ⭐⭐⭐⭐⭐ | Electron already supports Mac. Doubles audience with minimal effort. |
| 5 | **Mobile companion app** | Low (future) | Very High | Very High | ⭐⭐⭐⭐⭐ | Android first. Physical desk companion, blocks distractions, syncs with desktop. Unique — nothing like it exists. |
| 6 | **Calendar & task integration** | Medium | High | Very High | ⭐⭐⭐⭐⭐ | Sync Google Calendar / Todoist. Pull today's tasks as quick-start labels. Bridge between planning and doing. Requires OAuth. |
| 7 | **Ambient sounds** | Medium | Low | High | ⭐⭐⭐⭐ | Rain, white noise, lo-fi during focus sessions. Optional. Huge in focus apps right now. |
| 8 | **Session summary screen** | Medium | Low | High | ⭐⭐⭐⭐ | Beautiful end-of-session card: time focused, task, motivational line. Makes completing sessions feel rewarding. |
| 9 | **Extended keyboard shortcuts** | Low | Low | Medium | ⭐⭐⭐ | Full keyboard control — start/pause/end without mouse. Power user favourite. |
| 10 | **Focus score** | Low | Medium | Medium | ⭐⭐⭐ | Daily score based on sessions vs goal, streak, consistency. Gamifies the habit without being annoying. |
| 11 | **Spotify integration** | Low | Medium | Medium | ⭐⭐⭐ | Music starts when session starts, pauses when done. Simple but delightful. |
| 12 | **FocusFlow Pro tier** | Low (future) | High | Very High | ⭐⭐⭐⭐⭐ | Free stays free. Pro unlocks power features (categories, integrations, sync). Sustainable monetization path as app grows. |

---

## Owner Preferences & Style Notes

- **Vibe coder** — built with Claude, not a traditional developer
- Prefers clear explanations of *why* changes are made
- App aesthetic: dark, minimal, premium — like Notion/Linear
- Landing page accent color: `#e8ff47` (lime/yellow-green)
- Wants the app to stay simple and not get bloated
- Updates driven by personal use — ships when something genuinely needs fixing
- Monetization: free/pay-what-you-want on Gumroad
- Tone: casual and direct, not overly formal

---

## Commands

```bash
npm start          # Run app in development mode
npm run build      # Build Windows installer to /dist
npm run release    # Build AND publish to GitHub Releases (auto-publishes, no draft step)
npm install        # Reinstall dependencies (after cloning or after package.json changes)
```

**To deploy landing page updates:**
```bash
# After editing Dev/focusflow-landing.html, copy it to Site and push:
cd "G:\01 Projects\Internal Projects\Focus Flow\Site"
git add .
git commit -m "Update landing page"
git push
```

---

## Known Quirks & Notes

- The `node_modules` and `dist` folders are in `.gitignore` — never commit them
- The `Site/` folder is a separate git repo (`focusflow-site`) — it only contains `index.html` and `icon.png`
- Always test `npm start` after any changes before building
- The app hides from taskbar when timer is running — this is intentional to prevent a Chromium freeze bug
- Auto-updater does NOT run in dev mode (`npm start`) — only works in the installed app
- GH_TOKEN must be set as a system environment variable for `npm run release` to work
