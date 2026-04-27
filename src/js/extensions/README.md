# Sovereign Explorer — Extensions

Plug-and-play ES6 modules. Zero core modifications required.

---

## Loading an Extension

Add a single script tag to `index.html` just before `</body>`:

```html
<script type="module">
  import { init } from './js/extensions/git-gutter.js';
  init();
</script>
```

Or from `app.js` boot sequence as an optional last step:

```js
import { init as initGitGutter } from './extensions/git-gutter.js';
// inside boot(), after navigateTo(home):
initGitGutter().catch(e => console.warn('[ext:git-gutter]', e));
```

Each extension is fail-soft — a broken extension will not crash the app.

---

## Hook Surface (no core edits needed)

### Events

| Event | When | Detail |
|---|---|---|
| `sov:path-changed` | Every directory navigation | `{ path: string }` |
| `sov:terminal-style-changed` | Font/theme changes | style props |
| `terminal-output` | PTY output stream | `{ taskId, stream, line, code }` |
| `sidecar-telemetry` | Every ~1s from Python daemon | `{ type, data }` |
| `contextmenu` | Right-click anywhere | native MouseEvent |

### Globals

| Global | Type | Description |
|---|---|---|
| `window.__sovDirectoryEntries` | `FileEntry[]` | Current dir file list (mutated on nav) |
| `window.__TAURI__` | object | Tauri internals (prefer ipc.js) |
| `window.sovPalette` | `CommandPalette` | Register spells: `sovPalette.register({id, label, fn})` |

### IPC (import from `../ipc.js`)

```js
import { invoke, listen } from '../ipc.js';

// Rust command
await invoke('copy_files', { sources: ['/a/b.txt'], dest_folder: '/c/' });

// Tauri event
const unlisten = await listen('terminal-output', (e) => { ... });
unlisten(); // stop listening
```

### Available Rust Commands

| Command | Payload | Returns |
|---|---|---|
| `list_directory` | `{ path }` | `FileEntry[]` |
| `file_metadata` | `{ path }` | metadata object |
| `copy_files` | `{ sources[], dest_folder }` | void |
| `move_files` | `{ sources[], dest_folder }` | void |
| `spawn_command` | `{ taskId, command, args, cwd }` | void (streams via events) |
| `create_dir` | `{ name }` | void |

### Spawning Shell Commands (collect output)

PTY output is async/streamed. Use this helper pattern:

```js
import { invoke, listen } from '../ipc.js';

async function spawnCollect(command, args, cwd, timeoutMs = 5000) {
  const taskId = `job-${Date.now()}-ext`;
  const lines = [];
  let done;
  const settled = new Promise(r => (done = r));

  const unlisten = await listen('terminal-output', (e) => {
    const { taskId: tid, stream, line } = e.payload;
    if (tid !== taskId) return;
    if (stream === 'stdout' && line) lines.push(line.trimEnd());
    if (stream === 'exit' || stream === 'error') { unlisten(); done(); }
  });

  const timer = setTimeout(() => { unlisten(); done(); }, timeoutMs);
  await invoke('spawn_command', { taskId, command, args, cwd });
  await settled;
  clearTimeout(timer);
  return lines;
}
```

---

## Extension Conventions

- Export a single `init()` async function
- Inject styles via a single `<style id="ext-{name}">` tag (idempotent)
- Key localStorage with `sov_ext_{name}_{key}`
- Emit your own events as `sov:ext:{name}:{event}`
- Never import from Tauri directly — always go through `../ipc.js`
- Be defensive: wrap everything in try/catch, log with `[ext:name]` prefix

---

## Extensions in This Directory

| File | Hook Points | Description |
|---|---|---|
| `git-gutter.js` | `sov:path-changed`, PTY | Git status badges on file rows |
| `bulk-rename.js` | Palette spell, IPC | Regex/pattern batch rename with preview |
| `age-heatmap.js` | `sov:path-changed`, DOM | mtime-based color gradient on date column |
| `file-watcher-alert.js` | `sidecar-telemetry` | Toast alerts on file system changes |
| `copy-to-dir.js` | `contextmenu`, IPC | Right-click "Copy to Directory" with path picker |
