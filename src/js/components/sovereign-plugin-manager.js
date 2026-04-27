// ═══════════════════════════════════════════════════════════════════════════════
// Sovereign Plugin Manager
// UI for enabling/disabling and discovering installed extensions.
// ═══════════════════════════════════════════════════════════════════════════════

import registry from '../extensions/registry.js';
import { invoke } from '../ipc.js';

class SovereignPluginManager extends HTMLElement {
    constructor() {
        super();
        this.availableFiles = [];
    }

    connectedCallback() {
        this._ac = new AbortController();
        this.className = 'modal-backdrop';
        this._render();
        
        this.addEventListener('click', (e) => {
            if (e.target === this) this.close();
        });
    }

    async open() {
        await this._scanAvailable();
        this._render();
        this.classList.add('open');
    }

    close() {
        this.classList.remove('open');
    }

    async _scanAvailable() {
        try {
            const files = await invoke('list_plugin_files');
            // Filter out files that are already registered as plugins
            const registeredIds = registry.getAll().map(ext => ext.id);
            this.availableFiles = files.filter(f => {
                const id = f.replace('.js', '');
                // Special case for disk-metabolism which might already be in registry but has a different ID internal vs filename
                // We'll just check if it's already there by matching name or ID later if needed
                return !registeredIds.includes(id) && !registeredIds.includes(`${id}-hud`);
            });
        } catch (err) {
            console.error('[PluginManager] Scan failed:', err);
        }
    }

    async ingestPlugin(filename) {
        const id = filename.replace('.js', '');
        console.log(`[PluginManager] Ingesting: ${filename}`);
        
        try {
            // Dynamic import
            const module = await import(`../extensions/${filename}`);
            
            // If the module has an init() function (Claude style), wrap it for the registry
            if (module.init && typeof module.init === 'function') {
                const wrapped = {
                    id: id,
                    name: id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                    category: 'extension',
                    mount: async (target) => {
                        // For init-style plugins, they usually manage their own DOM injection
                        // but we can provide the target if they were updated to use it.
                        // For now, just call init().
                        await module.init();
                        return { unmount: () => {
                            // Note: Claude's basic plugins don't always have unmount logic
                            // but we can try to clean up styles if they followed the id convention
                            const style = document.getElementById(`ext-${id}-styles`);
                            if (style) style.remove();
                        }};
                    }
                };
                registry.register(wrapped);
            }
            
            // If it already self-registered (like disk-metabolism.js), it's already in registry.
            // We just need to refresh.
            await this._scanAvailable();
            this._render();
        } catch (err) {
            console.error(`[PluginManager] Ingestion failed for ${filename}:`, err);
            alert(`Failed to ingest ${filename}: ${err.message}`);
        }
    }

    async _togglePlugin(id) {
        const host = document.getElementById('extension-host');
        await registry.toggle(id, host);
        this._render();
    }

    _render() {
        const installed = registry.getAll();
        
        this.innerHTML = `
            <div class="modal-window" style="width: 550px;">
                <div class="modal-header">
                    <span class="modal-title">Plugin Manager</span>
                    <button class="modal-close-btn" id="plugin-manager-close">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <div class="plugin-section-label">Installed Plugins</div>
                    <div class="plugin-list">
                        ${installed.map(ext => `
                            <div class="plugin-card">
                                <div class="plugin-info">
                                    <div class="plugin-name">${ext.name}</div>
                                    <div class="plugin-meta">${ext.category || 'Utility'} • v1.0.0</div>
                                </div>
                                <label class="plugin-switch">
                                    <input type="checkbox" ${registry.isEnabled(ext.id) ? 'checked' : ''} 
                                           onchange="this.closest('sovereign-plugin-manager')._togglePlugin('${ext.id}')">
                                    <span class="slider"></span>
                                </label>
                            </div>
                        `).join('')}
                        ${installed.length === 0 ? '<div class="plugin-empty">No plugins installed.</div>' : ''}
                    </div>

                    ${this.availableFiles.length > 0 ? `
                        <div class="plugin-section-label" style="margin-top: 24px;">Available for Ingestion</div>
                        <div class="plugin-list">
                            ${this.availableFiles.map(file => `
                                <div class="plugin-card available">
                                    <div class="plugin-info">
                                        <div class="plugin-name">${file}</div>
                                        <div class="plugin-meta">Ready to plug-and-play</div>
                                    </div>
                                    <button class="ingest-btn" onclick="this.closest('sovereign-plugin-manager').ingestPlugin('${file}')">
                                        <i data-lucide="plus"></i>
                                        <span>Ingest</span>
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <span style="font-size: 10px; color: var(--text-dim);">Sovereign Extension API v1.0</span>
                    <button class="scan-btn" id="btn-plugin-installer">
                        <i data-lucide="refresh-cw"></i>
                        <span>Refresh Local Extensions</span>
                    </button>
                </div>
            </div>
            <style>
                .plugin-section-label { font-size: 9px; letter-spacing: 1.5px; color: var(--text-label); text-transform: uppercase; margin-bottom: 8px; }
                .plugin-list { display: flex; flex-direction: column; gap: 8px; }
                .plugin-card {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: var(--bg-0);
                    border: 1px solid var(--border);
                    border-radius: 6px;
                    padding: 10px 16px;
                }
                .plugin-card.available { border-style: dashed; opacity: 0.8; }
                .plugin-name { font-weight: 700; font-size: 12px; color: var(--accent); }
                .plugin-meta { font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
                
                .ingest-btn {
                    display: flex; align-items: center; gap: 6px; padding: 6px 12px;
                    background: var(--accent-dim); border: 1px solid var(--accent); 
                    border-radius: 4px; color: var(--accent); font-size: 10px; font-weight: 700;
                    text-transform: uppercase; cursor: pointer; transition: all 0.2s;
                }
                .ingest-btn:hover { background: var(--accent); color: #000; }
                .ingest-btn i { width: 12px; height: 12px; }

                .plugin-empty { color: var(--text-label); font-size: 11px; padding: 10px 0; font-style: italic; }

                /* Switch Style */
                .plugin-switch { position: relative; display: inline-block; width: 34px; height: 20px; }
                .plugin-switch input { opacity: 0; width: 0; height: 0; }
                .slider {
                    position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
                    background-color: var(--border); transition: .2s; border-radius: 20px;
                }
                .slider:before {
                    position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px;
                    background-color: white; transition: .2s; border-radius: 50%;
                }
                input:checked + .slider { background-color: var(--green); }
                input:checked + .slider:before { transform: translateX(14px); }
            </style>
        `;

        const closeBtn = this.querySelector('#plugin-manager-close');
        if (closeBtn) closeBtn.onclick = () => this.close();

        const refreshBtn = this.querySelector('#btn-plugin-installer');
        if (refreshBtn) refreshBtn.onclick = () => this.open();
        
        if (window.hydrateIcons) window.hydrateIcons();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    disconnectedCallback() {
        if (this._ac) {
            this._ac.abort();
            this._ac = null;
        }
    }
}

customElements.define('sovereign-plugin-manager', SovereignPluginManager);
export default SovereignPluginManager;
