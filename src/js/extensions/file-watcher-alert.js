/**
 * file-watcher-alert.js — Sovereign Explorer Extension
 *
 * Listens to sidecar-telemetry "momentum" events (emitted by main.py on file changes)
 * and shows a non-intrusive toast notification in the bottom-right corner.
 *
 * This is a great example for community devs of how to consume the sidecar pipe.
 *
 * Momentum event payload (from sidecar/main.py):
 *   { type: "momentum", data: { path, event_type, diff_lines?, timestamp } }
 *
 * Hook: listen('sidecar-telemetry', ...)
 * Load: import { init } from './extensions/file-watcher-alert.js'; init();
 */

import { listen } from '../ipc.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const CONFIG = {
  toastDurationMs:  4000,    // auto-dismiss after
  maxVisible:       4,       // max toasts on screen at once
  debounceMs:       300,     // collapse rapid events for same file
  // Note: extension filtering is handled upstream by sidecar/main.py (WATCHED_EXTS)
};

// ─── Styles ──────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('ext-file-watcher-styles')) return;
  const style = document.createElement('style');
  style.id = 'ext-file-watcher-styles';
  style.textContent = `
    #sov-ext-toast-rail {
      position: fixed;
      bottom: 40px;
      right: 14px;
      display: flex;
      flex-direction: column-reverse;
      gap: 6px;
      z-index: 9500;
      pointer-events: none;
    }

    .sov-ext-toast {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      background: var(--bg-panel, #1c1c22);
      border: 1px solid var(--border, #2e2e38);
      border-left: 3px solid var(--toast-accent, #6366f1);
      border-radius: 4px;
      padding: 8px 10px 8px 11px;
      min-width: 260px;
      max-width: 360px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      font-family: var(--f-ui, 'Inter', sans-serif);
      font-size: 11px;
      color: var(--fg, #d4d4d8);
      animation: sov-toast-in 0.18s ease forwards;
      cursor: pointer;
    }

    .sov-ext-toast.dismissing {
      animation: sov-toast-out 0.2s ease forwards;
    }

    .sov-ext-toast .toast-icon {
      font-size: 14px;
      line-height: 1.4;
      flex-shrink: 0;
    }

    .sov-ext-toast .toast-body { flex: 1; min-width: 0; }

    .sov-ext-toast .toast-file {
      font-family: var(--f-terminal, 'JetBrains Mono', monospace);
      font-size: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--fg, #d4d4d8);
    }

    .sov-ext-toast .toast-meta {
      color: var(--fg-muted, #71717a);
      font-size: 10px;
      margin-top: 2px;
    }

    .sov-ext-toast .toast-diff {
      font-family: var(--f-terminal, 'JetBrains Mono', monospace);
      font-size: 9px;
      color: #4caf50;
      margin-top: 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: 0.8;
    }
    .sov-ext-toast .toast-diff.removed { color: #ef5350; }

    .sov-ext-toast .toast-close {
      font-size: 13px;
      color: var(--fg-muted, #52525b);
      cursor: pointer;
      flex-shrink: 0;
      line-height: 1;
      align-self: flex-start;
      padding: 0 0 0 4px;
    }
    .sov-ext-toast .toast-close:hover { color: var(--fg, #d4d4d8); }

    /* Timer bar */
    .sov-ext-toast::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      height: 2px;
      background: var(--toast-accent, #6366f1);
      border-radius: 0 0 0 3px;
      animation: sov-toast-timer var(--toast-duration, 4000ms) linear forwards;
      opacity: 0.5;
    }
    .sov-ext-toast { position: relative; }

    @keyframes sov-toast-in {
      from { opacity: 0; transform: translateX(20px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes sov-toast-out {
      from { opacity: 1; transform: translateX(0); max-height: 80px; margin-bottom: 0; }
      to   { opacity: 0; transform: translateX(20px); max-height: 0; margin-bottom: -6px; }
    }
    @keyframes sov-toast-timer {
      from { width: 100%; }
      to   { width: 0%; }
    }
  `;
  document.head.appendChild(style);
}

