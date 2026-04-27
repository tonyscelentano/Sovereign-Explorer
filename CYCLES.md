# Sovereign Explorer — Core Technical Index (HDIL)

**System Architecture**: Tauri (Rust) + Vanilla JS (ES6) + Python Sidecar. No frameworks.
**Policy**: Pinned dependencies, local asset protocols, zero-panic backend, reactive state-hub.

---

### [ARCH] System Core & State Orchestration

- **[STATE] Proxy-Store**: Centralized `appState` (`state.js`) using JS Proxies for `currentPath`, `entries`, `viewMode`, `selection`. Push-based subscription model replaces global polling.
- **[HUB] EventHub**: Singleton microtask-batched bus (`queueMicrotask`). Aggregates high-frequency system/telemetry events into a single UI pulse (prevents DOM thrashing). Bridges to window `CustomEvent` for legacy/extension support.
- **[IPC] Lazy-Bridge**: `ipc.js` lazily resolves Tauri globals to prevent boot-time race conditions. Unified `camelCase` argument standard across JS/Rust boundary.
- **[TEARDOWN] Abort-Standard**: Universal `AbortController` usage in Web Components (`connected` -> `disconnected`) for deterministic listener/subscription pruning.

### [TERM] Terminal & Shell Integration

- **[PTY] Persistent Soul**: `portable-pty` backend. Long-lived shell sessions managed via `Mutex<HashMap<tid, Child>>`.
- **[I/O] Bidirectional Stream**: Dedicated `ACTIVE_STDIN` registry prevents mutex contention during concurrent R/W. Supports Stdin Mode (Amber/◄ glyph) and Command Mode (Normal/❯).
- **[ILLUSION] Context-Sync**: JS intercepts `cd`/`pwd` to sync Explorer GUI state with shell PTY state. Shell Illusion router handles relative path resolution before execution.
- **[HARDENING] Safety-Cap**: 500-line stdout buffer cap prevents Tauri event loop flooding. Automatic ANSI parsing + xterm.js canvas renderer.

### [FS] Filesystem & Explorer Operations

- **[COMMANDS] CRUD**:
  - `delete_items`: `trash` crate (IFileOperation) integration.
  - `move_files`: Atomic rename with recursive copy+delete fallback for cross-volume moves.
  - `copy_files`: Recursive folder duplication with "- Copy" name collision handling.
  - `open_path`: `pwsh` (PowerShell 7) `Invoke-Item -LiteralPath` standard.
- **[ROOT] Virtual Anchors**: Unified `this-pc` virtual root. Rust `list_drives` (wmic/pwsh) provides logical volume enumeration with real-time capacity telemetry.
- **[NAV] Selection Manager**: Ctrl/Shift multi-select, Ctrl+A support. Auto-clears on path change. "Cut-pending" visual state (dimming) for move operations.
- **[SCAFFOLD] Bulk Engine**: Schema-based creation (`2d:src|dist, 3f:index.js|style.css`). Uses `create_dir_all` to ensure path existence during bulk ops.

### [UI] Component System & Aesthetics

- **[COMPONENTS] Sovereign-Custom**: All major zones are Shadow-DOM isolated Custom Elements (`<sovereign-file-list>`, `<sovereign-terminal-dock>`, etc.).
- **[ICON] Index-Mapping**: `master_index_map.js` coordinate system (Shell32/Imageres standards). Fallback chain: User Override -> Pack Index -> Lucide SVG.
- **[PREVIEW] Scrying Engine**: Sidecar Python (Pillow) generates 128px WebP thumbnails. Persistent 7-day cache. Asset protocol enables secure local image R/W.
- **[THEME] Variable-Consolidation**: 100% semantic tokenization. No hardcoded hex values. Independent GUI/Terminal typography management via Windows DirectWrite API (`font-kit`).
- **[UX] Hit-Zones**: Splitter hit-zones expanded to 6px (visual 1px). Real-time search highlighting. Persistent workspace scaling (Ctrl+/-).

### [MOMENTUM] Telemetry & Sidecar

- **[WATCHER] Precision-Scope**: Sidecar dynamically syncs watch paths via `%APPDATA%\sovereign-explorer\watch_path.txt` (written via `pwsh` to prevent `cmd.exe` escaping issues). Clears observers when empty to prevent `~` fallback spam.
- **[DIFF] Atomic-Resilience**: `watchdog` engine implements 10x retry loop (1s max) to bypass `PermissionError` locks during editor atomic saves (`on_moved`/`on_created`).
- **[FILTER] Agent-Blind**: Hardcoded exclusion of `.roo`, `.claude`, `.agents`, `.cursor`, `.gemini` prevents telemetry loops during agent operations.

### [SYS] Security & Hardening

- **[PANIC] Zero-Expect**: Purged `.unwrap()`/`.expect()` from Rust core. Descriptive OS error propagation via `Result`.
- **[MUTEX] Poison-Resilience**: `get_lock<T>` helper handles mutex poisoning from thread failures.
- **[ZOMBIE] Global Reaper**: `on_window_event` hook triggers recursive process tree kill for all child PTYs and sidecars.
- **[PORTABILITY] Path-Neutral**: Dynamic home dir resolution (dirs crate). No hardcoded `C:/Users/Tony` paths. Path-agnostic shell illusion.
- **[DEP] Pruned-Stack**: Eliminated NPM bloat (Lucide/Xterm) in favor of CDN/Local-Asset delivery.
