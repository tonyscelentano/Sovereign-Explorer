# Sovereign Explorer ─ Modular Refactoring Roadmap

This document persists tracking for the major refactoring phases across development sessions. The goal is to break down the monolithic legacy structures into the modular component system outlined in the `MANIFESTO.md`, stabilizing the IPC boundary and preventing initialization failures.

Think light, clean, and modular code. This project is open-source and wants a high degree of moddability for users.

## Phase 1: The Rust Backend (`main.rs`)

**Status**: Completed ✅
**Goal**: Isolate thread-heavy Mutex states, PTY streaming, and OS-level operations into a clean `commands/` module ecosystem.

- [x] Create `src-tauri/src/commands/` directory.
- [x] **FS Module**: Extract `list_directory`, `get_home_dir`, `create_dir`, `create_file`, `copy_files`, and `move_files` into `fs.rs`.
- [x] **PTY Module**: Extract `spawn_command`, `kill_command`, `send_input`, `close_stdin`, `resize_pty` and the PTY threading bridge into `pty.rs`.
- [x] **Scrying Module**: Extract `extract_file_data`, `file_metadata` into `scrying.rs`.
- [x] **Font System**: Extract `get_system_fonts` into `fonts.rs`.
- [x] Refactor `main.rs` to solely initialize Tauri and mount the route handlers.
- [x] Test the IPC boundary to ensure all commands map correctly over the new module system.

## Phase 2: Terminal Engine Decoupling (`terminal.js`)

**Status**: Completed ✅
**Goal**: Separate the networking (IPC), pseudosh shell (State Illusion), and graphics rendering (xterm canvas) into independent layers.

- [x] Create `src/js/terminal/` structure.
- [x] **Transport Layer**: Write `pty-transport.js` to purely handle `invoke` streams, task ID management, and EOF signals.
- [x] **Illusion Shell Layer**: Write `shell-illusion.js` to intercept string inputs for `cd`, `pwd`, and `clear` routines, routing them to the internal `fs.js`.
- [x] **UI Layer**: Write `terminal-ui.js` to manage the `xterm.js` canvas instances, theme reloading, and resize observers.
- [x] Deprecate the monolithic `terminal.js` root file.

## Phase 3: DOM UI Web Components (`index.html`)

**Status**: Completed ✅
**Goal**: Encapsulate complex UI sections inside native HTML5 Custom Elements to avoid global `document.getElementById` failures.

- [x] Extract the File List UI into a `<sovereign-file-list>` component.
- [x] Extract the Scrying Inspector into a `<sovereign-inspector>` component.
- [x] Extract the Command Palette into a `<sovereign-palette>` component.
- [x] Extract the Terminal Dock into a `<sovereign-terminal-dock>` component.
- [x] Extract the Sidebar File Tree into a `<sovereign-file-tree>` component.
- [x] Update `ui.js` and `layout.js` to message these Custom Elements rather than manipulating their internal classes globally.

## Phase 4: Toolbar Ad-Hoc Cleanup (`toolbar.js`)

**Status**: Completed ✅
**Goal**: Extract typography engine and random theme globals out of the standard UI toolbar logic.

- [x] Integrate **Icon Themer** trigger logic.
- [x] **Typography Engine**: Extracted typography CSS variable injectors and Font Pickers into a dedicated modal/variable system.
- [x] **Native Font Discovery**: Integrated `font-kit` (Rust) bindings to query host system fonts.
- [x] **Toolbar Purity**: `toolbar.js` is now solely responsible for static ribbon UI states and dropdown management.

## Phase 5: Icon Theming & Asset Pipeline

**Status**: Completed ✅
**Goal**: Transition from static icon mapping to a dynamic, user-extensible themer with persistent memory.

- [x] Expand Orio icon library to 94+ WebP assets.
- [x] Implement `<sovereign-icon-themer>` alignment wizard.
- [x] **Universal Discovery**: Implemented Rust-side scanning of 25,000+ icons across 100+ community themes.
- [x] **The Index is Law**: Pivot to Windows Shell Indexing (Shell32/Imageres) as the universal coordinate system.
- [x] **Alignment Wizard**: Built interactive user-training UI to resolve "DLL Drift" in non-standard community packs.
- [x] Create `overrides` registry in `ThemeManager` with `localStorage` persistence.
- [x] Refactor `generateIconHTML` with a bulletproof WebP -> ICO -> Lucide fallback chain.

## Phase 6: The CSS & Extension Overhaul

**Status**: Completed ✅
**Goal**: Eliminate the monolithic stylesheet and establish a community-ready plugin ecosystem.

- [x] **CSS Monolith Decomposition**: Refactored 1,100+ lines into 12 domain-specific files (base, layout, components, modals).
- [x] **Semantic Variable Pass**: Identified and eliminated all hard-coded color values, replacing them with industrial-themed semantic tokens.
- [x] **Dynamic Theme Engine**: Refactored `ThemeManager` to dynamically swap CSS stylesheets and synchronize them with icon packs.
- [x] **Plug-and-Play Registry**: Built a lifecycle-aware `ExtensionRegistry` for community plugins with Shadow DOM isolation.
- [x] **Hovering Extension Host**: Created a transparent HUD layer for telemetry widgets that doesn't block core file interactions.
- [x] **Visual Customizer**: Implemented a modular tool for granular, live override of CSS variables (accent, background, industrial colors).
- [x] **Plugin Ingestion**: Built a bridge to ingest and wrap community-scaffolded scripts into the structured registry.

## Phase 7: Deterministic State & Reactive IPC

**Status**: Completed ✅
**Goal**: Move from fragile event-based sync to a deterministic "Hub-Spoke" architecture.

- [x] **State Store (`src/js/state.js`)**: Implemented a reactive Proxy-based store as the Single Source of Truth for the entire application.
- [x] **Event Hub (`src/js/event-hub.js`)**: Centralized all IPC and internal communication into a singleton with microtask-based batching.
- [x] **Reactive Subscriptions**: Migrated all core components and extensions (File List, Inspector, Selection, Git Gutter, etc.) to use the push-based `appState.subscribe` model.
- [x] **Zero Legacy Events**: Successfully eliminated widespread usage of `window.addEventListener('sov:path-changed')` and global variables like `window.__sovDirectoryEntries`.
- [x] **Hardened Selection**: Replaced internal `selection.js` maps with shared state in the global `appState`.
- [x] **Lifecycle Safety**: Reinforced the **"Clean Teardown"** pattern, ensuring all subscriptions are pruned via AbortControllers in `disconnectedCallback`.
