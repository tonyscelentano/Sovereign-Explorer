# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Tauri dev mode (hot-reloads frontend, recompiles Rust on change)
npm run build    # Production Tauri bundle
```

No test runner, linter, or bundler. Frontend ES modules run directly in WebView2 — no transpilation step.

## Design Principles

From `MANIFESTO.md` — every decision flows from these:

1. **Lean Engineering, Zero Bloat** — every feature earns its place; no convenience wrappers
2. **GPU Where It Counts** — semantic search and spatial layout; not gimmicks
3. **Python for Intelligence, Rust for Speed** — Python is the live nervous system; Rust controls the OS surface
4. **Moddable to the Bone** — Foobar2000 snap-grid philosophy; every panel is a widget
5. **Open Source, Always** — no telemetry, no dark patterns

The two target users (Power User / Daily User) are treated as the same person at different hours of the day. Features must serve both simultaneously.

## Architecture

Three-tier stack: **Rust backend (Tauri 1.5)** + **Vanilla ES6 frontend (no framework)** + **Python sidecar**.

```
src/              → Frontend (HTML5 Custom Elements, direct ES modules)
src-tauri/        → Rust backend (Tauri commands, PTY, FS, fonts)
sidecar/          → Python daemon (telemetry, file monitoring, metadata extraction)
scripts/          → Build utilities + qdrant_bridge.py stub (future semantic search)
```

### Rust Backend (`src-tauri/src/commands/`)

Modular command handlers, all registered in `main.rs`:

| Command | Module | Purpose |
|---|---|---|
| `list_directory` | `fs.rs` | Read dir → `Vec<FileEntry>`, dirs-first sort, hidden files (`.`) excluded |
| `get_home_dir` | `fs.rs` | Return user home path |
| `create_dir`, `create_file` | `fs.rs` | Create at absolute path |
| `copy_files`, `move_files` | `fs.rs` | Batch copy/move `sources[]` → `dest_folder` |
| `list_drives` | `fs.rs` | List logical drives (C:\, D:\) via native Windows query |
| `file_metadata` | `scrying.rs` | Fast Rust metadata (size, dates, mime, line count) |
| `extract_file_data` | `scrying.rs` | Spawns Python sidecar extractor for deep content extraction |
| `spawn_persistent_shell` | `pty.rs` | Open PTY pair, long-lived shell "soul" |
| `spawn_command` | `pty.rs` | One-shot PTY command (Spawn→Stream→Die) |
| `send_input`, `close_stdin` | `pty.rs` | Write bytes / send EOF to PTY stdin |
| `kill_command` | `pty.rs` | Drop stdin first (broken-pipe), then hard-kill |
| `resize_pty` | `pty.rs` | Resize PTY master (`rows`/`cols`) |
| `get_system_fonts` | `fonts.rs` | DirectWrite system font enumeration |

**Three global statics in `pty.rs`** (keyed by `task_id`):
```rust
ACTIVE_PROCESSES  // HashMap<String, Box<dyn Child + Send>>
ACTIVE_STDIN      // HashMap<String, Box<dyn Write + Send>>
ACTIVE_PTY_MASTER // HashMap<String, Box<dyn MasterPty + Send>>
```
Stdin is separated into its own map to eliminate mutex contention between writes and lifecycle cleanup.

**Task ID conventions:** `session-{Date.now()}` for persistent shells, `job-{Date.now()}` for one-shot commands.

**Rust → Frontend events** (via `app_handle.emit_all`):
- `"terminal-output"` — `{ taskId, stream: "stdout"|"stderr"|"exit"|"error", line, is_pty, code }`
- `"sidecar-telemetry"` — `{ type: "status"|"pulse"|"momentum", data: {...} }`

### IPC Bridge (`src/js/ipc.js`)

All frontend → Rust calls go through `ipc.js`. It uses lazy resolution to handle the race condition where `window.__TAURI__` arrives after module load:

```js
// Checks window.__TAURI__ || window.__TAURI_INTERNALS__ || null
export async function invoke(command, payload) { ... }
export async function listen(eventName, handler) { ... }
export function isTauri() { ... }
```

`withGlobalTauri: true` in `tauri.conf.json` injects `window.__TAURI__` globally.

### Frontend Modules (`src/js/`)

| Module | Responsibility |
|---|---|
| `ipc.js` | Tauri IPC bridge (lazy resolution) |
| `fs.js` | Navigation state (`currentPath`, `history`), `navigateTo()`, `navigateToSilent()` |
| `ui.js` | File list render, breadcrumb, view toggle; has `setNavigator()` callback slot (avoid circular import) |
| `toolbar.js` | Settings/theme dropdowns, typography modal — **Phase 4 refactor pending**: extract `settings.js`/`typography.js` |
| `theme.js` | `ThemeManager` — icon pack selection, per-extension overrides, `onSwap()` hook |
| `inspector.js` | `<sovereign-inspector>` init — two-stage inspection (fast Rust metadata → async Python deep scan) |
| `palette.js` | `CommandPalette` — `Ctrl+K` command palette with "spells" |
| `layout.js` | Three draggable splitters (sidebar, terminal, scrying) persisted to localStorage |
| `telemetry.js` | Listens for `sidecar-telemetry` events, drives metabolic toolbar metrics |
| `satchel.js` | Visual clipboard scaffold |
| `utils.js` | Shared utilities |

**Navigation state** in `fs.js` sets `window.__sovDirectoryEntries` — global cache used by search and re-render. Emits `sov:path-changed` CustomEvent on navigation.

### Custom Elements (`src/js/components/`)

| Element | Class | Notes |
|---|---|---|
| `<sovereign-file-list>` | `SovereignFileList` | List/grid view toggle; column visibility via right-click header context menu |
| `<sovereign-file-tree>` | `SovereignFileTree` | Sidebar directory tree |
| `<sovereign-inspector>` | `SovereignInspector` | Scrying panel; toggle with `I` key |
| `<sovereign-palette>` | `SovereignPalette` | Command palette opened with `Ctrl+K` |
| `<sovereign-icon-themer>` | `SovereignIconThemer` | 94 WebP icon grid for per-extension override |
| `<sovereign-terminal-dock>` | `SovereignTerminalDock` | xterm.js terminal; fallback log for pre-init messages |

### Terminal Engine (3 layers in `src/js/terminal/`)

- **`terminal-dock.js`** (Custom Element) — owns xterm.js `Terminal` + `FitAddon`; `enterPtyMode()`/`exitPtyMode()` switch between HTML input row and xterm canvas; dispatches callback hooks
- **`pty-transport.js`** (`PTYTransport`) — manages `sessionTaskId` (persistent) and `activeTaskId` (foreground job); `scheduleSessionRecovery()` auto-restarts on exit; `syncSessionCwd()` syncs Explorer navigation to shell CWD; double-press Ctrl+C triggers `restartPersistentSession()`
- **`shell-illusion.js`** — intercepts `cd`, `pwd`, `clear`/`cls`, `exit`/`logout` before they hit the PTY; `exit`/`logout` are blocked when a session is active

### Python Sidecar (`sidecar/`)

- **`main.py`** — long-running Watchdog daemon; emits JSON to stdout every 1s (CPU %, disk I/O); emits `momentum` events on file changes (diffs using `difflib.ndiff`); monitors `.txt .md .py .js .css .html .rs .json .toml .ps1`; silently ignores exceptions to stay alive
- **`extractor.py`** — one-shot per-request; supports PDF (`pdfplumber`), DOCX (`python-docx`), audio ID3 tags (`mutagen`), plain text; 3000 char cap on content
- Sidecar path is **hardcoded** in `scrying.rs` as a relative path from the Tauri binary: `..\\sidecar\\.venv\\Scripts\\python.exe`

### Icon Resolution Chain

```
generateIconHTML(entry)
  → ThemeManager.getCustomIconPath(entry)
      1. Check overrides[ext]           → assets/themes/orio/webp_icons/{override}
      2. EXT_SEMANTICS[ext]             → semantic name (e.g. "script")
         → SEMANTIC_TO_INDEX[semantic]  → padded 3-digit index
         → assets/themes/IconPacks/{pack}/ico/Icon-{NNN}.ico
  on <img> onerror → Lucide SVG fallback
