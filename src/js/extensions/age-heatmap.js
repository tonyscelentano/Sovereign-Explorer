/**
 * age-heatmap.js — Sovereign Explorer Extension
 *
 * Reads mtime from window.__sovDirectoryEntries and injects a CSS custom property
 * --age-heat (0.0 → 1.0) on each file row. The modified-date cell gets a subtle
 * cold-to-warm color gradient: recent files glow warm, ancient ones fade cold.
 *
 * Zero IPC — pure read-only DOM decoration.
 * Hook: sov:path-changed, MutationObserver on file list
 *
 * Load: import { init } from './extensions/age-heatmap.js'; init();
 */

// ─── Config ──────────────────────────────────────────────────────────────────

const CONFIG = {
  // Oldest file age that gets the "coldest" colour (anything older = same cold)
  maxAgeDays: 365,
  // Colour stops: [age-fraction 0=newest → 1=oldest]
  // Each stop: [r, g, b]
  heatStops: [
    [255, 183,  77],   // 0.0 — just modified  → warm amber
    [129, 199, 132],   // 0.3 — days ago        → soft green
    [100, 181, 246],   // 0.6 — weeks ago       → muted blue
    [ 97,  97, 111],   // 1.0 — ancient         → cold grey
  ],
  renderDelayMs: 80,   // wait for file list DOM after nav
};

// ─── Colour Math ─────────────────────────────────────────────────────────────

function lerpStops(stops, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const seg     = (stops.length - 1) * clamped;
  const lo      = Math.floor(seg);
  const hi      = Math.min(lo + 1, stops.length - 1);
  const frac    = seg - lo;
  return stops[lo].map((v, i) => Math.round(v + (stops[hi][i] - v) * frac));
}

function toRgba(stops, t, alpha = 0.85) {
  const [r, g, b] = lerpStops(stops, t);
  return `rgba(${r},${g},${b},${alpha})`;
}

function ageFraction(mtime) {
  const nowMs  = Date.now();
  const fileMs = typeof mtime === 'number'
    ? mtime                  // already milliseconds (utils.js formatDate confirms this)
    : new Date(mtime).getTime();
  const ageDays = (nowMs - fileMs) / 86_400_000;
  return Math.min(1, Math.max(0, ageDays / CONFIG.maxAgeDays));
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('ext-age-heatmap-styles')) return;
  const style = document.createElement('style');
  style.id = 'ext-age-heatmap-styles';
  style.textContent = `
    /* Applied to file rows that have been annotated */
    [data-age-heat] .col-modified {
      color: var(--age-heat-color) !important;
      transition: color 0.15s ease;
    }

    /* Optional: subtle left-border accent on the row */
    [data-age-heat="fresh"] {
      border-left: 2px solid rgba(255,183,77,0.6);
    }
    [data-age-heat="recent"] {
      border-left: 2px solid rgba(129,199,132,0.4);
    }
    [data-age-heat="old"] {
      border-left: 2px solid rgba(100,181,246,0.25);
    }
    [data-age-heat="ancient"] {
      border-left: 2px solid rgba(97,97,111,0.15);
    }

    /* Heatmap legend widget */
    #sov-ext-age-legend {
      position: fixed;
      bottom: 36px;
      right: 16px;
      display: none;
      align-items: center;
      gap: 6px;
      font-family: var(--f-ui, sans-serif);
      font-size: 9px;
      color: var(--fg-muted, #71717a);
      pointer-events: none;
      z-index: 100;
      opacity: 0.7;
    }
    #sov-ext-age-legend.visible { display: flex; }
    #sov-ext-age-legend .bar {
      width: 80px;
      height: 4px;
      border-radius: 2px;
      background: linear-gradient(
        to right,
        rgba(255,183,77,0.9),
        rgba(129,199,132,0.8),
        rgba(100,181,246,0.7),
        rgba(97,97,111,0.5)
      );
    }
  `;
  document.head.appendChild(style);
}

function ensureLegend() {
  if (document.getElementById('sov-ext-age-legend')) return;
  const el = document.createElement('div');
  el.id = 'sov-ext-age-legend';
  el.innerHTML = `
    <span>new</span>
    <div class="bar"></div>
    <span>old</span>
  `;
  document.body.appendChild(el);
}

// ─── Apply ────────────────────────────────────────────────────────────────────

function bucketLabel(frac) {
  if (frac < 0.15) return 'fresh';
  if (frac < 0.40) return 'recent';
  if (frac < 0.75) return 'old';
  return 'ancient';
}

function applyHeat() {
  const entries = window.__sovDirectoryEntries;
  if (!entries?.length) return;

  // Build lookup: name → mtime fraction
  const heatMap = new Map();
  for (const entry of entries) {
    const mtime = entry.modified || entry.mtime || entry.last_modified;
    if (mtime == null) continue;
    heatMap.set(entry.name, ageFraction(mtime));
  }

  if (!heatMap.size) return;

  // Walk file list rows
  const rows = document.querySelectorAll(
    'sovereign-file-list [data-path]'
  );

  let annotated = 0;
  rows.forEach(row => {
    const path = row.dataset.path;
    if (!path) return;
    const name = path.split(/[\/\\]/).pop();
    if (!heatMap.has(name)) return;

    const frac  = heatMap.get(name);
    const color = toRgba(CONFIG.heatStops, frac);
    const label = bucketLabel(frac);

    row.setAttribute('data-age-heat', label);
    row.style.setProperty('--age-heat-color', color);
    annotated++;
  });

  // Show legend if we annotated anything
  const legend = document.getElementById('sov-ext-age-legend');
  if (legend) legend.classList.toggle('visible', annotated > 0);
}

function clearHeat() {
  document.querySelectorAll('[data-age-heat]').forEach(el => {
    el.removeAttribute('data-age-heat');
    el.style.removeProperty('--age-heat-color');
  });
  const legend = document.getElementById('sov-ext-age-legend');
  if (legend) legend.classList.remove('visible');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function init() {
  injectStyles();
  ensureLegend();

  let renderTimer = null;

  appState.subscribe('currentPath', () => {
    clearHeat();
    clearTimeout(renderTimer);
    renderTimer = setTimeout(applyHeat, CONFIG.renderDelayMs);
  });

  // Re-apply if list re-renders (e.g. sort change)
  window.addEventListener('sov:list-rendered', () => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(applyHeat, 40);
  });

  // MutationObserver fallback: watch for file rows appearing in the DOM
  // (covers cases where the file list re-renders without dispatching events)
  const fileListHost = () => document.querySelector('sovereign-file-list');
  const observer = new MutationObserver(() => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(applyHeat, 60);
  });

  function attachObserver() {
    const host = fileListHost();
    if (host) {
      observer.observe(host, { childList: true, subtree: true });
    } else {
      setTimeout(attachObserver, 500);
    }
  }
  attachObserver();

  console.log('[ext:age-heatmap] ready');
}
er();

  console.log('[ext:age-heatmap] ready');
}
