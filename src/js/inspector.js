// ═══════════════════════════════════════════════════════════════════════════════
// Sovereign Explorer — Scrying Inspector
// Contextual file preview panel. Click a file to reveal deep metadata.
// ═══════════════════════════════════════════════════════════════════════════════

import './components/sovereign-inspector.js';

let inspector = null;

export function initInspector() {
    inspector = document.getElementById('scrying-panel');
}

export function inspect(entry, options = {}) {
    if (inspector) inspector.inspect(entry, options);
}

export function toggle() {
    if (inspector) inspector.toggle();
}