```

`master_index_map.json` maps integer index → semantic name. The frontend inverts it for lookup at boot.

### Boot Sequence (`app.js boot()`)

Sequential `bootStep(label, fn)` calls — each module error is caught and logged to `window.__sovBootDiag` overlay (fail-soft):

1. ThemeManager → view controls → context menu → bookmarks → terminal → toolbar → CommandPalette → Satchel → telemetry → inspector → layout → `get_home_dir` → `navigateTo(home)`

### Layout System

Three splitters with CSS custom properties on `documentElement`, persisted to localStorage:
- `--sidebar-w` (150–600px default 220px) `sov_sidebar_w`
- `--terminal-h` (100–600px default 200px) `sov_terminal_h`
- `--scrying-w` (200–800px default 260px) `sov_scrying_w`

Double-click any splitter resets to default.

### Typography System

Two independently configurable font zones:
- **UI** — `--f-ui`, `--f-ui-weight`, `--f-ui-size` (default: Inter 400 13px)
- **Terminal/Scrying** — `--f-terminal`, `--f-terminal-weight`, `--f-terminal-size`, `--f-terminal-glow`, `--f-terminal-bg`, `--f-terminal-color` (default: JetBrains Mono 400 12px)

Persisted as `sov_f_{zone}_{prop}`. Changes dispatch `sov:terminal-style-changed` for live xterm hot-reload.

## Naming Conventions

- **Rust commands**: `snake_case`
- **JS exported functions**: `camelCase`; classes: `PascalCase`
- **Custom Elements**: `sovereign-{name}` / class `Sovereign{Name}`
- **CSS variables**: `--f-{zone}-{prop}` (typography), `--{name}` (layout/colors)
- **localStorage**: `sovereign_*` (app state), `sov_*` (layout/typography), `hide-col-*` (column visibility)
- **Custom events**: `sov:{event-name}` (e.g. `sov:path-changed`, `sov:terminal-style-changed`)
- **Sidecar message types**: `"status"`, `"pulse"`, `"momentum"`

## Key Constraints

- **Tauri 1.x, not Tauri 2** — API surface differs significantly from Tauri 2 docs
- **No bundler** — ES modules served raw; no transpilation
- **FS scope**: `$HOME/**` only (Tauri allowlist enforced)
- **Shell scope**: PowerShell only for Tauri shell API; `pty.rs` commands are Rust-native and bypass the allowlist
- **CDN pins**: lucide `@0.300.0`, xterm `@6.0.0`, xterm-addon-fit `@0.11.0` on jsdelivr — do not bump without testing
- **Sidecar `.venv` must exist** at `sidecar/.venv/Scripts/python.exe` relative to the Tauri binary
- **Hidden files** (`.` prefix) are filtered in `fs.rs` — by design
- From `GEMINI.md`: always use local `.venv` for Python; don't tie app lifecycle to console windows; resolve deprecation warnings early

## Active Refactoring (`REFACTORING.md`)

**Phase 4 in progress**: `toolbar.js` still owns typography logic that belongs in a dedicated `settings.js` or `typography.js`. Leave `toolbar.js` responsible only for static ribbon UI states.

## Roadmap

- **Cycle 6**: Local ONNX/WebGPU semantic embeddings (`all-MiniLM-L6-v2`); `scripts/qdrant_bridge.py` is the integration stub
- **Terminal Phase 3**: CLI agent bridge, input interceptor v2, multi-tab
- **Terminal Phase 4**: ANSI palette themes, SQLite command history, GPU renderer
