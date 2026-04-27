import { appState } from '../state.js';
import { navigateToSilent } from '../fs.js';
import { PRIMARY_PANE_ID, createPaneState, getActivePaneId, getPane, paneExists, patchPane, replacePane, setActivePane, subscribePane } from '../panes/store.js';
import './sovereign-workspace-pane.js';

const SECONDARY_PANE_ID = 'secondary';
const SPLIT_OPEN_KEY = 'sov_workspace_split_open';
const SECONDARY_WIDTH_KEY = 'sov_workspace_secondary_width';

function clampWidth(value) {
    return Math.max(280, Math.min(900, value));
}

function readStoredWidth() {
    const raw = Number.parseInt(localStorage.getItem(SECONDARY_WIDTH_KEY) || '420', 10);
    if (!Number.isFinite(raw)) return 420;
    return clampWidth(raw);
}

export class SovereignWorkspaceHost extends HTMLElement {
    connectedCallback() {
        this._ac = new AbortController();
        this.classList.add('workspace-host');
        this._secondaryWidth = readStoredWidth();
        this.render();
        this._bindRefs();
        this._wireEvents();
        this._restoreState();

        this._unsubSplit = appState.subscribe('workspaceSplitOpen', () => this._syncSplitState());
        this._unsubPrimaryPane = subscribePane(PRIMARY_PANE_ID, () => this._maybeSeedSecondaryFromPrimary());
        this._syncSplitState();
    }

    render() {
        this.innerHTML = `
            <div class="workspace-pane-slot workspace-pane-slot-primary">
                <sovereign-workspace-pane pane-id="${PRIMARY_PANE_ID}" pane-role="primary"></sovereign-workspace-pane>
            </div>
            <div class="workspace-pane-splitter" data-splitter="workspace" title="Resize Split Pane"></div>
            <div class="workspace-pane-slot workspace-pane-slot-secondary">
                <sovereign-workspace-pane pane-id="${SECONDARY_PANE_ID}" pane-role="secondary"></sovereign-workspace-pane>
            </div>
        `;
    }

    _bindRefs() {
        this._primarySlot = this.querySelector('.workspace-pane-slot-primary');
        this._secondarySlot = this.querySelector('.workspace-pane-slot-secondary');
        this._splitter = this.querySelector('.workspace-pane-splitter');
    }

    _wireEvents() {
        this.addEventListener('sov:workspace-toggle-split', (e) => {
            e.stopPropagation();
            this.toggleSplit(e.detail?.paneId);
        }, { signal: this._ac?.signal });

        this.addEventListener('sov:workspace-close-pane', (e) => {
            e.stopPropagation();
            this.closeSecondaryPane();
        }, { signal: this._ac?.signal });

        window.addEventListener('sov:workspace-open-path', (e) => {
            e.stopPropagation();
            this.openPathInPane(e.detail?.path, e.detail?.sourcePaneId);
        }, { signal: this._ac?.signal });

        this._splitter?.addEventListener('pointerdown', (e) => this._startResize(e), { signal: this._ac?.signal });
        document.addEventListener('pointermove', (e) => this._onResize(e), { signal: this._ac?.signal });
        document.addEventListener('pointerup', () => this._endResize(), { signal: this._ac?.signal });
        document.addEventListener('pointercancel', () => this._endResize(), { signal: this._ac?.signal });
    }

    _restoreState() {
        const shouldOpen = localStorage.getItem(SPLIT_OPEN_KEY) === 'true';
        if (shouldOpen) {
            this.openSecondaryPane(getActivePaneId(), { activate: false }).catch((err) => {
                console.error('Failed to restore split pane state:', err);
            });
        }
    }

    async toggleSplit(sourcePaneId = getActivePaneId()) {
        if (appState.state.workspaceSplitOpen) {
            this.closeSecondaryPane();
        } else {
            await this.openSecondaryPane(sourcePaneId);
        }
    }

