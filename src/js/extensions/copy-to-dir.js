/**
 * copy-to-dir.js — Sovereign Explorer Extension
 *
 * Injects a "Copy to Directory" item into the right-click context menu.
 * Works on files AND folders.
 *
 * Flow:
 *   Right-click file/folder > "Copy to Directory"
 *   Modal opens with:
 *     - Text input for destination path (live-validated via list_directory IPC)
 *     - "+ New Folder" to create a subfolder inline
 *     - Recent destinations list (localStorage, one-click remove)
 *   On confirm: invoke copy_files({ sources, destFolder })
 *
 * Hook: MutationObserver on #file-context-menu (persistent singleton, rebuilds innerHTML on show())
 * IPC:  copy_files, create_dir, list_directory
 *
 * Load: import { init } from './extensions/copy-to-dir.js'; init();
 */

import { invoke } from '../ipc.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const STORAGE_KEY   = 'sov_ext_copy_to_dir_recents';
const MAX_RECENTS   = 8;
const CONTEXT_LABEL = 'Copy to Directory';
const CONTEXT_ID    = 'sov-ext-copy-to-dir-item';

// ─── Styles ──────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('ext-copy-to-dir-styles')) return;
  const style = document.createElement('style');
  style.id = 'ext-copy-to-dir-styles';
  style.textContent = `
    .sov-ctx-copy-to-dir {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .sov-ctx-copy-to-dir:hover {
      background: var(--bg-hover, rgba(255,255,255,0.06));
    }

    #sov-ext-ctd-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      z-index: 9100;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(2px);
    }

    #sov-ext-ctd-modal {
      background: var(--bg-panel, #1a1a1e);
      border: 1px solid var(--border, #2e2e38);
      border-radius: 6px;
      width: min(540px, 90vw);
      display: flex;
      flex-direction: column;
      font-family: var(--f-ui, 'Inter', sans-serif);
      font-size: 12px;
      color: var(--fg, #d4d4d8);
      box-shadow: 0 20px 48px rgba(0,0,0,0.55);
    }

    #sov-ext-ctd-modal header {
      padding: 14px 16px 11px;
      border-bottom: 1px solid var(--border, #2e2e38);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    #sov-ext-ctd-modal header h2 {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
    }
    #sov-ext-ctd-modal header .subtitle {
      font-size: 10px;
      color: var(--fg-muted, #71717a);
      margin-top: 2px;
      font-family: var(--f-terminal, monospace);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 340px;
    }
    #sov-ext-ctd-modal header button.close {
      background: none; border: none; color: var(--fg-muted, #71717a);
      cursor: pointer; font-size: 18px; padding: 0 4px; flex-shrink: 0;
    }
    #sov-ext-ctd-modal header button.close:hover { color: var(--fg, #d4d4d8); }

    .ctd-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }

    .ctd-field-row { display: flex; gap: 8px; align-items: stretch; }

    .ctd-path-input {
      flex: 1;
      background: var(--bg-input, #111113);
      border: 1px solid var(--border, #2e2e38);
      border-radius: 3px;
      color: var(--fg, #d4d4d8);
      font-family: var(--f-terminal, 'JetBrains Mono', monospace);
      font-size: 12px;
      padding: 8px 10px;
      outline: none;
      box-sizing: border-box;
    }
    .ctd-path-input:focus { border-color: var(--accent, #6366f1); }
    .ctd-path-input.error { border-color: #ef5350; }
    .ctd-path-input.ok    { border-color: #4caf50; }

    .ctd-new-folder-btn {
      padding: 0 12px;
      border-radius: 3px;
      border: 1px solid var(--border, #2e2e38);
      background: transparent;
      color: var(--fg-muted, #71717a);
      cursor: pointer;
      font-size: 11px;
      font-family: var(--f-ui, sans-serif);
      white-space: nowrap;
    }
    .ctd-new-folder-btn:hover { color: var(--fg, #d4d4d8); border-color: var(--fg-muted, #71717a); }

    .ctd-validation { font-size: 10px; min-height: 14px; color: var(--fg-muted, #71717a); }
    .ctd-validation.err { color: #ef5350; }
    .ctd-validation.ok  { color: #4caf50; }

    .ctd-recents-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--fg-muted, #52525b);
      margin-bottom: 4px;
    }
    .ctd-recents-list { display: flex; flex-direction: column; gap: 2px; max-height: 130px; overflow-y: auto; }
    .ctd-recent-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 4px 8px; border-radius: 3px; cursor: pointer; border: 1px solid transparent;
    }
    .ctd-recent-item:hover { background: rgba(255,255,255,0.05); border-color: var(--border, #2e2e38); }
    .ctd-recent-item .r-path {
      font-family: var(--f-terminal, monospace); font-size: 10px; color: var(--fg, #d4d4d8);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
    }
    .ctd-recent-item .r-remove { font-size: 11px; color: var(--fg-muted, #52525b); cursor: pointer; padding: 0 0 0 8px; flex-shrink: 0; }
    .ctd-recent-item .r-remove:hover { color: #ef5350; }

    .ctd-new-folder-row {
      display: flex; gap: 8px; align-items: center;
      background: rgba(255,255,255,0.03); border: 1px solid var(--border, #2e2e38);
      border-radius: 3px; padding: 6px 8px;
    }
    .ctd-new-folder-row label { color: var(--fg-muted, #71717a); font-size: 11px; white-space: nowrap; }
    .ctd-new-folder-name {
      flex: 1; background: transparent; border: none;
      border-bottom: 1px solid var(--border, #2e2e38);
      color: var(--fg, #d4d4d8); font-family: var(--f-terminal, monospace);
      font-size: 11px; padding: 2px 4px; outline: none;
    }
    .ctd-new-folder-name:focus { border-color: var(--accent, #6366f1); }
    .ctd-create-btn {
      padding: 3px 10px; border-radius: 2px; border: 1px solid var(--border, #2e2e38);
      background: transparent; color: var(--fg-muted, #71717a); cursor: pointer; font-size: 11px;
    }
    .ctd-create-btn:hover { color: #4caf50; border-color: #4caf50; }

    #sov-ext-ctd-modal footer {
      padding: 10px 16px; border-top: 1px solid var(--border, #2e2e38);
      display: flex; align-items: center; justify-content: space-between;
    }
    .ctd-footer-status { font-size: 11px; color: var(--fg-muted, #71717a); }
    .ctd-footer-actions { display: flex; gap: 8px; }

    .ctd-btn {
      padding: 6px 14px; border-radius: 3px; border: 1px solid var(--border, #2e2e38);
      font-size: 12px; cursor: pointer; font-family: var(--f-ui, sans-serif);
    }
    .ctd-btn.cancel { background: transparent; color: var(--fg-muted, #71717a); }
    .ctd-btn.cancel:hover { color: var(--fg, #d4d4d8); }
    .ctd-btn.confirm { background: var(--accent, #6366f1); color: #fff; border-color: transparent; font-weight: 600; }
    .ctd-btn.confirm:hover:not(:disabled) { opacity: 0.85; }
    .ctd-btn.confirm:disabled { opacity: 0.4; cursor: not-allowed; }
  `;
  document.head.appendChild(style);
}

