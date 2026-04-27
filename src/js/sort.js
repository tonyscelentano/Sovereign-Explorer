// ─── Sort Manager ─────────────────────────────────────────────────────────────
// Maintains per-pane sort state while preserving the legacy localStorage keys
// for the primary pane.

import { getActivePaneId, getPane, patchPane } from './panes/store.js';

const COL_KEY = 'sov_sort_col';
const DIR_KEY = 'sov_sort_dir';

function getSortState(paneId = getActivePaneId()) {
    const pane = getPane(paneId);
    return pane?.sort || {
        col: localStorage.getItem(COL_KEY) || 'name',
        dir: localStorage.getItem(DIR_KEY) || 'asc'
    };
}

function persistPrimarySort(sort, paneId) {
    if (paneId === 'primary') {
        localStorage.setItem(COL_KEY, sort.col);
        localStorage.setItem(DIR_KEY, sort.dir);
    }
}

const SortManager = {
    get(paneId = getActivePaneId()) {
        return getSortState(paneId);
    },

    /** Toggle sort: same col flips direction, new col resets to asc */
    toggle(col, paneId = getActivePaneId()) {
        const current = getSortState(paneId);
        const next = current.col === col
            ? { col, dir: current.dir === 'asc' ? 'desc' : 'asc' }
            : { col, dir: 'asc' };

        patchPane(paneId, (pane) => ({
            ...pane,
            sort: next
        }));

        persistPrimarySort(next, paneId);
    },

    /** Returns a new sorted array; directories always float to top */
    getSorted(entries, paneId = getActivePaneId()) {
        const { col, dir } = getSortState(paneId);
        const factor = dir === 'asc' ? 1 : -1;

        return [...entries].sort((a, b) => {
            if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
            let cmp = 0;
            if (col === 'name') cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            else if (col === 'modified') cmp = (a.modified || 0) - (b.modified || 0);
            else if (col === 'size') cmp = (a.size || 0) - (b.size || 0);
            return cmp * factor;
        });
    },

    /** Arrow character for column header indicators */
    indicator(col, paneId = getActivePaneId()) {
        const current = getSortState(paneId);
        if (current.col !== col) return '';
        return current.dir === 'asc' ? ' ↑' : ' ↓';
    },
};

export default SortManager;
