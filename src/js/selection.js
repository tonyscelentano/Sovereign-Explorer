// ─── Selection Manager ────────────────────────────────────────────────────────
// Single source of truth for multi-select state. Uses appState for reactive updates.

import { eventHub } from './event-hub.js';
import { getActivePaneId, getPane, patchPane } from './panes/store.js';

let _clipboard = { entries: [], operation: null, sourcePaneId: null };

function _emitClipboard() {
    eventHub.emit('sov:clipboard-changed', _clipboard);
}

function getSelection(paneId = getActivePaneId()) {
    return getPane(paneId)?.selection || [];
}

const SelectionManager = {
    /** Replace selection with a single entry */
    set(entry, paneId = getActivePaneId()) {
        patchPane(paneId, (pane) => ({
            ...pane,
            selection: [entry]
        }));
    },

    /** Toggle one entry in/out of the selection */
    toggle(entry, paneId = getActivePaneId()) {
        const sel = getSelection(paneId);
        const exists = sel.find(e => e.path === entry.path);
        const nextSelection = exists
            ? sel.filter(e => e.path !== entry.path)
            : [...sel, entry];

        patchPane(paneId, (pane) => ({
            ...pane,
            selection: nextSelection
        }));
    },

    /** Select a contiguous range between anchorPath and targetPath */
    selectRange(sortedEntries, anchorPath, targetPath, paneId = getActivePaneId()) {
        const paths = sortedEntries.map(e => e.path);
        const a = paths.indexOf(anchorPath);
        const b = paths.indexOf(targetPath);
        if (a === -1 || b === -1) return;
        const [lo, hi] = a < b ? [a, b] : [b, a];
        
        const newSelection = [...getSelection(paneId)];
        const range = sortedEntries.slice(lo, hi + 1);
        range.forEach(e => {
            if (!newSelection.find(sel => sel.path === e.path)) {
                newSelection.push(e);
            }
        });

        patchPane(paneId, (pane) => ({
            ...pane,
            selection: newSelection
        }));
    },

    selectAll(entries, paneId = getActivePaneId()) {
        patchPane(paneId, (pane) => ({
            ...pane,
            selection: [...entries]
        }));
    },

    clear(paneId = getActivePaneId()) {
        patchPane(paneId, (pane) => ({
            ...pane,
            selection: []
        }));
    },

    setClipboard(entries, operation, paneId = getActivePaneId()) {
        _clipboard = { entries: [...entries], operation, sourcePaneId: paneId };
        _emitClipboard();
    },

    getClipboard() {
        return _clipboard;
    },

    clearClipboard() {
        _clipboard = { entries: [], operation: null, sourcePaneId: null };
        _emitClipboard();
    },

    has(path, paneId = getActivePaneId()) { return getSelection(paneId).some(e => e.path === path); },
    getAll(paneId = getActivePaneId()) { return [...getSelection(paneId)]; },
    getPaths(paneId = getActivePaneId()) { return getSelection(paneId).map(e => e.path); },
    count(paneId = getActivePaneId()) { return getSelection(paneId).length; },
};

export default SelectionManager;