// ─── Recents Persistence ─────────────────────────────────────────────────────

function loadRecents() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveRecent(path) {
  let recents = loadRecents().filter(r => r !== path);
  recents.unshift(path);
  if (recents.length > MAX_RECENTS) recents = recents.slice(0, MAX_RECENTS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recents));
}

function removeRecent(path) {
  const recents = loadRecents().filter(r => r !== path);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recents));
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let validationTimer = null;
async function validatePath(inputPath) {
  const p = inputPath.trim();
  if (!p) return { ok: false, msg: '' };
  try {
    await invoke('list_directory', { path: p });
    return { ok: true, msg: '✓ Directory exists' };
  } catch {
    return { ok: false, msg: 'Directory not found' };
  }
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function openModal(sourcePaths, currentPath) {
  if (document.getElementById('sov-ext-ctd-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'sov-ext-ctd-overlay';

  const sourceLabel = sourcePaths.length === 1
    ? sourcePaths[0].split(/[/\\]/).pop()
    : `${sourcePaths.length} items`;

  overlay.innerHTML = `
    <div id="sov-ext-ctd-modal" role="dialog" aria-modal="true" aria-label="Copy to Directory">
      <header>
        <div>
          <h2>Copy to Directory</h2>
          <div class="subtitle" title="${escHtml(sourcePaths.join(', '))}">
            Copying: ${escHtml(sourceLabel)}
          </div>
        </div>
        <button class="close">&#x2715;</button>
      </header>

      <div class="ctd-body">
        <div>
          <div class="ctd-field-row">
            <input
              id="ctd-path-input"
              class="ctd-path-input"
              type="text"
              placeholder="C:\\path\\to\\destination"
              value="${escHtml(currentPath || '')}"
              spellcheck="false"
              autofocus
            >
            <button class="ctd-new-folder-btn" id="ctd-toggle-new-folder">+ New Folder</button>
          </div>
          <div class="ctd-validation" id="ctd-validation"></div>
        </div>

        <div id="ctd-new-folder-section" style="display:none">
          <div class="ctd-new-folder-row">
            <label>New folder name:</label>
            <input class="ctd-new-folder-name" id="ctd-folder-name" type="text" placeholder="untitled folder" spellcheck="false">
            <button class="ctd-create-btn" id="ctd-create-folder-btn">Create</button>
          </div>
        </div>

        <div id="ctd-recents-section">
          <div class="ctd-recents-label">Recent Destinations</div>
          <div class="ctd-recents-list" id="ctd-recents-list"></div>
        </div>
      </div>

      <footer>
        <span class="ctd-footer-status" id="ctd-status"></span>
        <div class="ctd-footer-actions">
          <button class="ctd-btn cancel" id="ctd-cancel">Cancel</button>
          <button class="ctd-btn confirm" id="ctd-confirm" disabled>Copy Here</button>
        </div>
      </footer>
    </div>
  `;

  document.body.appendChild(overlay);

  const pathInput       = overlay.querySelector('#ctd-path-input');
  const validationEl    = overlay.querySelector('#ctd-validation');
  const confirmBtn      = overlay.querySelector('#ctd-confirm');
  const statusEl        = overlay.querySelector('#ctd-status');
  const newFolderSec    = overlay.querySelector('#ctd-new-folder-section');
  const toggleNFBtn     = overlay.querySelector('#ctd-toggle-new-folder');
  const folderNameIn    = overlay.querySelector('#ctd-folder-name');
  const createFolderBtn = overlay.querySelector('#ctd-create-folder-btn');
  const recentsList     = overlay.querySelector('#ctd-recents-list');

  let pathValid = false;

  function renderRecents() {
    const recents = loadRecents();
    if (!recents.length) {
      recentsList.closest('#ctd-recents-section').style.display = 'none';
      return;
    }
    recentsList.closest('#ctd-recents-section').style.display = '';
    recentsList.innerHTML = recents.map(r => `
      <div class="ctd-recent-item" data-path="${escHtml(r)}">
        <span class="r-path" title="${escHtml(r)}">${escHtml(r)}</span>
        <span class="r-remove" data-remove="${escHtml(r)}" title="Remove">&#x2715;</span>
      </div>
    `).join('');

    recentsList.querySelectorAll('.ctd-recent-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.dataset.remove) {
          removeRecent(e.target.dataset.remove);
          renderRecents();
          return;
        }
        pathInput.value = item.dataset.path;
        triggerValidation();
      });
    });
  }
  renderRecents();

  function triggerValidation() {
    const raw = pathInput.value.trim();
    pathInput.className = 'ctd-path-input';
    validationEl.textContent = '';
    validationEl.className = 'ctd-validation';
    confirmBtn.disabled = true;
    pathValid = false;
    if (!raw) return;

    clearTimeout(validationTimer);
    validationTimer = setTimeout(async () => {
      const result = await validatePath(raw);
      if (pathInput.value.trim() !== raw) return;
      pathInput.className = `ctd-path-input ${result.ok ? 'ok' : 'error'}`;
      validationEl.textContent = result.msg;
      validationEl.className = `ctd-validation ${result.ok ? 'ok' : 'err'}`;
      pathValid = result.ok;
      confirmBtn.disabled = !result.ok;
    }, 350);
  }

  pathInput.addEventListener('input', triggerValidation);

  toggleNFBtn.onclick = () => {
    const visible = newFolderSec.style.display !== 'none';
    newFolderSec.style.display = visible ? 'none' : 'flex';
    if (!visible) folderNameIn.focus();
  };

  createFolderBtn.onclick = async () => {
    const basePath = pathInput.value.trim();
    const name     = folderNameIn.value.trim();
    if (!basePath || !name) return;
    const sep     = basePath.includes('/') ? '/' : '\\';
    const newPath = basePath.endsWith(sep) ? basePath + name : basePath + sep + name;
    try {
      await invoke('create_dir', { name: newPath });
      pathInput.value = newPath;
      folderNameIn.value = '';
      newFolderSec.style.display = 'none';
      triggerValidation();
    } catch (err) {
      statusEl.textContent = `Could not create folder: ${err.message || err}`;
    }
  };

  folderNameIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createFolderBtn.click();
  });

  confirmBtn.onclick = async () => {
    const destFolder = pathInput.value.trim();
    if (!destFolder || !pathValid) return;
    confirmBtn.disabled = true;
    statusEl.textContent = `Copying ${sourcePaths.length} item${sourcePaths.length > 1 ? 's' : ''}...`;
    try {
      // IPC key is destFolder (camelCase) — matches operations.js usage
      await invoke('copy_files', { sources: sourcePaths, destFolder });
      saveRecent(destFolder);
      statusEl.textContent = 'Done';
      setTimeout(close, 600);
    } catch (err) {
      statusEl.textContent = `Error: ${err.message || err}`;
      confirmBtn.disabled = false;
    }
  };

  function close() { overlay.remove(); }
  overlay.querySelector('.close').onclick = close;
  overlay.querySelector('#ctd-cancel').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  if (pathInput.value) triggerValidation();
  pathInput.select();
}

