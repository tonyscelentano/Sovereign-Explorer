// ─── File Operations ──────────────────────────────────────────────────────────
// Coordinates IPC calls for delete, rename, and open. All mutations refresh
// the current directory view via navigateToSilent after completion.

import { invoke } from './ipc.js';
import SelectionManager from './selection.js';
import { getCurrentPath, navigateToSilent } from './fs.js';
import { showToast } from './utils.js';
import { getActivePaneId } from './panes/store.js';

export async function deleteSelected(paneId = getActivePaneId()) {
    const paths = SelectionManager.getPaths(paneId);
    if (!paths || paths.length === 0) return;

    const confirmEl = document.getElementById('opt-confirm-delete');
    const needsConfirm = confirmEl ? confirmEl.checked : true;

    if (needsConfirm) {
        const names = SelectionManager.getAll(paneId).map(e => e.name);
        const label = paths.length === 1
            ? `"${names[0]}"`
            : `${paths.length} items`;
        if (!confirm(`Send ${label} to the Recycle Bin?`)) return;
    }

    try {
        await invoke('delete_items', { paths });
        SelectionManager.clear(paneId);
        await navigateToSilent(getCurrentPath(paneId), { paneId });
    } catch (err) {
        console.error('[operations] delete_items failed:', err);
        showToast(`Delete failed: ${err.message || err}`, 'error');
    }
}

export async function renameItem(oldPath, newName, paneId = getActivePaneId()) {
    if (!oldPath) {
        showToast("Rename failed: No file selected.", 'error');
        return false;
    }
    const trimmed = (newName || '').trim();
    if (!trimmed) {
        showToast("Rename failed: New name cannot be empty.", 'error');
        return false;
    }
    try {
        await invoke('rename_item', { oldPath: oldPath, newName: trimmed });
        await navigateToSilent(getCurrentPath(paneId), { paneId });
        return true;
    } catch (err) {
        console.error('[operations] rename_item failed:', err);
        showToast(`Rename failed: ${err.message || err}`, 'error');
        return false;
    }
}

export async function openItem(path) {
    if (!path) return;
    try {
        await invoke('open_path', { path });
    } catch (err) {
        console.error('[operations] open_path failed:', err);
        showToast(`Failed to open: ${err.message || err}`, 'error');
    }
}

export async function showInFolder(path) {
    if (!path) return;
    try {
        await invoke('show_in_folder', { path });
    } catch (err) {
        console.error('[operations] show_in_folder failed:', err);
        showToast(`Failed to show in folder: ${err.message || err}`, 'error');
    }
}

export function copySelected(paneId = getActivePaneId()) {
    const entries = SelectionManager.getAll(paneId);
    if (entries && entries.length > 0) {
        SelectionManager.setClipboard(entries, 'copy', paneId);
    }
}

export function cutSelected(paneId = getActivePaneId()) {
    const entries = SelectionManager.getAll(paneId);
    if (entries && entries.length > 0) {
        SelectionManager.setClipboard(entries, 'move', paneId);
    }
}

export async function pasteToCurrent(paneId = getActivePaneId()) {
    const clipboard = SelectionManager.getClipboard();
    if (!clipboard) return;
    
    const { entries, operation } = clipboard;
    if (!entries || entries.length === 0 || !operation) return;

    const sources = entries.map(e => e?.path).filter(Boolean);
    if (sources.length === 0) return;

    const destFolder = getCurrentPath(paneId);
    if (!destFolder) {
        showToast("Paste failed: Invalid destination folder.", 'error');
        return;
    }

    try {
        if (operation === 'copy') {
            await invoke('copy_files', { sources, destFolder });
        } else {
            await invoke('move_files', { sources, destFolder });
        }
        SelectionManager.clearClipboard();
        await navigateToSilent(destFolder, { paneId });
    } catch (err) {
        console.error(`[operations] ${operation} failed:`, err);
        showToast(`Paste failed: ${err.message || err}`, 'error');
    }
}
