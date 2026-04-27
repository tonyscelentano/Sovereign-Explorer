# Terminal Roadmap — The Road to a "Real" Shell

The current terminal is a **Persistent PTY-backed Shell**. It maintains a long-lived session across commands and Explorer navigation.

---

## Phase 1: Interactive Stdin (Integrated) ✅
**Status:** Completed. Forwarding keyboard input from terminal to active child via `send_input` IPC.

## Phase 2: The Persistent Soul (Integrated) ✅
**Status:** Completed. Maintain a single, long-lived `MasterPty` in Rust across multiple commands. Syncs CWD manually via context menu.

## Phase 3: CLI Agent Bridge (Upcoming) 🔨
Prepare the terminal for CLI agents and rich background tasks.
- **Input Interceptor v2:** Detect when a command is an "agent call" and provide specialized UI hooks.
- **Multi-Tab Scaling:** Independent shell processes and history for concurrent workflows.

## Phase 4: Full Theming & GPU Acceleration ✅
- **ANSI Palettes:** Added persistent CSS variables (`--f-terminal-bg`, `--f-terminal-color`) and UI color pickers.
- **GPU Acceleration:** ✅ Transitioned to `xterm.js` canvas renderer for high-performance streaming.
- **Metabolic History:** ⬜ Store all command-runs and their outputs in a local SQLite database for project auditing.

---

> [!TIP]
> The manual "Open Terminal Here" sync ensures that the terminal remains focused on the user's specific workflow without disruptive auto-jumping during browsing.
