# Sovereign Explorer — Keyboard Reference

All active hotkeys as of April 20, 2026. Updated each session as new bindings are added.

---

## Navigation

| Key | Action |
|---|---|
| `Alt + ←` | Go back (history) |
| `Alt + ↑` | Go up one directory |
| `Enter` (file list focused) | Open selected file / navigate into selected folder |
| `↑` / `↓` (file list focused) | Move selection up / down |
| `Ctrl + L` | Focus address bar (type any path, Enter to navigate) |
| `Escape` | Cancel address bar input / close active modal or dropdown |

## File Operations

| Key | Action |
|---|---|
| `Delete` (file list focused) | Send selected items to Recycle Bin |
| `F2` (file list focused) | Rename selected item |
| `Ctrl + A` (file list focused) | Select all items in current folder |

## Multi-Select

| Key / Gesture | Action |
|---|---|
| `Click` | Select single item |
| `Ctrl + Click` | Toggle item in/out of selection |
| `Shift + Click` | Select contiguous range from anchor to target |

## Search & Palette

| Key | Action |
|---|---|
| `Ctrl + K` | Open Command Palette (spells: `new folder`, `new file`, `go`, `find`) |

## Inspector & Panels

| Key | Action |
|---|---|
| `I` | Toggle Scrying Inspector (right panel) |

## Terminal

| Key | Action |
|---|---|
| `Ctrl + C` (terminal focused, first press) | Send SIGINT to active process |
| `Ctrl + C` (terminal focused, second press within 1.5s) | Hard-restart persistent shell session |

---

*Hotkeys are implemented in: `app.js` (global), `sovereign-file-list.js` (file list), `address-bar.js` (address bar), `terminal/pty-transport.js` (terminal), `shell-illusion.js` (shell intercepts).*
