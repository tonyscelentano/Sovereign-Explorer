// ═══════════════════════════════════════════════════════════════════════════════
// Sovereign Explorer — Command Palette
// Deterministic pattern matcher for quick "spells" (commands).
// ═══════════════════════════════════════════════════════════════════════════════

import './components/sovereign-palette.js';

let palette = null;

const CommandPalette = {
    init() {
        palette = document.getElementById('command-palette');
    },
    open() { if (palette) palette.open(); },
    close() { if (palette) palette.close(); },
    toggle() { if (palette) palette.toggle(); }
};

export default CommandPalette;
