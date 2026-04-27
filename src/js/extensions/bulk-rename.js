/**
 * bulk-rename.js — Sovereign Explorer Extension
 *
 * Registers a palette spell "Bulk Rename" (Ctrl+K → type "rename").
 * Opens a modal with regex/token pattern input and a live preview table.
 * On confirm, calls move_files IPC to execute renames.
 *
 * Pattern tokens:
 *   {n}       → zero-padded index (01, 02, ...)
 *   {name}    → original filename without extension
 *   {ext}     → file extension (with dot)
 *   {date}    → today YYYY-MM-DD
 *   Regex:    → wrap in / / to use JS regex with capture groups ($1, $2, ...)
 *
 * Load: import { init } from './extensions/bulk-rename.js'; init();
 */

import { invoke } from '../ipc.js';

// ─── Styles ──────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('ext-bulk-rename-styles')) return;
  const style = document.createElement('style');
  style.id = 'ext-bulk-rename-styles';
  style.textContent = `
    #sov-ext-bulk-rename-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.65);
      z-index: 9000;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(2px);
    }

    #sov-ext-bulk-rename-modal {
      background: var(--bg-panel, #1a1a1e);
      border: 1px solid var(--border, #2e2e38);
      border-radius: 6px;
      width: min(680px, 92vw);
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      font-family: var(--f-ui, 'Inter', sans-serif);
      font-size: 12px;
      color: var(--fg, #d4d4d8);
      box-shadow: 0 24px 48px rgba(0,0,0,0.5);
    }

    #sov-ext-bulk-rename-modal header {
      padding: 14px 16px 12px;
      border-bottom: 1px solid var(--border, #2e2e38);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    #sov-ext-bulk-rename-modal header h2 {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    #sov-ext-bulk-rename-modal header button.close {
      background: none;
      border: none;
      color: var(--fg-muted, #71717a);
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      padding: 0 4px;
    }
    #sov-ext-bulk-rename-modal header button.close:hover { color: var(--fg, #d4d4d8); }

    .br-controls {
      padding: 12px 16px;
      display: flex;
      gap: 10px;
      align-items: flex-end;
      flex-shrink: 0;
      border-bottom: 1px solid var(--border, #2e2e38);
    }

    .br-controls label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      color: var(--fg-muted, #71717a);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      flex: 1;
    }

    .br-controls input {
      background: var(--bg-input, #111113);
      border: 1px solid var(--border, #2e2e38);
      border-radius: 3px;
      color: var(--fg, #d4d4d8);
      font-family: var(--f-terminal, 'JetBrains Mono', monospace);
      font-size: 12px;
      padding: 6px 8px;
      outline: none;
      width: 100%;
      box-sizing: border-box;
    }
    .br-controls input:focus { border-color: var(--accent, #6366f1); }

    .br-hint {
      padding: 6px 16px 10px;
      font-size: 10px;
      color: var(--fg-muted, #52525b);
      flex-shrink: 0;
    }
    .br-hint code {
      background: rgba(255,255,255,0.05);
      padding: 1px 4px;
      border-radius: 2px;
      font-family: var(--f-terminal, monospace);
    }

    .br-preview {
      flex: 1;
      overflow-y: auto;
      border-bottom: 1px solid var(--border, #2e2e38);
    }

    .br-preview table {
      width: 100%;
      border-collapse: collapse;
    }
    .br-preview th {
      position: sticky;
      top: 0;
      background: var(--bg-panel, #1a1a1e);
      padding: 6px 16px;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--fg-muted, #52525b);
      border-bottom: 1px solid var(--border, #2e2e38);
    }
    .br-preview td {
      padding: 5px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      font-family: var(--f-terminal, 'JetBrains Mono', monospace);
      font-size: 11px;
    }
    .br-preview tr.conflict td { color: #ef5350; }
    .br-preview tr.unchanged td.new-name { color: var(--fg-muted, #52525b); }
    .br-preview td.arrow { color: var(--fg-muted, #52525b); width: 24px; text-align: center; }
    .br-preview td.new-name { color: #4caf50; }
    .br-preview td.idx { color: var(--fg-muted, #52525b); width: 32px; text-align: right; }

    .br-footer {
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .br-status { color: var(--fg-muted, #71717a); font-size: 11px; }
    .br-actions { display: flex; gap: 8px; }

    .br-btn {
      padding: 6px 14px;
      border-radius: 3px;
      border: 1px solid var(--border, #2e2e38);
      font-size: 12px;
      cursor: pointer;
      font-family: var(--f-ui, sans-serif);
    }
    .br-btn.cancel { background: transparent; color: var(--fg-muted, #71717a); }
    .br-btn.cancel:hover { color: var(--fg, #d4d4d8); }
    .br-btn.confirm {
      background: var(--accent, #6366f1);
      color: #fff;
      border-color: transparent;
      font-weight: 600;
    }
    .br-btn.confirm:hover { opacity: 0.85; }
    .br-btn.confirm:disabled { opacity: 0.4; cursor: not-allowed; }
    .br-btn.confirm.danger { background: #ef5350; }
  `;
  document.head.appendChild(style);
}

