# 🛡️ FocusGate

**FocusGate** is a Windows desktop productivity app that intercepts launches of user-defined "distraction apps", forces you to declare your intention before the app opens, and tracks your usage patterns over time.

---

## How It Works

1. You add apps to the "blocked" list (e.g. Discord, Steam, Reddit browser shortcuts)
2. When you launch one of those apps, FocusGate **suspends it instantly**
3. An **unclosable intention dialog** appears with a countdown timer
4. After the countdown, you must type at least N words explaining *why* you're opening the app
5. Only then does the app open — and your intention is saved to a log

---

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Electron 29 |
| UI | React 18 + TypeScript |
| Styling | CSS Variables + Tailwind |
| Process detection | WMI event subscription (PowerShell) |
| Fallback | `tasklist` polling every 10s |
| Database | SQLite via `better-sqlite3` |
| Config | `electron-store` |
| Charts | Recharts |
| Build | electron-builder (NSIS + Portable) |

---

## Prerequisites

- **Node.js 18+**
- **Windows 10/11** (WMI is Windows-only)
- **Administrator rights** (required to suspend other processes)
- **PowerShell** (included with Windows, must allow script execution)

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Rebuild native modules for Electron
npx electron-rebuild

# 3. (Required for process suspension) Download pssuspend.exe
#    Download from: https://learn.microsoft.com/en-us/sysinternals/downloads/pssuspend
#    Place pssuspend.exe in: assets/pssuspend.exe

# 4. Run in development
npm run dev
```

---

## Building for Distribution

```bash
# Build installer + portable .exe
npm run dist

# Build portable only
npm run dist:portable
```

Output goes to `release/`.

The NSIS installer is configured with `requireAdministrator` so it will request elevation on install. The app itself also needs admin rights at runtime to suspend processes.

---

## Project Structure

```
focusgate/
├── electron/
│   ├── main.ts               # App entry, tray, window management
│   ├── processMonitor.ts     # WMI watcher + fallback + dedup guard
│   ├── wmiWatcher.ps1        # PowerShell WMI subscription
│   ├── interception.ts       # Suspend/resume/relaunch logic
│   ├── database.ts           # SQLite schema + queries
│   ├── ipcHandlers.ts        # All IPC handlers
│   ├── tray.ts               # Tray icon + context menu
│   ├── autostart.ts          # Windows startup helpers
│   └── preload.ts            # Context bridge API
├── shared/
│   └── ipc-types.ts          # IPC channel constants + TypeScript types
├── src/
│   ├── App.tsx               # Main app shell (titlebar, tabs, modal detection)
│   ├── pages/
│   │   ├── Settings.tsx      # Blocked apps, rules, startup settings
│   │   ├── History.tsx       # Searchable intention log table
│   │   └── Stats.tsx         # Dashboard with Recharts charts
│   ├── components/
│   │   ├── CountdownRing.tsx  # SVG animated countdown circle
│   │   ├── IntentionModal.tsx # Full interception dialog UI
│   │   ├── AppListItem.tsx    # Blocked app row component
│   │   ├── WordCounter.tsx    # Word count with progress bar
│   │   ├── Toggle.tsx         # Animated toggle switch
│   │   └── Toast.tsx          # Toast notification system
│   └── styles/
│       └── global.css        # CSS variables, dark/light theme
├── assets/
│   ├── tray-active.png       # 16×16 or 32×32 tray icon (active)
│   ├── tray-paused.png       # 16×16 or 32×32 tray icon (paused)
│   └── pssuspend.exe         # Sysinternals PsSuspend (you must add this)
├── package.json
├── electron-builder.json
├── vite.config.ts
└── tsconfig.json / tsconfig.electron.json
```

---

## Features

### Intention Dialog
- Unclosable `BrowserWindow` that sits above everything
- SVG countdown ring animates over the configured delay (default: 10s)
- Textarea is disabled during countdown, auto-focuses when unlocked
- Live word counter with progress bar — turns green when minimum is met
- "Open App" button only activates when both conditions are met

### Process Detection
- **WMI event-driven** — zero CPU usage while idle; fires the instant a process starts
- **Fallback watchdog** — `tasklist` poll every 10 seconds as a safety net
- **Deduplication guard** — 500ms TTL prevents double-interception

### Process Suspension
- Uses Sysinternals `pssuspend.exe` to suspend (not kill) the process
- Suspended processes can be resumed seamlessly after the intention is written
- Falls back to `taskkill` if suspension fails, then relaunches on completion

### System Tray
- Lives in the tray permanently
- Left-click to show/hide main window
- Right-click for: Open, Pause/Resume, Pause for 15/30/60 min, Quit
- Active/paused icon states
- Windows balloon notifications for pause/resume events

### Settings
- Blocked apps list with per-app enable/disable toggles
- Configurable minimum word count (5–100 words)
- Configurable countdown delay (5–120 seconds)
- Focus hours — only intercept within a time window
- Launch at startup, minimize-to-tray, dark/light mode toggle
- Export logs as CSV, clear history

### Statistics
- Top 10 most launched apps (horizontal bar chart)
- App launches by hour of day (area chart)
- Blocked app interceptions over 30 days (line chart)
- Completion rate (donut chart)
- Summary stat cards

---

## Required Assets

You need to create/provide:

1. **`assets/tray-active.png`** — 32×32 icon shown in tray when active
2. **`assets/tray-paused.png`** — 32×32 icon shown in tray when paused
3. **`assets/pssuspend.exe`** — Download from [Sysinternals](https://learn.microsoft.com/en-us/sysinternals/downloads/pssuspend)
4. **`assets/icon.ico`** — App icon for installer

---

## Architecture Notes

### Why WMI?
Standard approaches (polling `tasklist` every 1s) burn CPU constantly. WMI lets the OS notify your code the *instant* a process starts — completely idle otherwise. The PowerShell subprocess holds the WMI subscription and writes `pid|processName` lines to stdout.

### Why Suspend, Not Kill?
Killing the process means the user has to wait for it to fully re-launch after completing their intention — annoying for heavy apps. Suspending freezes the process in memory; after the intention is written, it resumes instantly where it left off.

### Security Model
The app requires administrator rights because `pssuspend` needs elevated privileges to suspend arbitrary processes. This is handled in the NSIS installer manifest (`requestedExecutionLevel: requireAdministrator`).

---

## Database Schema

```sql
-- Intention logs (when user completed the dialog)
CREATE TABLE intention_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   TEXT NOT NULL,
  app_name    TEXT NOT NULL,
  exe_path    TEXT NOT NULL,
  purpose     TEXT NOT NULL,
  word_count  INTEGER NOT NULL,
  resumed     INTEGER NOT NULL DEFAULT 1  -- 1=resumed, 0=relaunched
);

-- All process launches (for stats)
CREATE TABLE app_activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   TEXT NOT NULL,
  app_name    TEXT NOT NULL,
  is_blocked  INTEGER NOT NULL DEFAULT 0
);
```

Config (blocked apps list, all settings) is stored separately via `electron-store` in `%APPDATA%/focusgate/config.json`.

---

## License

MIT
