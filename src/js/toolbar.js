// ═══════════════════════════════════════════════════════════════════════════════
// Sovereign Explorer — Toolbar Menus
// Manages dropdown menus for Settings, Theme, and IPC Telemetry modal.
// ═══════════════════════════════════════════════════════════════════════════════

import { getCurrentPath } from './fs.js';

// ─── Dropdown Toggle Logic ──────────────────────────────────────────────────

/** Close all open toolbar dropdowns */
function closeAllMenus() {
    document.querySelectorAll('.toolbar-dropdown.open').forEach(d => d.classList.remove('open'));
}

/** Toggle a specific dropdown by id */
function toggleMenu(id) {
    const dropdown = document.getElementById(id);
    const wasOpen = dropdown.classList.contains('open');
    closeAllMenus();
    if (!wasOpen) dropdown.classList.add('open');
}

function openTelemetryModal() {
    document.getElementById('telemetry-modal').classList.add('open');
}

function closeTelemetryModal() {
    document.getElementById('telemetry-modal').classList.remove('open');
}

function safeParseArray(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch (_) {
        localStorage.removeItem(key);
        return null;
    }
}

// ─── Init ───────────────────────────────────────────────────────────────────

export function initToolbar() {
    // Wire up menu buttons
    document.getElementById('menu-settings').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu('dropdown-settings');
    });

    document.getElementById('menu-theme').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu('dropdown-theme');
    });

    document.getElementById('menu-telemetry').addEventListener('click', () => {
        closeAllMenus();
        openTelemetryModal();
    });

    const btnPlugins = document.getElementById('btn-plugins');
    if (btnPlugins) {
        btnPlugins.addEventListener('click', () => {
            console.log('[Toolbar] Plugins button clicked');
            closeAllMenus();
            const pm = document.getElementById('plugin-manager');
            if (pm) {
                pm.open();
            } else {
                console.error('[Toolbar] Plugin Manager element not found');
            }
        });
    } else {
        console.error('[Toolbar] btn-plugins not found in DOM');
    }

    // ─── Icon Themer ───
    const btnOpenIconThemer = document.getElementById('btn-open-icon-themer');
    const iconThemer = document.getElementById('icon-themer');
    if (btnOpenIconThemer && iconThemer) {
        btnOpenIconThemer.addEventListener('click', () => {
            closeAllMenus();
            iconThemer.open();
        });
    }

    // Close modal via backdrop or close button
    document.getElementById('telemetry-modal').addEventListener('click', (e) => {
        if (e.target.id === 'telemetry-modal') closeTelemetryModal();
    });
    document.getElementById('modal-close').addEventListener('click', closeTelemetryModal);

    // Close dropdowns on body click
    document.addEventListener('click', closeAllMenus);

    // Prevent dropdown clicks from bubbling to body
    document.querySelectorAll('.toolbar-dropdown').forEach(d => {
        d.addEventListener('click', (e) => e.stopPropagation());
    });

    // ─── Settings Preferences ────────────────────────────
    const optMomentum = document.getElementById('opt-momentum-sidebar');
    const optHidden = document.getElementById('opt-hidden-files');

    const isMomentumHidden = localStorage.getItem('hide-momentum-sidebar') === 'true';
    const isShowHidden = localStorage.getItem('sov_show_hidden') === 'true';
    
    if (isMomentumHidden) {
        document.body.classList.add('hide-momentum-sidebar');
        optMomentum.checked = false;
    }

    if (isShowHidden) {
        import('./state.js').then(m => m.appState.state.showHidden = true);
        optHidden.checked = true;
    }
    
    optMomentum.addEventListener('change', (e) => {
        if (e.target.checked) {
            document.body.classList.remove('hide-momentum-sidebar');
            localStorage.setItem('hide-momentum-sidebar', 'false');
        } else {
            document.body.classList.add('hide-momentum-sidebar');
            localStorage.setItem('hide-momentum-sidebar', 'true');
        }
    });

    optHidden.addEventListener('change', (e) => {
        const val = e.target.checked;
        import('./state.js').then(m => {
            m.appState.state.showHidden = val;
            localStorage.setItem('sov_show_hidden', val ? 'true' : 'false');
        });
    });

    // ─── Startup Path Logic ────────────────────────────
    const startupDisplay = document.getElementById('startup-path-display');
    const btnClearStartup = document.getElementById('btn-clear-startup');

    const updateStartupUI = () => {
        const path = localStorage.getItem('sovereign_startup_path');
        if (startupDisplay) {
            startupDisplay.textContent = path || 'None (Home)';
            startupDisplay.title = path || 'Click to set CURRENT folder as startup, or right-click any folder.';
        }
    };

    window.addEventListener('sov:startup-path-changed', updateStartupUI);

    if (startupDisplay) {
        startupDisplay.addEventListener('click', () => {
            const current = getCurrentPath();
            if (current && current !== 'this-pc') {
                localStorage.setItem('sovereign_startup_path', current);
                updateStartupUI();
            }
        });
    }

    if (btnClearStartup) {
        btnClearStartup.addEventListener('click', () => {
            localStorage.removeItem('sovereign_startup_path');
            updateStartupUI();
        });
    }
    updateStartupUI();

    // ─── Typography Polish (Advanced) ───────────────────────────────
    const typoModal = document.getElementById('typo-modal');
    const typoClose = document.getElementById('typo-close');
    const btnOpenTypo = document.getElementById('btn-open-typo');
    const btnRefresh = document.getElementById('btn-refresh-fonts');

    const uiFontSelect = document.getElementById('typo-ui-font');
    const uiWeightRange = document.getElementById('typo-ui-weight');
    const uiSizeRange = document.getElementById('typo-ui-size');
    const monoFontSelect = document.getElementById('typo-mono-font');
    const monoWeightRange = document.getElementById('typo-mono-weight');
    const monoSizeRange = document.getElementById('typo-mono-size');
    const monoGlowRange = document.getElementById('typo-mono-glow');
    const monoBgColor = document.getElementById('typo-mono-bg');
    const monoTextColor = document.getElementById('typo-mono-color');

    const uiWeightVal = document.getElementById('val-ui-weight');
    const uiSizeVal = document.getElementById('val-ui-size');
    const monoWeightVal = document.getElementById('val-mono-weight');
    const monoSizeVal = document.getElementById('val-mono-size');
    const monoGlowVal = document.getElementById('val-mono-glow');

    const applyTypo = (zone, prop, val) => {
        const root = document.documentElement;
        if (zone === 'ui') {
            if (prop === 'font') root.style.setProperty('--f-ui', val);
            if (prop === 'weight') { root.style.setProperty('--f-ui-weight', val); uiWeightVal.textContent = val; }
            if (prop === 'size') { root.style.setProperty('--f-ui-size', val + 'px'); uiSizeVal.textContent = val + 'px'; }
        } else {
            if (prop === 'font') root.style.setProperty('--f-terminal', val);
            if (prop === 'weight') { root.style.setProperty('--f-terminal-weight', val); monoWeightVal.textContent = val; }
            if (prop === 'size') { root.style.setProperty('--f-terminal-size', val + 'px'); monoSizeVal.textContent = val + 'px'; }
            if (prop === 'glow') { root.style.setProperty('--f-terminal-glow', val); monoGlowVal.textContent = val; }
            if (prop === 'bg') root.style.setProperty('--f-terminal-bg', val);
            if (prop === 'color') root.style.setProperty('--f-terminal-color', val);
        }
        localStorage.setItem(`sov_f_${zone}_${prop}`, val);

        if (zone === 'terminal') {
            // Allow terminal dock to hot-apply theme and typography without a reload.
            window.dispatchEvent(new CustomEvent('sov:terminal-style-changed'));
        }
    };

    const populateFontList = (fonts) => {
        const uiVal = uiFontSelect.value;
        const monoVal = monoFontSelect.value;
        
        const uiDefault = '<option value="\'Inter\', sans-serif" style="font-family: \'Inter\', sans-serif">Inter (Default)</option><option value="system-ui" style="font-family: system-ui">System UI</option>';
        const monoDefault = '<option value="\'JetBrains Mono\', monospace" style="font-family: \'JetBrains Mono\', monospace">JetBrains Mono (Default)</option><option value="monospace" style="font-family: monospace">Standard Monospace</option>';
        
        uiFontSelect.innerHTML = uiDefault;
        monoFontSelect.innerHTML = monoDefault;
        
        fonts.forEach(f => {
            const opt = `<option value="'${f}'" style="font-family: '${f}'">${f}</option>`;
            uiFontSelect.innerHTML += opt;
            monoFontSelect.innerHTML += opt;
        });

        // Restore values after re-populating
        uiFontSelect.value = uiVal;
        monoFontSelect.value = monoVal;
    };

    const scanFonts = async (force = false) => {
        const cached = safeParseArray('sovereign_fonts_cache');
        if (cached && !force) {
            populateFontList(cached);
            return;
        }

        btnRefresh.classList.add('spinning');
        try {
            const fonts = await (import('./ipc.js')).then(m => m.invoke('get_system_fonts'));
            localStorage.setItem('sovereign_fonts_cache', JSON.stringify(fonts));
            populateFontList(fonts);
        } catch (e) { console.error("Font scan failed:", e); }
        btnRefresh.classList.remove('spinning');
    };

    // Listeners
    btnOpenTypo.addEventListener('click', () => {
        closeAllMenus();
        typoModal.classList.add('open');
        scanFonts();
    });

    document.getElementById('btn-open-visuals').addEventListener('click', () => {
        closeAllMenus();
        document.getElementById('visual-customizer-modal')?.open();
    });

    typoClose.addEventListener('click', () => typoModal.classList.remove('open'));
    typoModal.addEventListener('click', (e) => { if (e.target === typoModal) typoModal.classList.remove('open'); });
    btnRefresh.addEventListener('click', () => scanFonts(true));

    uiFontSelect.addEventListener('change', (e) => applyTypo('ui', 'font', e.target.value));
    uiWeightRange.addEventListener('input', (e) => applyTypo('ui', 'weight', e.target.value));
    uiSizeRange.addEventListener('input', (e) => applyTypo('ui', 'size', e.target.value));
    
    monoFontSelect.addEventListener('change', (e) => applyTypo('terminal', 'font', e.target.value));
    monoWeightRange.addEventListener('input', (e) => applyTypo('terminal', 'weight', e.target.value));
    monoSizeRange.addEventListener('input', (e) => applyTypo('terminal', 'size', e.target.value));
    monoGlowRange.addEventListener('input', (e) => applyTypo('terminal', 'glow', e.target.value));
    monoBgColor.addEventListener('input', (e) => applyTypo('terminal', 'bg', e.target.value));
    monoTextColor.addEventListener('input', (e) => applyTypo('terminal', 'color', e.target.value));

    // Initial Load
    const loadSaved = () => {
        // Pre-populate selectors from cache so they aren't blank
        const cachedFonts = safeParseArray('sovereign_fonts_cache');
        if (cachedFonts) populateFontList(cachedFonts);

        const settings = [
            ['ui', 'font', "'Inter', sans-serif"], ['ui', 'weight', '400'], ['ui', 'size', '13'],
            ['terminal', 'font', "'JetBrains Mono', monospace"], ['terminal', 'weight', '400'], 
            ['terminal', 'size', '12'], ['terminal', 'glow', '0'],
            ['terminal', 'bg', '#000000'], ['terminal', 'color', '#00ff00']
        ];
        settings.forEach(([zone, prop, def]) => {
            const val = localStorage.getItem(`sov_f_${zone}_${prop}`) || def;
            applyTypo(zone, prop, val);
            // Update UI elements to match
            const elId = zone === 'ui' ? `typo-ui-${prop}` : `typo-mono-${prop}`;
            const el = document.getElementById(elId);
            if (el) el.value = val;
        });
    };
    loadSaved();
}