// ─── Pattern Engine ──────────────────────────────────────────────────────────

const todayStr = new Date().toISOString().slice(0, 10);

function applyPattern(pattern, originalName, index) {
  const lastDot  = originalName.lastIndexOf('.');
  const namePart = lastDot > 0 ? originalName.slice(0, lastDot) : originalName;
  const extPart  = lastDot > 0 ? originalName.slice(lastDot)    : '';
  const padded   = String(index + 1).padStart(2, '0');

  // Regex mode: /pattern/$1-replacement/
  const regexMatch = pattern.match(/^\/(.+)\/(.*)$/);
  if (regexMatch) {
    try {
      const re      = new RegExp(regexMatch[1]);
      const replace = regexMatch[2];
      return originalName.replace(re, replace);
    } catch {
      return null; // invalid regex
    }
  }

  // Token mode
  return pattern
    .replace(/\{n\}/g,    padded)
    .replace(/\{name\}/g, namePart)
    .replace(/\{ext\}/g,  extPart)
    .replace(/\{date\}/g, todayStr);
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function buildModal() {
  const overlay = document.createElement('div');
  overlay.id = 'sov-ext-bulk-rename-overlay';

  overlay.innerHTML = `
    <div id="sov-ext-bulk-rename-modal" role="dialog" aria-modal="true" aria-label="Bulk Rename">
      <header>
        <h2>Bulk Rename</h2>
        <button class="close" title="Close (Esc)">✕</button>
      </header>

      <div class="br-controls">
        <label>
          Filter (glob or leave blank for all)
          <input id="br-filter" type="text" placeholder="*.txt  or  *.{js,ts}" spellcheck="false">
        </label>
        <label style="flex:2">
          Pattern
          <input id="br-pattern" type="text" placeholder="{n}-{name}{ext}" spellcheck="false" autofocus>
        </label>
      </div>

      <div class="br-hint">
        Tokens: <code>{n}</code> index &nbsp;·&nbsp; <code>{name}</code> stem &nbsp;·&nbsp;
        <code>{ext}</code> extension &nbsp;·&nbsp; <code>{date}</code> today &nbsp;·&nbsp;
        Regex: <code>/^(.+)$/$1_backup/</code>
      </div>

      <div class="br-preview">
        <table>
          <thead><tr>
            <th class="idx">#</th>
            <th>Original</th>
            <th class="arrow"></th>
            <th>New Name</th>
          </tr></thead>
          <tbody id="br-tbody"></tbody>
        </table>
      </div>

      <div class="br-footer">
        <span class="br-status" id="br-status"></span>
        <div class="br-actions">
          <button class="br-btn cancel" id="br-cancel">Cancel</button>
          <button class="br-btn confirm" id="br-confirm" disabled>Rename</button>
        </div>
      </div>
    </div>
  `;

  return overlay;
}

function getEntries(filterGlob) {
  const all = Array.from(appState.state.entries || [])
    .filter(e => e.is_file !== false); // files only

  if (!filterGlob || !filterGlob.trim()) return all;

  // Convert basic glob to regex
  const globRe = new RegExp(
    '^' + filterGlob.trim()
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape special chars (except * and ?)
      .replace(/\\\*/g, '.*')
      .replace(/\?/g, '.') + '$',
    'i'
  );
  return all.filter(e => globRe.test(e.name));
}

function openModal(currentDir) {
  if (document.getElementById('sov-ext-bulk-rename-overlay')) return;

  const overlay = buildModal();
  document.body.appendChild(overlay);

  const patternInput = overlay.querySelector('#br-pattern');
  const filterInput  = overlay.querySelector('#br-filter');
  const tbody        = overlay.querySelector('#br-tbody');
  const status       = overlay.querySelector('#br-status');
  const confirmBtn   = overlay.querySelector('#br-confirm');

  let previewPairs = []; // [{from, to, conflict}]

  function refreshPreview() {
    const pattern = patternInput.value;
    const filter  = filterInput.value;
    const entries = getEntries(filter);

    previewPairs = [];
    const seen   = new Set();
    let conflicts = 0;
    let changes   = 0;

    previewPairs = entries.map((entry, i) => {
      const newName = pattern ? applyPattern(pattern, entry.name, i) : entry.name;
      const conflict = newName && seen.has(newName);
      if (newName) seen.add(newName);
      const changed = newName && newName !== entry.name;
      if (changed) changes++;
      if (conflict) conflicts++;
      return { from: entry.name, to: newName || entry.name, path: entry.path, changed, conflict };
    });

    tbody.innerHTML = previewPairs.map((pair, i) => `
      <tr class="${pair.conflict ? 'conflict' : pair.changed ? '' : 'unchanged'}">
        <td class="idx">${i + 1}</td>
        <td>${escHtml(pair.from)}</td>
        <td class="arrow">→</td>
        <td class="new-name">${escHtml(pair.to)}</td>
      </tr>
    `).join('');

    const hasWork = changes > 0 && conflicts === 0 && previewPairs.every(p => p.to);
    confirmBtn.disabled = !hasWork;
    confirmBtn.className = 'br-btn confirm' + (conflicts > 0 ? ' danger' : '');

    if (conflicts > 0) {
      status.textContent = `⚠ ${conflicts} naming conflict${conflicts > 1 ? 's' : ''} — resolve before renaming`;
    } else {
      status.textContent = `${changes} of ${previewPairs.length} file${previewPairs.length !== 1 ? 's' : ''} will be renamed`;
    }
  }

  function close() { overlay.remove(); }

  patternInput.addEventListener('input', refreshPreview);
  filterInput.addEventListener('input',  refreshPreview);
  overlay.querySelector('.close').onclick  = close;
  overlay.querySelector('#br-cancel').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  confirmBtn.onclick = async () => {
    const toRename = previewPairs.filter(p => p.changed && !p.conflict);
    if (!toRename.length) return;

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Renaming…';

    try {
      // move_files moves each source to dest_folder; rename = move to same dir with new name
      // We do them one at a time since each "dest" is same dir but different filename.
      // If move_files supports dest as a full file path, use that; otherwise batch to same dir
      // and rely on the fact that moving to the same dir with a different name = rename.
      for (const pair of toRename) {
        // rename_item is the correct IPC (see operations.js renameItem)
        await invoke('rename_item', { oldPath: pair.path, newName: pair.to });
      }
      close();
      // Trigger navigation refresh
      window.dispatchEvent(new CustomEvent('sov:ext:bulk-rename:complete'));
    } catch (err) {
      status.textContent = `Error: ${err.message || err}`;
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Rename';
    }
  };

  refreshPreview();
  patternInput.focus();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

let currentDir = null;

export async function init() {
  injectStyles();

  window.addEventListener('sov:path-changed', (e) => {
    currentDir = e.detail?.path || null;
  });

  // Register palette spell when palette is available
  function tryRegister() {
    // SovereignPalette exposes a commands array on the DOM element directly.
    // Push a new regex command — no window.sovPalette API needed.
    const palette = document.getElementById('command-palette');
    if (palette?.commands) {
      palette.commands.push({
        regex:  /^rename$/i,
        action: () => { if (currentDir) openModal(currentDir); },
        hint:   'rename (bulk rename files in current folder)',
      });
    } else {
      setTimeout(tryRegister, 500);
    }
  }
  tryRegister();

  // Also expose a direct open for custom keybinds
  window.sovExtBulkRename = () => { if (currentDir) openModal(currentDir); };

  console.log('[ext:bulk-rename] ready — palette spell: "Bulk Rename"');
}
] ready — palette spell: "Bulk Rename"');
}