// ─── Context Menu Injection ───────────────────────────────────────────────────
//
// sovereign-context-menu (#file-context-menu) is a persistent singleton.
// It rebuilds innerHTML via show(x, y, entry) on every right-click — it does
// NOT create a new DOM node. We watch it with a childList MutationObserver
// so our item is injected every time show() runs.
//
// Selection: file rows in sovereign-file-list get .selected class on [data-path]
// elements. We read those, falling back to ctx._entry when nothing is selected.

let navPath = null; // updated by sov:path-changed

function getSelectedPaths(contextMenu) {
  const fromDom = Array.from(
    document.querySelectorAll('sovereign-file-list [data-path].selected')
  ).map(el => el.dataset.path).filter(Boolean);

  if (fromDom.length) return fromDom;

  // Fallback: the entry passed to show(x, y, entry) is stored as _entry
  const entry = contextMenu?._entry;
  return entry?.path ? [entry.path] : [];
}

function injectContextItem(contextMenu) {
  if (contextMenu.querySelector(`#${CONTEXT_ID}`)) return; // idempotent

  const sources = getSelectedPaths(contextMenu);
  if (!sources.length) return; // background right-click — skip

  const item = document.createElement('div');
  item.id = CONTEXT_ID;
  // Match the ctx-item class used by sovereign-context-menu for hover styles
  item.className = 'ctx-item sov-ctx-copy-to-dir';
  item.innerHTML = '<i data-lucide="copy-plus"></i><span>' + CONTEXT_LABEL + '</span>';

  item.addEventListener('click', (e) => {
    e.stopPropagation();
    contextMenu.hide?.();
    openModal(sources, navPath);
  });

  contextMenu.appendChild(item);
  // Hydrate the lucide icon we just injected
  if (window.hydrateIcons) window.hydrateIcons();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function init() {
  injectStyles();
  appState.subscribe('currentPath', (path) => {
    navPath = path;
  });

  // Wait for the context menu element to exist (it's defined in index.html)
  function attachObserver() {
    const ctxMenu = document.getElementById('file-context-menu');
    if (!ctxMenu) {
      setTimeout(attachObserver, 300);
      return;
    }

    // Observe childList: fires whenever show() sets innerHTML
    const obs = new MutationObserver(() => {
      if (ctxMenu.style.display === 'none') return;
      injectContextItem(ctxMenu);
    });
    obs.observe(ctxMenu, { childList: true });
  }
  attachObserver();

  console.log('[ext:copy-to-dir] ready — right-click > "Copy to Directory"');
}
