// ═══════════════════════════════════════════════════════════════════════════════
// Sovereign Extension Host
// A dedicated layer for hovering plugin widgets and telemetry modules.
// ═══════════════════════════════════════════════════════════════════════════════

import registry from '../extensions/registry.js';

class SovereignExtensionHost extends HTMLElement {
    connectedCallback() {
        this._ac = new AbortController();
        this.className = 'extension-host-layer';
        this._initStyles();

        // 1. Process extensions already in the registry (only if enabled)
        registry.getAll().forEach(ext => {
            if (registry.isEnabled(ext.id)) {
                this.activateExtension(ext.id);
            }
        });

        // 2. Listen for future registrations
        window.addEventListener('sov:extension-registered', (e) => {
            const ext = e.detail;
            if (registry.isEnabled(ext.id)) {
                this.activateExtension(ext.id);
            }
        }, { signal: this._ac?.signal });

        // 3. Listen for manual toggles from the UI
        window.addEventListener('sov:extension-toggled', (e) => {
            const { id, enabled } = e.detail;
            if (enabled) {
                this.activateExtension(id);
            } else {
                registry.deactivate(id);
            }
        }, { signal: this._ac?.signal });
    }

    _initStyles() {
        // We use inline styles to keep this host isolated from main CSS files
        Object.assign(this.style, {
            position: 'absolute',
            top: '40px', /* Push down below the toolbar ribbon */
            right: '0',
            bottom: '0',
            left: '0',
            pointerEvents: 'none', 
            zIndex: '200', /* Ensure it stays above the file list but below modals */
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end', 
            justifyContent: 'flex-start',
            padding: '20px',
            gap: '12px'
        });
    }

    async activateExtension(id) {
        // Create a wrapper for this specific extension instance
        const container = document.createElement('div');
        container.className = `ext-widget-wrapper ext-${id}`;
        container.style.pointerEvents = 'auto'; // Re-enable clicks for the widget
        
        this.appendChild(container);
        await registry.activate(id, container);
    }

    disconnectedCallback() {
        if (this._ac) {
            this._ac.abort();
            this._ac = null;
        }
    }
}

customElements.define('sovereign-extension-host', SovereignExtensionHost);
export default SovereignExtensionHost;
