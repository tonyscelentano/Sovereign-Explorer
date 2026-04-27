// ═══════════════════════════════════════════════════════════════════════════════
// Sovereign Explorer — Main Orchestrator
// Boots the app and wires all modules together. No business logic lives here.
// ═══════════════════════════════════════════════════════════════════════════════

import { isTauri, invoke, listen }            from './js/ipc.js';
import './js/components/sovereign-icon-themer.js';
import './js/components/sovereign-scaffolder.js';
import './js/components/sovereign-context-menu.js';
import './js/components/sovereign-status-bar.js';
import './js/components/sovereign-extension-host.js';
import './js/components/sovereign-plugin-manager.js';
import './js/components/sovereign-visual-customizer.js';
import './js/components/sovereign-workspace-host.js';
import './js/extensions/disk-metabolism.js';
import './js/components/sovereign-bookmarks.js';
import ThemeManager                           from './js/theme.js';
import { initViewControls, rerender, initContextMenu } from './js/ui.js';
import { navigateTo, navigateToSilent, goBack, goUp, initDrives, getCurrentPath } from './js/fs.js';
import { appendLine, initTerminal }           from './js/terminal/index.js';
import { initToolbar }                        from './js/toolbar.js';
import { initLayout }                         from './js/layout.js';
import CommandPalette                         from './js/palette.js';
import Satchel                                from './js/satchel.js';
import { appState }                           from './js/state.js';
import { initTelemetry }                      from './js/telemetry.js';
import { initInspector }                      from './js/inspector.js';
import { initAddressBar }                     from './js/address-bar.js';
import { hydrateIcons } from './js/utils.js';

// Expose to window for inline handlers (like icon onerror)
window.hydrateIcons = hydrateIcons;
window.__sovBootDiag?.log('app.js loaded');

// ─── Cross-module wiring ────────────────────────────────────────────────────
// When theme swaps, re-render from cache (no IPC round-trip).
ThemeManager.onSwap(() => rerender());

async function bootStep(label, fn) {
    window.__sovBootDiag?.log(`boot ${label}`);
    try {
        return await fn();
    } catch (error) {
        console.error(`[boot] ${label} failed`, error);
        window.__sovBootDiag?.error(`${label} failed: ${error.message || error}`);
        appendLine(`${label} failed: ${error.message || error}`, 'line-err');
        return null;
    }
}

document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); goBack(); }
    if (e.altKey && e.key === 'ArrowUp')    { e.preventDefault(); goUp(); }
    if (e.key === 'Escape') {
        document.getElementById('telemetry-modal')?.classList.remove('open');
        document.getElementById('typo-modal')?.classList.remove('open');
        document.getElementById('icon-themer')?.classList.remove('open');
    }
});

// ─── Boot ───────────────────────────────────────────────────────────────────
async function boot() {
    appendLine('Sovereign Explorer v0.1.0');

    if (!isTauri()) {
        window.__sovBootDiag?.log('running without Tauri bridge');
        appendLine('Browser mode — run via: npm run tauri dev', 'line-warn');
    } else {
        window.__sovBootDiag?.log('Tauri bridge detected');
        appendLine('IPC bridge active.', 'line-ok');
    }

    await bootStep('theme init', () => ThemeManager.init());
    await bootStep('view controls', () => initViewControls());
    await bootStep('context menu', () => initContextMenu());
    await bootStep('drives', () => initDrives());
    await bootStep('terminal init', () => initTerminal());
    await bootStep('toolbar init', () => initToolbar());
    await bootStep('command palette', () => CommandPalette.init());
    await bootStep('satchel init', () => Satchel.init());
    await bootStep('telemetry init', () => initTelemetry());
    await bootStep('inspector init', () => initInspector());
    await bootStep('address bar', () => initAddressBar());
    await bootStep('layout init', () => initLayout());
    await bootStep('extensions', () => {
        const host = document.createElement('sovereign-extension-host');
        host.id = 'extension-host';
        document.getElementById('app').appendChild(host);
    });

    // ─── Native File Drop Handler ──────────────────────────────────────────
    if (isTauri()) {
        listen('tauri://file-drop', async (event) => {
            const paths = event.payload;
            const dest = getCurrentPath();
            if (paths.length > 0 && dest && dest !== 'this-pc') {
                try {
                    await invoke('copy_files', { sources: paths, destFolder: dest });
                    await navigateToSilent(dest);
                } catch (err) {
                    console.error("Drop failed:", err);
                }
            }
        });
    }

    if (isTauri()) {
        try {
            const home = await invoke('get_home_dir');
            window.__sovBootDiag?.log(`home resolved: ${home}`);
            appendLine(`Home: ${home}`, 'line-dim');
            localStorage.setItem('sovereign_home_dir', home);
            appState.state.homeDir = home;
            
            const startupPath = localStorage.getItem('sovereign_startup_path');
            if (startupPath) {
                appendLine(`Startup Path: ${startupPath}`, 'line-dim');
                navigateTo(startupPath);
            } else {
                navigateTo(home);
            }
        } catch (err) {
            window.__sovBootDiag?.error(`get_home_dir failed: ${err}`);
            appendLine(`Failed to resolve home: ${err}`, 'line-err');
        }
    }
}

boot();
