# Explorer Gaps Roadmap

Tracks parity gaps vs. native Windows File Explorer. Organized by priority tier.
Status: ✅ done · 🔨 scaffold (wired, needs polish) · ⬜ not started

---

## P0 — Breaks basic workflows

| Feature | Status | Notes |
|---|---|---|
| File deletion (Recycle Bin) | ✅ | `delete_items` via `trash` crate; batch-capable |
| Rename | ✅ | Hardened inline cell editor in list and tree views |
| Open with default app | ✅ | `open_path` (shell fallback); Invoke-Item -LiteralPath |
| Multi-select | ✅ | `SelectionManager`: click, Ctrl+click, Shift+click, Ctrl+A |
| Default app preferences | 🔨 | Registry scaffolded; needs per-extension UI |

## P1 — Noticeable daily friction

| Feature | Status | Notes |
|---|---|---|
| Typeable address bar | ✅ | Ctrl+L overlay on breadcrumb; Enter navigates |
| Column sort | ✅ | `SortManager`; name/modified/size; persisted |
| File right-click context menu | ✅ | Overhauled with submenus: Open/Rename/Cut/Copy/Paste/Delete |
| Drive/root navigation | ✅ | Rust `list_drives` command; dynamic `#drive-list` sidebar section |
| Cut / Copy / Paste | ✅ | Clipboard model in SelectionManager; cleared after paste |
| Customizable Bookmarks | ✅ | Reactive `<sovereign-bookmarks>` component with add/remove UI |
| Hidden Files Toggle | ✅ | Fully wired settings toggle respecting dot-file visibility |

## P2 — Polish gaps

| Feature | Status | Notes |
|---|---|---|
| Status bar | ✅ | Item count + selection count + size (Restored/Themed) |
| Keyboard file navigation | ✅ | ↑↓ move, Enter open/navigate, Delete trash, F2 rename, Ctrl+A select all |
| Icon Alignment Wizard | ✅ | Manual mapping for non-standard community icon packs |
| Drive Usage Stats | ✅ | Free space / Total size sub-labels and tooltips |
| Search Highlighting | ✅ | Visual feedback for semantic/local filter matches |
| Thumbnail previews | ✅ | High-performance Python-backed WebP engine; integrated in Grid & Inspector |
| Background Context Menu | ✅ | Added submenus for **New Item**, **View**, and **Sort By**; "Terminal Here" sync |
| Industrial Scaffolder | ✅ | Schema-based multi-item creation (`<sovereign-scaffolder>`) |
| Icon/Thumbnail Scaling | ✅ | Persistent scaling via `Ctrl+Plus`/`Ctrl+Minus` |
| "This PC" Virtual Root | ✅ | Unified navigation anchor for logical drives |
| Native Reveal | ✅ | "Show in Folder" context item via `explorer.exe /select` |
| Universal Portability | ✅ | Dynamic home directory resolution; eliminated hardcoded paths |
| Shell context menu passthrough | ⬜ | Requires COM `IContextMenu` via `windows-sys`; complex, deferred |
| Drag and drop | ⬜ | `fileDropEnabled: false` in tauri.conf.json; needs enabling + drop zone |
| Properties dialog | ⬜ | Scrying Inspector covers some metadata; dedicated properties modal TBD |

---

## Future / Cycle 6+

- Open With submenu — enumerate registered handlers from Windows registry; present in context menu
- Extension Dashboard — ✅ Implemented; persistent Plug-and-Play registry with live Telemetry HUDs
- Multi-select drag-and-drop — requires selection model integration with drag events
