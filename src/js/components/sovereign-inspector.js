import { hasInvoke, invoke, convertFileSrc } from '../ipc.js';
import { formatBytes, formatDateTime } from '../utils.js';
import { appState } from '../state.js';

export class SovereignInspector extends HTMLElement {
    constructor() {
        super();
        this.isOpen = false;
        this.panelEl = null;
        this.contentEl = null;
        this._peekDebounce = null;
        this._lastInspectedPath = null;
    }

    connectedCallback() {
        this._ac = new AbortController();
        this.render();
        this._bindRefs();
        this._restoreState();
        this._bindShortcuts();

        // Reactive Subscription
        this._unsubSelection = appState.subscribe('selection', (selection) => {
            if (selection.length === 1) {
                this.inspect(selection[0], { force: true });
            }
        });
    }

    render() {
        this.id = 'scrying-panel';
        this.innerHTML = `
            <div class="scrying-header">
                <i data-lucide="scan-eye" class="icon"></i>
                <span id="scry-title">INSPECTOR</span>
            </div>
            <div id="scrying-content">
                <div class="scry-placeholder">Click or hover a file to inspect.</div>
            </div>
        `;
        if (window.hydrateIcons) window.hydrateIcons();
    }

    _bindRefs() {
        this.contentEl = this.querySelector('#scrying-content');
        this.titleEl = this.querySelector('#scry-title');
    }

    _restoreState() {
        if (localStorage.getItem('scrying-open') === 'true') {
            this.toggle(true);
        }
    }

    _bindShortcuts() {
        // Toggle button in toolbar
        const toggleBtn = document.getElementById('btn-inspector');
        if (toggleBtn) toggleBtn.addEventListener('click', () => this.toggle());

        // Global keyboard shortcut (I)
        document.addEventListener('keydown', (e) => {
            const path = e.composedPath();
            const isInput = path.some(el => el.tagName && (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'textarea'));
            if (isInput) return;

            if (e.key.toLowerCase() === 'i') {
                e.preventDefault();
                this.toggle();
            }
        }, { signal: this._ac?.signal });
    }

    toggle(forceState) {
        this.isOpen = forceState !== undefined ? forceState : !this.isOpen;
        this.classList.toggle('open', this.isOpen);
        document.getElementById('main-layout')?.classList.toggle('inspector-open', this.isOpen);
        localStorage.setItem('scrying-open', this.isOpen ? 'true' : 'false');
    }

    async inspect(entry, options = {}) {
        if (!hasInvoke() || !entry || entry.is_dir) return;

        // If it's a peek (hover), debounce it so we don't thrash on fast movement
        if (options.peek && !options.force) {
            clearTimeout(this._peekDebounce);
            this._peekDebounce = setTimeout(() => {
                // Only peek if the panel is open OR if there's no selection
                const selection = appState.state.selection;
                if (this.isOpen || selection.length === 0) {
                    this._doInspect(entry, true);
                }
            }, 150);
            return;
        }

        this._doInspect(entry, false);
    }

    async _doInspect(entry, isPeek) {
        if (entry.path === this._lastInspectedPath && !isPeek) return;
        this._lastInspectedPath = entry.path;

        try {
            const meta = await invoke('file_metadata', { path: entry.path });
            let html = this._renderMetadata(meta);

            if (this.titleEl) {
                this.titleEl.textContent = isPeek ? 'INSPECTOR (PEEK)' : 'INSPECTOR';
                this.titleEl.style.color = isPeek ? 'var(--accent)' : 'inherit';
            }
            
            // Check for image type
            const isImage = meta.mime_guess && meta.mime_guess.startsWith('image/');
            if (isImage) {
                const src = convertFileSrc(entry.path);
                html = `
                    <div class="scry-image-container" style="margin-bottom: 16px; background: var(--bg-0); border: 1px solid var(--border); border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center; min-height: 100px;">
                        <img src="${src}" style="max-width: 100%; max-height: 300px; object-fit: contain;">
                    </div>
                ` + html;
            }

            if (!isPeek) {
                html += `<div class="scry-row scry-extract-status" id="scry-extract-status" style="margin-top: 12px; border-top: 1px solid var(--border); padding-top: 12px;">
                            <span class="scry-label">DEEP SCAN</span>
                            <span class="scry-value time-dim">Extracting...</span>
                         </div>`;
            }
                     
            this.contentEl.innerHTML = html;
            
            // Only auto-open on explicit click/selection, not on peek
            if (!isPeek && !this.isOpen) this.toggle(true);

            if (isPeek) return; // Don't do deep extraction on hover peek to save resources

            // 2. Trigger asynchronous deep extraction via python sidecar
            try {
                const raw = await invoke('extract_file_data', { path: entry.path });
                const extract_payload = JSON.parse(raw);
                
                const statusRow = this.querySelector('#scry-extract-status');
                if (statusRow) statusRow.remove();

                if (extract_payload.status === 'ok') {
                    if (extract_payload.type === 'text') {
                        const text = extract_payload.data;
                        const preview = text.length > 500 ? text.substring(0, 500) + '...' : text;
                        this.contentEl.innerHTML += `
                            <div class="scry-extract-box" style="margin-top: 12px;">
                                <div class="scry-label" style="margin-bottom: 6px;">CONTENT PREVIEW</div>
                                <div class="scry-text-preview">${preview.replace(/</g, '&lt;')}</div>
                            </div>`;
                    } else if (extract_payload.type === 'audio') {
                        const tagData = JSON.parse(extract_payload.data);
                        let audioHtml = '<div class="scry-extract-box" style="margin-top: 12px; border-top: 1px solid var(--border); padding-top: 6px;">';
                        Object.keys(tagData).forEach(k => {
                            audioHtml += `
                            <div class="scry-row">
                                <span class="scry-label">${k}</span>
                                <span class="scry-value" style="color: var(--amber)">${tagData[k]}</span>
                            </div>`;
                        });
                        audioHtml += '</div>';
                        this.contentEl.innerHTML += audioHtml;
                    }
                } else if (extract_payload.status === 'error') {
                     this.contentEl.innerHTML += `<div class="scry-error" style="margin-top: 12px;">Extraction Error: ${extract_payload.error}</div>`;
                }
            } catch (ext_err) {
                console.error("Deep extraction failed:", ext_err);
            }

        } catch (err) {
            this.contentEl.innerHTML = `<div class="scry-error">Could not inspect: ${err}</div>`;
        }
    }

    _renderMetadata(meta) {
        const rows = [
            ['File',     meta.name],
            ['Type',     meta.mime_guess],
            ['Size',     formatBytes(meta.size)],
            ['Modified', formatDateTime(meta.modified)],
            ['Created',  formatDateTime(meta.created)],
            ['Readonly', meta.is_readonly ? 'Yes' : 'No'],
        ];

        if (meta.line_count !== null && meta.line_count !== undefined) {
            rows.push(['Lines', meta.line_count.toLocaleString()]);
        }

        return rows.map(([k, v]) => `
            <div class="scry-row">
                <span class="scry-label">${k}</span>
                <span class="scry-value">${v}</span>
            </div>
        `).join('');
    }

    disconnectedCallback() {
        if (this._ac) {
            this._ac.abort();
            this._ac = null;
        }
        if (this._unsubSelection) this._unsubSelection();
    }
}

customElements.define('sovereign-inspector', SovereignInspector);
