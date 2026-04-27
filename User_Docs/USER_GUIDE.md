# Sovereign Explorer — User Guide

Welcome to Sovereign Explorer, a standalone, high-performance file explorer designed for industrial-grade file management and local-first semantic discovery.

---

## ─── Core Interaction Model ───

### The Sovereign Aesthetic
Explorer is built with a minimalist industrial theme. Use the **Toolbar** at the top to toggle HUD elements like **Telemetry** (IPC & System activity) or switch between **List** and **Grid** views.

### Snap-Grid Layout Modularity
Inspired by Foobar2000, Sovereign Explorer allows for a fully flexible workspace layout.
- **Resizing:** Grab the 1px center hairline splitters between the sidebar, terminal, and inspector to resize them.
- **Double-Click Reset:** Double-click any splitter handle to instantly snap the panel back to its default architectural width/height.
- **Persistence:** Your custom layout is automatically saved to `localStorage` and persists across application reloads.

---

## ─── Terminal & Execution ───

The terminal at the bottom uses a **Stateless Execution** model.
- **State Illusion:** The terminal "knows" where you are in the explorer. Navigating folders in the UI updates the shell's working directory instantly.
- **Omni-Kill Switch:** Press the **X** button (or `Ctrl+C` behavior) in the terminal header to ruthlessly kill any hung background process.
- **ANSI Support:** Shell output supports standard ANSI color sequences for modern dev tool compatibility.

---

## ─── The Scrying Inspector ───

The right panel is your window into deep file data.
- **Instant Scan:** Clicking a file shows filesystem metadata (Size, Dates, Mime-type) immediately.
- **Deep Scan (Cycle 3):** For PDFs, Word docs, Audio files, and Source code, the explorer automatically spawns a background Python sidecar to extract content previews and ID3 tags.
- **Toggle:** Press `I` on your keyboard to instantly toggle the Inspector panel.

---

## ─── Commands & Discovery ───

- **Command Palette:** Press `Ctrl + K` to open the "Spells" palette. You can quickly search for folders, create new files, or trigger system commands.
- **Semantic Search (BETA):** Use the Action Bar search to find files by *intent* rather than just filenames (requires WebGPU initialization).
- **The Satchel:** For multi-folder organization, drag files into your "Satchel" (Visual Clipboard) to gather items from different directories before moving them in bulk.

---

## ─── Keyboard Shortcuts ───

| Key | Action |
|-----|--------|
| `I` | Toggle Scrying Inspector |
| `Ctrl + K` | Open Command Palette |
| `Alt + Up` | Go to Parent Directory |
| `Alt + Left` | Navigate Back in History |
| `Enter` | Open Folder / File |
| `Delete` | Remove Item (with confirmation) |
