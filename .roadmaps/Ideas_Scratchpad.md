# Sovereign Explorer — Ideas Scratchpad

## ── Realized / Landed ──

*   **The Satchel (Visual Accumulation Buffer):** ✅ Implemented as a persistent gathering zone for multi-directory selection.
*   **Smart CWD Sync (Bi-Directional):** ✅ Implemented. Terminal follows GUI (manual sync) and GUI follows Terminal `cd` via Shell Illusion.
*   **"The Eye" (Zero-Hunt Perception):** ✅ Implemented quick toggles for hidden files and metadata visibility in the toolbar dropdowns.

---

## ── Conceptual Scratchpad (Half-IDE Evolution) ──

> [!IMPORTANT]
> These are future concepts. Do NOT start coding them unless explicitly directed.

### The "Ghost Buffer" (Terminal Injection)
- **Concept**: Seamlessly feeding GUI selections into the active shell.
- **Action**: Map `Ctrl+Enter` or `Alt+T` to paste the absolute, escaped paths of all current grid selections into the terminal input line.

### Visual Architecture Tree (The Map)
- **Concept**: A non-linear, topological representation of the project.
- **Action**: A toggleable D3/Canvas graph view where folders/files are nodes. Node size correlates to disk volume. 

### Deep Flatten Audit
- **Concept**: Breaking the folder hierarchy for one-click auditing.
- **Action**: A "Flat View" toggle that recursively gathers all files into a single, sortable grid.

### Visual Pipe Monitoring (Metabolic Pulse)
- **Concept**: Real-time feedback on background tasks.
- **Action**: Adding a "heartbeat" status ring or glowing pulse to icons currently targeted by active PTY tasks.

### Contextual Sudo-Edit (Elevation Wall Bypass)
- **Concept**: Seamless file privilege escalation without context loss.
- **Action**: Auto-detect protected system paths. Expose a "Sudo-Edit" action to pipe target files through UAC.

### Intent-Based Discovery (Amnesia Search)
- **Concept**: Bypassing exact-string match limitations via local semantic vectors.
- **Action**: Wire `Ctrl+F` to the Python Sidecar's `all-MiniLM-L6-v2` model for semantic retrieval.
