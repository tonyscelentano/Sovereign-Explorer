// ─── Sovereign Status Bar ─────────────────────────────────────────────────────
// Shows item count, selection count, and selected total size.
// Responds to appState changes.

import { formatBytes } from '../utils.js';
import { getActivePaneId, getPane, subscribePane } from '../panes/store.js';

class SovereignStatusBar extends HTMLElement {
    connectedCallback() {
        this._ac = new AbortController();
        this.className = 'status-bar';
        this._paneId = this.getAttribute('pane-id') || getActivePaneId();

        this._unsubPane = subscribePane(this._paneId, (pane) => {
            this._render(pane);
        });
    }

    _render(pane = getPane(this._paneId)) {
        const selEntries = pane.selection || [];
        const selPaths = selEntries.map((entry) => entry.path);
        const total = Array.isArray(pane.entries) ? pane.entries.length : 0;

        const totalLabel = `${total} item${total !== 1 ? 's' : ''}`;
        let right = '';

        if (selPaths.length > 0) {
            const selSize = selEntries.reduce((sum, e) => sum + (e.size || 0), 0);
            right = `${selPaths.length} selected`;
            if (selSize > 0) right += ` &nbsp;(${formatBytes(selSize)})`;
        }

        this.innerHTML = `
            <span class="status-left">${totalLabel}</span>
            ${right ? `<span class="status-right">${right}</span>` : ''}
        `;
    }

    disconnectedCallback() {
        if (this._ac) {
            this._ac.abort();
            this._ac = null;
        }
        if (this._unsubPane) this._unsubPane();
    }
}

customElements.define('sovereign-status-bar', SovereignStatusBar);
export default SovereignStatusBar;
