import { appState } from '../state.js';

export const PRIMARY_PANE_ID = 'primary';

const LEGACY_VIEW_KEY = 'sovereign_view';
const LEGACY_SORT_COL_KEY = 'sov_sort_col';
const LEGACY_SORT_DIR_KEY = 'sov_sort_dir';

function defaultViewMode() {
    return localStorage.getItem(LEGACY_VIEW_KEY) || 'list';
}

function defaultSort() {
    return {
        col: localStorage.getItem(LEGACY_SORT_COL_KEY) || 'name',
        dir: localStorage.getItem(LEGACY_SORT_DIR_KEY) || 'asc'
    };
}

export function createPaneState(id, overrides = {}) {
    return {
        id,
        currentPath: overrides.currentPath ?? '',
        entries: Array.isArray(overrides.entries) ? [...overrides.entries] : [],
        selection: Array.isArray(overrides.selection) ? [...overrides.selection] : [],
        viewMode: overrides.viewMode ?? defaultViewMode(),
        sort: overrides.sort ? { ...overrides.sort } : defaultSort(),
        searchQuery: overrides.searchQuery ?? '',
        history: Array.isArray(overrides.history) ? [...overrides.history] : [],
        historyIndex: Number.isInteger(overrides.historyIndex) ? overrides.historyIndex : -1
    };
}

function clonePane(pane) {
    return {
        ...pane,
        entries: Array.isArray(pane.entries) ? [...pane.entries] : [],
        selection: Array.isArray(pane.selection) ? [...pane.selection] : [],
        sort: pane.sort ? { ...pane.sort } : defaultSort(),
        history: Array.isArray(pane.history) ? [...pane.history] : []
    };
}

function ensurePaneArray() {
    if (!Array.isArray(appState.state.panes) || appState.state.panes.length === 0) {
        appState.state.panes = [createPaneState(PRIMARY_PANE_ID)];
    }
    if (!appState.state.activePaneId) {
        appState.state.activePaneId = PRIMARY_PANE_ID;
    }
}

export function listPanes() {
    ensurePaneArray();
    return appState.state.panes.map(clonePane);
}

export function getActivePaneId() {
    ensurePaneArray();
    return appState.state.activePaneId || PRIMARY_PANE_ID;
}

export function getPane(paneId = getActivePaneId()) {
    ensurePaneArray();
    return appState.state.panes.find((pane) => pane.id === paneId) || appState.state.panes[0];
}

export function paneExists(paneId) {
    ensurePaneArray();
    return appState.state.panes.some((pane) => pane.id === paneId);
}

export function syncLegacyActivePaneState() {
    const activePane = getPane(getActivePaneId());

    appState.state.currentPath = activePane.currentPath;
    appState.state.entries = [...activePane.entries];
    appState.state.selection = [...activePane.selection];
    appState.state.viewMode = activePane.viewMode;
    appState.state.searchQuery = activePane.searchQuery;
}

export function replacePane(paneId, nextPane) {
    ensurePaneArray();

    const normalized = createPaneState(paneId, nextPane);
    const exists = appState.state.panes.some((pane) => pane.id === paneId);
    const nextPanes = exists
        ? appState.state.panes.map((pane) => (pane.id === paneId ? normalized : pane))
        : [...appState.state.panes, normalized];

    appState.state.panes = nextPanes;
    syncLegacyActivePaneState();
    return normalized;
}

export function patchPane(paneId, patchOrFactory) {
    ensurePaneArray();

    const previous = getPane(paneId);
    const nextValue = typeof patchOrFactory === 'function'
        ? patchOrFactory(clonePane(previous))
        : { ...previous, ...patchOrFactory };

    return replacePane(paneId, nextValue);
}

export function setActivePane(paneId) {
    ensurePaneArray();
    if (!paneExists(paneId)) return false;
    if (appState.state.activePaneId === paneId) {
        syncLegacyActivePaneState();
        return true;
    }

    appState.state.activePaneId = paneId;
    syncLegacyActivePaneState();
    return true;
}

export function subscribePane(paneId, callback) {
    ensurePaneArray();

    let previous = getPane(paneId);
    callback(previous);

    return appState.subscribe('panes', () => {
        const next = getPane(paneId);
        if (next !== previous) {
            previous = next;
            callback(next);
        }
    });
}

ensurePaneArray();
syncLegacyActivePaneState();
