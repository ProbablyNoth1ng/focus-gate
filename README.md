# 🛡️ FocusGate

> **Force yourself to be intentional before opening distracting apps.**

FocusGate is a Windows desktop productivity tool that **intercepts** launches of apps you define as distracting (Discord, Slack, Steam, etc.), freezes them instantly, and requires you to write a clear intention statement before the app is allowed to open. Every interaction is logged and visualized so you can track your patterns over time.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Screenshots](#screenshots)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Building for Distribution](#building-for-distribution)
- [Using FocusGate](#using-focusgate)
  - [Adding a Blocked App](#adding-a-blocked-app)
  - [Removing or Disabling an App](#removing-or-disabling-an-app)
  - [Configuring Interception Rules](#configuring-interception-rules)
  - [Startup & Tray Settings](#startup--tray-settings)
  - [Pausing FocusGate](#pausing-focusgate)
  - [The Intention Dialog](#the-intention-dialog)
  - [Viewing History](#viewing-history)
  - [Viewing Stats](#viewing-stats)
  - [Exporting & Clearing Data](#exporting--clearing-data)
- [System Tray](#system-tray)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Database Schema](#database-schema)
- [Configuration File](#configuration-file)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## How It Works

1. You add any `.exe` to the **Blocked Apps** list (e.g. Discord, Slack, Steam).
2. The moment you launch that app, FocusGate **suspends the process instantly** — the window never appears.
3. An **unclosable intention dialog** pops up in front of everything, with a countdown timer.
4. After the countdown finishes (default: 10 seconds), the text field activates.
5. You must type at least **N words** (default: 10) explaining *why* you are opening that app right now.
6. Once the word count is met, the **"Open App"** button activates — click it and the app resumes seamlessly from where it was frozen.
7. Your intention is saved to a searchable log, and all interactions feed into the Statistics dashboard.

---

## Screenshots

### Settings

![Settings](/assets/screenshots/1s.jpg)

The **Settings** tab is where you manage your blocked apps list, configure the interception behavior, and control startup/tray preferences.

---

### History

![History](/assets/screenshots/2s.jpg)

The **History** tab shows every intention you've written, searchable by app name or keyword, filterable by date range.

---

### Stats

![Stats](/assets/screenshots/3s.jpg)

The **Stats** tab gives you a full dashboard: launch counts, interception history, most-used apps, hourly usage patterns, and your completion rate.

---

## Prerequisites

| Requirement | Details |
|---|---|
| **OS** | Windows 10 or Windows 11 only (WMI is Windows-specific) |
| **Node.js** | v18 or higher |
| **Administrator rights** | Required at runtime to suspend other processes |
| **PowerShell** | Included with Windows; script execution must be allowed |
| **pssuspend.exe** | Sysinternals tool — must be downloaded separately (see below) |

> ⚠️ **Important:** FocusGate must be run as Administrator. Without elevated privileges, it cannot suspend other processes.

---

## Installation & Setup


### Option 1 — Install via Setup File (Recommended)

No Build tools required. Just download and run.

👉 [Download FocusGate-Setup.exe](https://github.com/ProbablyNoth1ng/focus-gate/releases/download/release/FocusGate.Setup.1.0.0.exe)

1. Download the `.exe` above
2. Run the installer (Windows will ask for administrator permission — this is required)
3. FocusGate will launch automatically after installation

---

### Option 2 — Build from Source

### Step 1 — Clone or download the project

```bash
git clone https://github.com/your-username/focusgate.git
cd focusgate
```

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Rebuild native modules for Electron

```bash
npx electron-rebuild
```

This step is required because `better-sqlite3` (the database module) is a native Node.js addon and must be compiled specifically for Electron's version of Node.

### Step 4 — Download pssuspend.exe (Required)

FocusGate uses Sysinternals **PsSuspend** to suspend processes without killing them.

1. Go to: https://learn.microsoft.com/en-us/sysinternals/downloads/pssuspend
2. Download `PSTools.zip` and extract it, **or** download `pssuspend.exe` directly.
3. Place `pssuspend.exe` in the `assets/` folder of the project:

```
focusgate/
└── assets/
    └── pssuspend.exe   ← place it here
```

> Without `pssuspend.exe`, FocusGate will fall back to **killing** the process and relaunching it after the intention is written. This works but means apps like Discord or Slack will go through their full startup sequence instead of resuming instantly.

### Step 5 — Run in development mode

```bash
npm run dev
```

This starts both the Vite dev server (React UI) and the Electron shell simultaneously.

---

## Building for Distribution

```bash
# Build NSIS installer + portable .exe
npm run dist

# Build portable .exe only (no installer)
npm run dist:portable
```

Output files are placed in the `release/` directory.

The NSIS installer is configured with `requireAdministrator`, so Windows will prompt for UAC elevation during installation and at every launch. This is necessary for process suspension to work.

### Required assets before building

Make sure these files exist before running `npm run dist`:

| File | Description |
|---|---|
| `assets/pssuspend.exe` | Sysinternals PsSuspend (download separately) |
| `assets/tray-active.png` | 32×32 tray icon shown when FocusGate is active |
| `assets/tray-paused.png` | 32×32 tray icon shown when FocusGate is paused |
| `assets/icon.ico` | App icon used by the NSIS installer |

---

## Using FocusGate

### Adding a Blocked App

Blocking an app means FocusGate will intercept it every time you launch it and require an intention statement.

1. Open FocusGate and go to the **Settings** tab.
2. Click the **`+ Add App`** button in the top-right of the "Blocked Apps" section.
3. A Windows **file picker dialog** will open — navigate to the `.exe` file of the app you want to block.
   - For example: `C:\Users\YourName\AppData\Local\Discord\app-1.0.9237\Discord.exe`
   - Or: `C:\Program Files\Steam\Steam.exe`
4. Select the `.exe` and click **Open**.
5. The app will immediately appear in your Blocked Apps list with its icon, name, and full path.
6. The toggle next to it will be **on** (blue) by default — interception is active immediately.

> 💡 **Tip:** If the app is already running when you add it, FocusGate will NOT intercept the already-running instance. It will only intercept the *next* time you launch it. This prevents false triggers on apps you have open in the background.

> 💡 **Finding your .exe path:** Right-click a shortcut on your desktop or taskbar → Properties → look at the "Target" field. That is the `.exe` path to use.

---

### Removing or Disabling an App

**To temporarily disable** interception for an app (without removing it):
- Click the toggle switch next to the app — it will turn gray/off.
- FocusGate will no longer intercept this app, but it stays in your list.
- Click the toggle again to re-enable.

**To permanently remove** an app from the blocked list:
- Click the **✕** (remove) button on the right side of the app row.
- The app is removed immediately with no confirmation prompt.

---

### Configuring Interception Rules

In the **Interception Rules** section of Settings:

| Setting | Description | Default |
|---|---|---|
| **Minimum word count** | Number of words you must type in your intention before the "Open App" button activates. Range: 5–100. | 10 words |
| **Countdown delay** | Seconds the text field stays *locked* after the dialog opens. Forces a brief pause before you can type. Range: 5–120. | 10 seconds |
| **Focus hours only** | When enabled, FocusGate only intercepts apps within a defined time window (e.g. 9:00 AM – 10:00 PM). Outside these hours, apps open normally. | Off |

To change a numeric value, click the number field and type a new value, or use the up/down arrows.

To configure the **Focus Hours** time window, enable the toggle and two time pickers will appear for start and end times.

---

### Startup & Tray Settings

In the **Startup & Tray** section of Settings:

| Setting | Description | Default |
|---|---|---|
| **Launch at Windows startup** | Adds FocusGate to the Windows startup registry key so it launches automatically when you log in. | On |
| **Dark mode** | Toggles between the dark (default) and light UI theme. | On |

---

### Pausing FocusGate

Sometimes you need to temporarily disable all interceptions without removing apps from your list.

**From the system tray:**
1. Right-click the FocusGate icon in the system tray (bottom-right of taskbar).
2. Choose one of:
   - **Pause** — pauses until you manually resume
   - **Pause for 15 minutes**
   - **Pause for 30 minutes**
   - **Pause for 1 hour**
3. The tray icon will change to the "paused" state, and a Windows notification will confirm.
4. To resume early, right-click the tray icon and choose **Resume**.

While paused, the green **"Active"** badge in the title bar changes to indicate the paused state. All blocked apps will open normally until FocusGate is resumed.

---

### The Intention Dialog

When you launch a blocked app, the interception dialog appears automatically. Here's what happens:

1. **The dialog appears** — it is always-on-top and cannot be closed, minimized, or bypassed with Alt+F4.
2. **Countdown ring** — an animated SVG ring counts down the configured delay (default 10 seconds). The text field is locked during this time.
3. **Text field activates** — after the countdown, the text area auto-focuses and you can start typing.
4. **Live word counter** — as you type, a word count and progress bar updates in real time. The counter turns green when you've hit the minimum.
5. **"Open App" button activates** — once the word count is met, the button becomes clickable.
6. **Click "Open App"** — FocusGate resumes the suspended process (or relaunches it if suspension failed). The app opens and your intention is saved to the log.

> ⚠️ **Cancelling:** There is a cancel/close option that terminates the suspended process. The app will not open if you cancel.

---

### Viewing History

Click the **History** tab to see a complete log of every intention you've written.

**The table shows:**
- **Date / Time** — exact timestamp of when the intention was submitted
- **App** — the name of the app that was intercepted
- **Intention** — the full text you typed
- **Words** — word count of the intention, shown in purple

**Searching and filtering:**
- Use the **search box** to filter by app name or any keyword in your intention text.
- Use the **date range pickers** (From → To) to narrow results to a specific time period.
- The entry count ("N entries") updates live as you filter.

---

### Viewing Stats

Click the **Stats** tab for a visual dashboard of your usage.

**Summary cards (top row):**
| Card | Description |
|---|---|
| **Launched today** | Total number of blocked app launches today (completed + cancelled) |
| **Unique apps ever** | Total number of distinct apps ever intercepted |
| **Interceptions this week** | How many times you've been intercepted in the last 7 days |
| **Completion rate** | Percentage of interceptions where you completed the intention (vs. cancelled) |

**Charts:**
| Chart | Description |
|---|---|
| **Top 10 Most Launched Apps** | Horizontal bar chart ranked by all-time launch count |
| **Launches by Hour of Day (Today)** | Area chart showing which hours of today you launched blocked apps |
| **Interceptions (Last 30 Days)** | Line/scatter chart showing your daily interception volume over the past month |
| **Completion Rate** | Donut chart showing completed vs. total interceptions |

---

### Exporting & Clearing Data

In the **Settings** tab, scroll to the bottom for data management options:

- **Export as CSV** — downloads your full intention log as a `.csv` file you can open in Excel or Google Sheets.
- **Clear intention logs** — permanently deletes all entries in the History tab. A confirmation prompt appears before deletion.
- **Clear activity stats** — permanently deletes all data used by the Stats dashboard.
- **Clear all data** — deletes both logs and activity stats in one step.

> ⚠️ All clear operations are **irreversible**. There is no undo.

---

## System Tray

FocusGate lives in the **system tray** (bottom-right of the Windows taskbar). It never appears in the taskbar unless the main window is open.

**Left-click** the tray icon to show or hide the main window.

**Right-click** the tray icon for the context menu:

| Menu item | Action |
|---|---|
| Open FocusGate | Shows the main settings window |
| Pause / Resume | Toggles interception on/off indefinitely |
| Pause for 15 minutes | Suspends interception for 15 minutes |
| Pause for 30 minutes | Suspends interception for 30 minutes |
| Pause for 1 hour | Suspends interception for 60 minutes |
| Quit | Exits FocusGate completely |

When FocusGate is **active**, the tray icon is the full-color version. When **paused**, the icon changes to a dimmed/grayscale version to remind you it's off.

---

## Project Structure

```
focusgate/
├── electron/                        # Electron (Node.js) main process
│   ├── main.ts                      # App entry point — tray, window management, app lifecycle
│   ├── processMonitor.ts            # WMI watcher + tasklist fallback + dedup guard
│   ├── wmiWatcher.ps1               # PowerShell script holding the WMI subscription
│   ├── interception.ts              # Suspend / resume / relaunch logic via pssuspend.exe
│   ├── database.ts                  # SQLite schema creation and all query functions
│   ├── ipcHandlers.ts               # All IPC channel handlers (bridge between UI and Node.js)
│   ├── tray.ts                      # System tray icon, context menu, balloon notifications
│   ├── autostart.ts                 # Windows startup registry helpers
│   └── preload.ts                   # Context bridge — exposes safe APIs to the renderer
│
├── shared/
│   └── ipc-types.ts                 # IPC channel name constants + all TypeScript interfaces
│
├── src/                             # React renderer process (the UI)
│   ├── App.tsx                      # Main shell — titlebar, tab navigation, modal detection
│   ├── pages/
│   │   ├── Settings.tsx             # Blocked apps list, interception rules, startup settings
│   │   ├── History.tsx              # Searchable + filterable intention log table
│   │   └── Stats.tsx                # Recharts dashboard with all charts and stat cards
│   ├── components/
│   │   ├── IntentionModal.tsx       # The interception dialog (countdown + text input + submit)
│   │   ├── CountdownRing.tsx        # SVG animated countdown ring component
│   │   ├── AppListItem.tsx          # Single row in the blocked apps list
│   │   ├── WordCounter.tsx          # Live word count progress bar
│   │   ├── Toggle.tsx               # Animated toggle switch component
│   │   └── Toast.tsx                # Toast notification system
│   └── styles/
│       └── global.css               # CSS custom properties for dark/light theming
│
├── assets/
│   ├── tray-active.png              # 32×32 tray icon (active state)
│   ├── tray-paused.png              # 32×32 tray icon (paused state)
│   ├── logo.png                     # App logo
│   └── pssuspend.exe                # Sysinternals PsSuspend — YOU MUST PROVIDE THIS
│
├── scripts/
│   └── fix-build.js                 # Post-build fixup script for electron-builder
│
├── package.json
├── electron-builder.json            # Installer/portable build configuration
├── vite.config.ts                   # Vite bundler config (renderer + preload)
├── tsconfig.json                    # TypeScript config for renderer
└── tsconfig.electron.json           # TypeScript config for Electron main process
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Shell** | Electron 29 |
| **UI framework** | React 18 + TypeScript |
| **Styling** | CSS Custom Properties + Tailwind CSS |
| **Process detection** | WMI event subscription via PowerShell subprocess |
| **Detection fallback** | `tasklist` polling every 10 seconds |
| **Process suspension** | Sysinternals `pssuspend.exe` |
| **Database** | SQLite via `better-sqlite3` |
| **Config storage** | `electron-store` → `%APPDATA%/focusgate/config.json` |
| **Charts** | Recharts |
| **Build / installer** | `electron-builder` (NSIS installer + portable `.exe`) |


---

## Database Schema

FocusGate uses a SQLite database stored at `%APPDATA%/focusgate/focusgate.db`.

```sql
-- Intention logs: one row per completed interception
CREATE TABLE intention_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   TEXT NOT NULL,           -- ISO 8601 string
  app_name    TEXT NOT NULL,           -- e.g. "Discord"
  exe_path    TEXT NOT NULL,           -- full path to the .exe
  purpose     TEXT NOT NULL,           -- the intention text the user typed
  word_count  INTEGER NOT NULL,        -- number of words in the intention
  resumed     INTEGER NOT NULL DEFAULT 1  -- 1 = process resumed, 0 = relaunched
);

-- App activity: one row per launch of any blocked app (completed or not)
CREATE TABLE app_activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   TEXT NOT NULL,
  app_name    TEXT NOT NULL,
  is_blocked  INTEGER NOT NULL DEFAULT 0  -- 1 = was in blocked list at time of launch
);
```

---

## Configuration File

App settings are stored separately from the database, in:

```
%APPDATA%\focusgate\config.json
```

The config uses `electron-store` and contains:

```json
{
  "blockedApps": [
    {
      "id": "unique-id-string",
      "name": "Discord",
      "exePath": "C:\\Users\\You\\AppData\\Local\\Discord\\app-1.0.9237\\Discord.exe",
      "icon": "data:image/png;base64,...",
      "enabled": true
    }
  ],
  "minWordCount": 10,
  "countdownDelay": 10,
  "focusHoursEnabled": false,
  "focusStart": "09:00",
  "focusEnd": "22:00",
  "launchAtStartup": true,
  "darkMode": true,
  "isPaused": false,
  "pauseUntil": null
}
```

---

## Troubleshooting

### FocusGate isn't intercepting my app

- Make sure the app is in the **Blocked Apps** list and the toggle is **on** (blue).
- Check that FocusGate is **not paused** (the title bar should show "Active").
- Make sure you're launching the **exact same `.exe`** that you added. Some apps (like Discord) have multiple launchers — verify the path.
- If the app was already running when you added it, close and relaunch it.
- Ensure FocusGate is running as **Administrator** (required for process suspension).

### The app opens without a dialog / dialog appears but app is already open

- The WMI watcher may have fired slightly late. The tasklist fallback will catch it within 10 seconds.
- Some apps use a launcher that spawns a separate main process. You may need to block the actual main `.exe` rather than the launcher.

### pssuspend.exe not found warning

- Download `pssuspend.exe` from Sysinternals (link above) and place it in the `assets/` folder.
- Without it, FocusGate will kill-and-relaunch rather than suspend-and-resume, which is slower but still functional.

### "Access denied" or suspension failures

- FocusGate must be run as Administrator. Right-click the app shortcut → "Run as administrator".
- If using the installed version, right-click the `.exe` → Properties → Compatibility → "Run this program as an administrator".

### PowerShell execution policy error

FocusGate runs a PowerShell script internally. If you see a script execution error, open PowerShell as Administrator and run:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Electron rebuild errors

If you get errors about native module compatibility after `npm install`:

```bash
npx electron-rebuild --force
```

---

## License

MIT — see [LICENSE](LICENSE) for details.
