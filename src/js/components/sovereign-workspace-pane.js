import { appState } from '../state.js';
import { getCurrentPath, goBack, goUp, navigateTo, renderBreadcrumb } from '../fs.js';
import { getActivePaneId, getPane, patchPane, setActivePane, subscribePane } from '../panes/store.js';
import { toggle as toggleInspector } from '../inspector.js';
import './sovereign-file-list.js';
import './sovereign-status-bar.js';

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export class SovereignWorkspacePane extends HTMLElement {
    constructor() {
        super();
        this._searchDebounce = null;
        this._lastRenderState = null;
        this._addressBarActive = false;
    }

    connectedCallback() {
        this._ac = new AbortController();
        this._paneId = this.getAttribute('pane-id') || 'primary';
        this._paneRole = this.getAttribute('pane-role') || this._paneId;
        this.classList.add('workspace-pane');

        this.render();
        this._bindRefs();
        this._wireActions();

        this._unsubPane = subscribePane(this._paneId, (pane) => {
            this._syncFromPane(pane);
        });
        this._unsubActivePane = appState.subscribe('activePaneId', () => this._syncActiveState());

        this._syncActiveState();
    }

    render() {
        this.innerHTML = `
            <header class="workspace-action-bar">
                <div class="workspace-nav-buttons">
                    <button type="button" class="workspace-nav-btn" data-nav="back" title="Back (Alt+←)">
                        <i data-lucide="arrow-left"></i>
                    </button>
                    <button type="button" class="workspace-nav-btn" data-nav="home" title="Go to Home">
                        <i data-lucide="home"></i>
                    </button>
                    <button type="button" class="workspace-nav-btn" data-nav="up" title="Up (Alt+↑)">
                        <i data-lucide="arrow-up"></i>
                    </button>
                </div>

                <div class="workspace-breadcrumb"></div>
                <input type="text" class="address-bar-input workspace-address-input" autocomplete="off" spellcheck="false" placeholder="Type a path and press Enter…" style="display:none;">

                <div class="search-container workspace-search">
                    <i data-lucide="search" class="search-icon"></i>
                    <input type="text" class="workspace-search-input" placeholder="Search by intent…" autocomplete="off" spellcheck="false">
                </div>

                <div class="workspace-view-controls">
                    <button type="button" class="workspace-view-btn" data-view="grid" title="Grid View">
                        <i data-lucide="layout-grid"></i>
                    </button>
                    <button type="button" class="workspace-view-btn" data-view="list" title="List View">
                        <i data-lucide="list"></i>
                    </button>
                    <button type="button" class="workspace-view-btn view-btn-sep workspace-inspector-btn" title="Toggle Inspector (I)">
                        <i data-lucide="panel-right"></i>
                    </button>
                    ${this._paneRole === 'primary' ? `
                    <button type="button" class="workspace-view-btn workspace-split-toggle-btn" title="Toggle Split Pane">
                        <i data-lucide="columns-2"></i>
                    </button>
                    ` : ''}
                    ${this._paneRole === 'secondary' ? `
                    <button type="button" class="workspace-view-btn workspace-close-pane-btn" title="Close Secondary Pane">
                        <i data-lucide="x"></i>
                    </button>
                    ` : ''}
                </div>
            </header>

            <sovereign-file-list class="file-list-host"></sovereign-file-list>
            <sovereign-status-bar class="workspace-status-bar" pane-id="${this._paneId}"></sovereign-status-bar>
        `;

        if (window.hydrateIcons) window.hydrateIcons();
    }

    _bindRefs() {
        this._breadcrumbEl = this.querySelector('.workspace-breadcrumb');
        this._addressInputEl = this.querySelector('.workspace-address-input');
        this._searchInputEl = this.querySelector('.workspace-search-input');
        this._fileListEl = this.querySelector('sovereign-file-list');
        this._statusBarEl = this.querySelector('sovereign-status-bar');

        this._fileListEl?.setPaneId(this._paneId);
        if (this._statusBarEl) this._statusBarEl.setAttribute('pane-id', this._paneId);
    }

    _wireActions() {
        this.addEventListener('pointerdown', () => setActivePane(this._paneId), { signal: this._ac?.signal });

        this.querySelector('[data-nav="back"]')?.addEventListener('click', () => {
            setActivePane(this._paneId);
            goBack({ paneId: this._paneId });
        }, { signal: this._ac?.signal });

        this.querySelector('[data-nav="home"]')?.addEventListener('click', () => {
            setActivePane(this._paneId);
            const home = appState.state.homeDir || localStorage.getItem('sovereign_home_dir');
            if (home) navigateTo(home, { paneId: this._paneId });
        }, { signal: this._ac?.signal });

        this.querySelector('[data-nav="up"]')?.addEventListener('click', () => {
            setActivePane(this._paneId);
            goUp({ paneId: this._paneId });
        }, { signal: this._ac?.signal });

        this.querySelectorAll('[data-view]').forEach((button) => {
            button.addEventListener('click', () => {
                setActivePane(this._paneId);
                patchPane(this._paneId, (pane) => ({
                    ...pane,
                    viewMode: button.dataset.view
                }));
                if (this._paneId === 'primary') {
                    localStorage.setItem('sovereign_view', button.dataset.view);
                }
            }, { signal: this._ac?.signal });
        });

        this.querySelector('.workspace-inspector-btn')?.addEventListener('click', () => {
            toggleInspector();
        }, { signal: this._ac?.signal });

        this.querySelector('.workspace-split-toggle-btn')?.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('sov:workspace-toggle-split', {
                bubbles: true,
                composed: true,
                detail: { paneId: this._paneId }
            }));
        }, { signal: this._ac?.signal });

        this.querySelector('.workspace-close-pane-btn')?.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('sov:workspace-close-pane', {
                bubbles: true,
                composed: true,
                detail: { paneId: this._paneId }
            }));
        }, { signal: this._ac?.signal });

        this._breadcrumbEl?.addEventListener('click', (e) => {
            if (!e.target.classList.contains('crumb') && !e.target.classList.contains('crumb-sep')) {
                this._showAddressBar();
            }
        }, { signal: this._ac?.signal });

        this._addressInputEl?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const path = this._addressInputEl.value.trim();
                this._hideAddressBar();
                if (path) navigateTo(path, { paneId: this._paneId });
                e.stopPropagation();
            } else if (e.key === 'Escape') {
                this._hideAddressBar();
                e.stopPropagation();
            }
        }, { signal: this._ac?.signal });

        this._addressInputEl?.addEventListener('blur', () => {
            setTimeout(() => this._hideAddressBar(), 100);
        }, { signal: this._ac?.signal });

        this._searchInputEl?.addEventListener('input', (e) => {
            clearTimeout(this._searchDebounce);
            const nextValue = e.target.value;
            this._searchDebounce = setTimeout(() => {
                patchPane(this._paneId, (pane) => ({
                    ...pane,
                    searchQuery: nextValue
                }));
            }, 120);
        }, { signal: this._ac?.signal });

        document.addEventListener('keydown', (e) => {
            if (getActivePaneId() !== this._paneId) return;

            if (e.ctrlKey && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                this._showAddressBar();
            }
        }, { signal: this._ac?.signal });
    }

    _showAddressBar() {
        if (!this._addressInputEl || !this._breadcrumbEl || this._addressBarActive) return;
        this._addressBarActive = true;
        this._addressInputEl.value = getCurrentPath(this._paneId);
        this._breadcrumbEl.style.display = 'none';
        this._addressInputEl.style.display = 'block';
        this._addressInputEl.select();
        this._addressInputEl.focus();
    }

    _hideAddressBar() {
        if (!this._addressInputEl || !this._breadcrumbEl || !this._addressBarActive) return;
        this._addressBarActive = false;
        this._addressInputEl.style.display = 'none';
        this._breadcrumbEl.style.display = '';
    }

    _syncFromPane(pane) {
        if (!pane) return;

        if (this._searchInputEl && this._searchInputEl.value !== pane.searchQuery) {
            this._searchInputEl.value = pane.searchQuery;
        }
        if (this._addressInputEl && !this._addressBarActive) {
            this._addressInputEl.value = pane.currentPath || '';
        }

        renderBreadcrumb(this._breadcrumbEl, pane.currentPath, { paneId: this._paneId });
        this._syncViewControls(pane.viewMode);
        this._renderEntries(pane);
    }

    _syncViewControls(viewMode) {
        this.querySelectorAll('[data-view]').forEach((button) => {
            button.classList.toggle('active', button.dataset.view === viewMode);
        });
    }

    _buildEntriesSignature(entries) {
        return entries.map((entry) => `${entry.path}:${entry.modified || 0}:${entry.size || 0}:${entry.is_dir ? 1 : 0}`).join('|');
    }

    _renderEntries(pane = getPane(this._paneId)) {
        if (!this._fileListEl) return;

        const renderState = {
            currentPath: pane.currentPath,
            viewMode: pane.viewMode,
            searchQuery: pane.searchQuery,
            sortCol: pane.sort?.col || 'name',
            sortDir: pane.sort?.dir || 'asc',
            entriesSignature: this._buildEntriesSignature(pane.entries || [])
        };

        if (this._lastRenderState &&
            this._lastRenderState.currentPath === renderState.currentPath &&
            this._lastRenderState.viewMode === renderState.viewMode &&
            this._lastRenderState.searchQuery === renderState.searchQuery &&
            this._lastRenderState.sortCol === renderState.sortCol &&
            this._lastRenderState.sortDir === renderState.sortDir &&
            this._lastRenderState.entriesSignature === renderState.entriesSignature) {
            return;
        }

        this._lastRenderState = renderState;

        const query = (pane.searchQuery || '').trim().toLowerCase();
        const entries = Array.isArray(pane.entries) ? pane.entries : [];
        const matches = !query
            ? entries
            : entries.filter((entry) =>
                entry.name.toLowerCase().includes(query) || entry.path.toLowerCase().includes(query)
            );

        this._fileListEl.setSearchTerm(pane.searchQuery || '');

        if (query && matches.length === 0) {
            this._fileListEl.showMessage(
                `No matches in <em>${escapeHtml(pane.currentPath || 'this folder')}</em> for <strong>${escapeHtml(pane.searchQuery)}</strong>. Semantic indexing is not wired yet.`,
                'search-empty'
            );
            return;
        }

        this._fileListEl.render(matches);
    }

    _syncActiveState() {
        this.classList.toggle('active-pane', getActivePaneId() === this._paneId);
    }

    rerender() {
        this._lastRenderState = null;
        this._syncFromPane(getPane(this._paneId));
    }

    disconnectedCallback() {
        clearTimeout(this._searchDebounce);
        if (this._ac) {
            this._ac.abort();
            this._ac = null;
        }
        if (this._unsubPane) this._unsubPane();
        if (this._unsubActivePane) this._unsubActivePane();
    }
}

customElements.define('sovereign-workspace-pane', SovereignWorkspacePane);