function ensureRail() {
  let rail = document.getElementById('sov-ext-toast-rail');
  if (!rail) {
    rail = document.createElement('div');
    rail.id = 'sov-ext-toast-rail';
    document.body.appendChild(rail);
  }
  return rail;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

let activeToasts = 0;

/**
 * @param {string} filePath  - full file path from sidecar
 * @param {number} adds      - lines added (from sidecar difflib)
 * @param {number} subs      - lines removed
 */
function showToast(filePath, adds, subs) {
  if (activeToasts >= CONFIG.maxVisible) return;

  const rail  = ensureRail();
  const fname = filePath.split(/[/\\]/).pop();
  const dir   = filePath.split(/[/\\]/).slice(0, -1).join('/');
  const diffStr = [adds > 0 ? `+${adds}` : '', subs > 0 ? `−${subs}` : ''].filter(Boolean).join('  ');

  const toast = document.createElement('div');
  toast.className = 'sov-ext-toast';
  toast.style.setProperty('--toast-accent',   '#6366f1');
  toast.style.setProperty('--toast-duration', `${CONFIG.toastDurationMs}ms`);
  toast.innerHTML = `
    <span class="toast-icon">✎</span>
    <div class="toast-body">
      <div class="toast-file" title="${escHtml(filePath)}">${escHtml(fname)}</div>
      <div class="toast-meta">modified${dir ? ` · ${escHtml(shortPath(dir))}` : ''}${diffStr ? ` · <span style="font-family:var(--f-terminal,monospace);font-size:10px;opacity:0.8">${escHtml(diffStr)}</span>` : ''}</div>
    </div>
    <span class="toast-close" title="Dismiss">✕</span>
  `;

  activeToasts++;
  rail.appendChild(toast);

  function dismiss() {
    toast.classList.add('dismissing');
    toast.addEventListener('animationend', () => {
      toast.remove();
      activeToasts = Math.max(0, activeToasts - 1);
    }, { once: true });
  }

  toast.querySelector('.toast-close').onclick = (e) => { e.stopPropagation(); dismiss(); };
  toast.onclick = dismiss;

  const timer = setTimeout(dismiss, CONFIG.toastDurationMs);
  toast.addEventListener('mouseenter', () => clearTimeout(timer));
  // Note: doesn't re-start timer on mouse leave — intentional (power user UX)
}

function shortPath(p) {
  const parts = p.split(/[/\\]/);
  return parts.length > 3 ? '…/' + parts.slice(-2).join('/') : p;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Debounce Map ─────────────────────────────────────────────────────────────

const pending = new Map(); // path → timer

// Sidecar momentum payload shape: { file, path, adds, subs, time }
// (see sidecar/main.py MomentumHandler — only fires on WATCHED_EXTS modifications)
function handleMomentum(data) {
  const { path, adds, subs } = data;
  if (!path) return;

  // Debounce rapid events for the same file
  if (pending.has(path)) {
    clearTimeout(pending.get(path));
  }
  pending.set(path, setTimeout(() => {
    pending.delete(path);
    showToast(path, adds || 0, subs || 0);
  }, CONFIG.debounceMs));
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function init() {
  injectStyles();
  ensureRail();

  const unlisten = await listen('sidecar-telemetry', (event) => {
    try {
      const payload = event.payload;
      if (payload?.type === 'momentum' && payload?.data) {
        handleMomentum(payload.data);
      }
    } catch (err) {
      console.warn('[ext:file-watcher-alert] event error:', err);
    }
  });

  // Expose unlisten for teardown
  window.sovExtFileWatcher = { unlisten, config: CONFIG };

  console.log('[ext:file-watcher-alert] ready — watching sidecar momentum events');
}