    async openSecondaryPane(sourcePaneId = getActivePaneId(), options = {}) {
        const sourcePane = getPane(sourcePaneId);
        const hasSecondaryPane = paneExists(SECONDARY_PANE_ID);
        const secondaryPane = hasSecondaryPane ? getPane(SECONDARY_PANE_ID) : null;
        const targetPath = secondaryPane?.currentPath || sourcePane.currentPath;

        if (!hasSecondaryPane) {
            replacePane(SECONDARY_PANE_ID, createPaneState(SECONDARY_PANE_ID, {
                currentPath: targetPath,
                viewMode: sourcePane.viewMode,
                sort: sourcePane.sort
            }));
        } else if (!secondaryPane.currentPath && targetPath) {
            patchPane(SECONDARY_PANE_ID, (pane) => ({
                ...pane,
                currentPath: targetPath,
                viewMode: sourcePane.viewMode,
                sort: { ...sourcePane.sort }
            }));
        }

        if (targetPath) {
            await navigateToSilent(targetPath, { paneId: SECONDARY_PANE_ID });
        }

        appState.state.workspaceSplitOpen = true;
        localStorage.setItem(SPLIT_OPEN_KEY, 'true');
        if (options.activate !== false) {
            setActivePane(SECONDARY_PANE_ID);
        }
    }

    async openPathInPane(path, sourcePaneId = getActivePaneId()) {
        if (!path) return;

        const targetPaneId = sourcePaneId === SECONDARY_PANE_ID ? PRIMARY_PANE_ID : SECONDARY_PANE_ID;
        if (targetPaneId === SECONDARY_PANE_ID && !appState.state.workspaceSplitOpen) {
            await this.openSecondaryPane(sourcePaneId, { activate: false });
        }

        await navigateToSilent(path, { paneId: targetPaneId });
        setActivePane(targetPaneId);
    }

    closeSecondaryPane() {
        appState.state.workspaceSplitOpen = false;
        localStorage.setItem(SPLIT_OPEN_KEY, 'false');
        if (getActivePaneId() === SECONDARY_PANE_ID) {
            setActivePane(PRIMARY_PANE_ID);
        }
        this._endResize();
    }

    _syncSplitState() {
        const isOpen = appState.state.workspaceSplitOpen;
        this.classList.toggle('split-open', isOpen);
        if (this._secondarySlot) {
            this._secondarySlot.style.width = isOpen ? `${this._secondaryWidth}px` : '0px';
        }
        this._maybeSeedSecondaryFromPrimary();
    }

    _maybeSeedSecondaryFromPrimary() {
        if (!appState.state.workspaceSplitOpen || !paneExists(SECONDARY_PANE_ID)) return;

        const primaryPane = getPane(PRIMARY_PANE_ID);
        const secondaryPane = getPane(SECONDARY_PANE_ID);
        if (!primaryPane.currentPath || secondaryPane.currentPath) return;

        patchPane(SECONDARY_PANE_ID, (pane) => ({
            ...pane,
            currentPath: primaryPane.currentPath,
            viewMode: primaryPane.viewMode,
            sort: { ...primaryPane.sort }
        }));

        navigateToSilent(primaryPane.currentPath, { paneId: SECONDARY_PANE_ID }).catch((err) => {
            console.error('Failed to seed secondary pane from primary:', err);
        });
    }

    _startResize(e) {
        if (!appState.state.workspaceSplitOpen) return;
        e.preventDefault();
        this._resizing = true;
        this._splitter?.setPointerCapture?.(e.pointerId);
        document.body.classList.add('is-resizing', 'resize-col');
    }

    _onResize(e) {
        if (!this._resizing || !this._secondarySlot) return;
        const rect = this.getBoundingClientRect();
        const nextWidth = clampWidth(rect.right - e.clientX);
        this._secondaryWidth = nextWidth;
        this._secondarySlot.style.width = `${nextWidth}px`;
    }

    _endResize() {
        if (!this._resizing) return;
        this._resizing = false;
        document.body.classList.remove('is-resizing', 'resize-col');
        localStorage.setItem(SECONDARY_WIDTH_KEY, `${this._secondaryWidth}`);
    }

    disconnectedCallback() {
        if (this._ac) {
            this._ac.abort();
            this._ac = null;
        }
        if (this._unsubSplit) this._unsubSplit();
        if (this._unsubPrimaryPane) this._unsubPrimaryPane();
    }
}

customElements.define('sovereign-workspace-host', SovereignWorkspaceHost);
