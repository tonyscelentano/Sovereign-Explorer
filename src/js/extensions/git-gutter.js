/**
 * git-gutter.js — Sovereign Explorer Extension
 *
 * Overlays git status badges (M/A/D/R/?) on file rows in the current directory.
 * Hooks: sov:path-changed, PTY spawn_command (git status --porcelain)
 *
 * Load: import { init } from './extensions/git-gutter.js'; init();
 */

import { invoke, listen } from '../ipc.js';
import { appState } from '../state.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const CONFIG = {
  debounceMs: 120,        // wait after nav before scanning
  timeoutMs: 4000,        // max time to wait for git output
  gitCommand: 'git',
};

const BADGE = {
  M:  { label: 'M', color: '#f0a500', title: 'Modified'  },
  A:  { label: 'A', color: '#4caf50', title: 'Added'     },
  D:  { label: 'D', color: '#ef5350', title: 'Deleted'   },
  R:  { label: 'R', color: '#42a5f5', title: 'Renamed'   },
  C:  { label: 'C', color: '#ab47bc', title: 'Copied'    },
  '?':{ label: '?', color: '#78909c', title: 'Untracked' },
  '!':{ label: '!', color: '#ff7043', title: 'Ignored'   },
};

// ─── State ───────────────────────────────────────────────────────────────────

let debounceTimer = null;
let currentPath   = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Spawn a one-shot PTY command and collect all stdout lines.
 * Resolves when the process exits or the timeout fires.
 */
async function spawnCollect(command, args, cwd, timeoutMs = CONFIG.timeoutMs) {
  const taskId = `job-${Date.now()}-gitgutter`;
  const lines  = [];
  let   settle;
  const done   = new Promise(r => (settle = r));

  const unlisten = await listen('terminal-output', (e) => {
    const { taskId: tid, stream, line } = e.payload;
    if (tid !== taskId) return;
    if (stream === 'stdout' && line) lines.push(line.trimEnd());
    if (stream === 'exit' || stream === 'error') { unlisten(); settle(); }
  });

  const timer = setTimeout(() => { unlisten(); settle(); }, timeoutMs);

  try {
    await invoke('spawn_command', { taskId, command: CONFIG.gitCommand, args, cwd });
  } catch (_) {
    unlisten();
    settle();
  }

  await done;
  clearTimeout(timer);
  return lines;
}

/**
 * Parse `git status --porcelain=v1` output into Map<filename → statusChar>
 * Handles renamed files (R old -> new) by keying on `new` name.
 */
function parsePortcelain(lines) {
  const map = new Map();
  for (const line of lines) {
    if (line.length < 4) continue;
    const xy   = line.slice(0, 2);           // e.g. "M ", " M", "??"
    const rest = line.slice(3);              // path (or "old -> new" for renames)
    const char = xy[0] !== ' ' ? xy[0] : xy[1]; // prefer index status
    const name = rest.includes(' -> ')
      ? rest.split(' -> ')[1].trim()
      : rest.trim();
    // strip leading quotes git adds for paths with spaces
    const cleanName = name.replace(/^"|"$/g, '');
    map.set(cleanName, char === '?' ? '?' : char);
  }
  return map;
}

/** Find the git repo root for a given path (null if not in a repo) */
async function findGitRoot(path) {
  const lines = await spawnCollect(
    CONFIG.gitCommand,
    ['rev-parse', '--show-toplevel'],
    path,
    2000
  );
  return lines.length > 0 ? lines[0].trim() : null;
}

// ─── DOM Injection ────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('ext-git-gutter-styles')) return;
  const style = document.createElement('style');
  style.id = 'ext-git-gutter-styles';
  style.textContent = `
    .sov-git-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      border-radius: 2px;
      font-size: 9px;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
      line-height: 1;
      margin-left: 5px;
      flex-shrink: 0;
      opacity: 0.9;
      cursor: default;
      vertical-align: middle;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Clear all existing badges (called before each re-render).
 */
function clearBadges() {
  document.querySelectorAll('.sov-git-badge').forEach(el => el.remove());
}

/**
 * Walk the file list DOM and inject badges where we have status data.
 * Looks for elements with a `data-name` or `data-path` attribute on rows.
 */
function applyBadges(statusMap, repoRoot) {
  clearBadges();
  if (!statusMap.size) return;

  // sovereign-file-list renders rows; try common selectors
  const rows = document.querySelectorAll(
    'sovereign-file-list [data-path]'
  );

  rows.forEach(row => {
    const path = row.dataset.path;
    if (!path) return;
    const name = path.split(/[\/\\]/).pop();

    const statusChar = statusMap.get(name);
    if (!statusChar) return;

    const def = BADGE[statusChar] || BADGE['?'];
    const badge = document.createElement('span');
    badge.className = 'sov-git-badge';
    badge.textContent = def.label;
    badge.title = `Git: ${def.title}`;
    badge.style.background = def.color + '33'; // 20% opacity bg
    badge.style.color = def.color;
    badge.style.border = `1px solid ${def.color}66`;

    // Try to append after the filename text node / name cell
    const nameCell = row.querySelector('.sov-name, .file-name, [data-col="name"]') || row;
    nameCell.appendChild(badge);
  });
}

// ─── Core Scan ───────────────────────────────────────────────────────────────

async function scan(path) {
  if (!path) return;

  try {
    const repoRoot = await findGitRoot(path);
    if (!repoRoot) {
      clearBadges();
      return;
    }

    const lines     = await spawnCollect(CONFIG.gitCommand, ['status', '--porcelain=v1'], repoRoot);
    const statusMap = parsePortcelain(lines);

    // Remap: git paths are relative to repo root, we need relative to current dir
    // Build a filtered map with just the base filename for current dir
    const localMap = new Map();
    for (const [filePath, status] of statusMap) {
      // filePath is relative to repoRoot — get just the last segment if in currentPath
      const parts = filePath.split('/');
      const base  = parts[parts.length - 1];
      localMap.set(base, status);
    }

    // Small delay to let the file list DOM finish rendering
    await new Promise(r => setTimeout(r, 60));
    applyBadges(localMap, repoRoot);

  } catch (err) {
    console.warn('[ext:git-gutter] scan error:', err);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function init() {
  injectStyles();

  window.addEventListener('sov:path-changed', (e) => {
    currentPath = e.detail?.path || null;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => scan(currentPath), CONFIG.debounceMs);
  });

  // Also re-apply after list re-renders (list emits this if you add it; currently optional)
  window.addEventListener('sov:list-rendered', () => {
    if (currentPath) scan(currentPath);
  });

  console.log('[ext:git-gutter] ready');
}
