// ═══════════════════════════════════════════════════════════════════════════════
// Sovereign Explorer — File System Bridge
// Pane-aware navigation, breadcrumb rendering, sidebar tree, and history.
// ═══════════════════════════════════════════════════════════════════════════════

import { eventHub } from './event-hub.js';
import { hasInvoke, invoke } from './ipc.js';
import { appState } from './state.js';
import { formatBytes } from './utils.js';
import { getActivePaneId, getPane, patchPane } from './panes/store.js';

let fileTree = null;

function resolvePaneOptions(optionsOrPaneId) {
    if (typeof optionsOrPaneId === 'string') {
        return { paneId: optionsOrPaneId };
    }
    return optionsOrPaneId || {};
}

function getPaneId(optionsOrPaneId) {
    return resolvePaneOptions(optionsOrPaneId).paneId || getActivePaneId();
}

function ensureSidebarBindings() {
    if (!fileTree) {
        fileTree = document.getElementById('file-tree');
        if (fileTree && typeof fileTree.setNavigator === 'function') {
            fileTree.setNavigator((path) => navigateTo(path, { paneId: getActivePaneId() }));
        }
    }
}

function emitPathChanged(path, source, paneId) {
    eventHub.emit('sov:path-changed', { path, source, paneId });
}

function nextHistoryState(pane, path, pushHistory, forcedIndex = null) {
    if (forcedIndex !== null) {
        return {
            history: [...pane.history],
            historyIndex: forcedIndex
        };
    }

    if (!pushHistory) {
        return {
            history: [...pane.history],
            historyIndex: pane.historyIndex
        };
    }

    let history = pane.historyIndex < pane.history.length - 1
        ? pane.history.slice(0, pane.historyIndex + 1)
        : [...pane.history];

    if (history[history.length - 1] !== path) {
        history.push(path);
    }

    return {
        history,
        historyIndex: history.length - 1
    };
}

async function loadPaneDirectory(path, options = {}) {
    if (!hasInvoke()) return false;

    ensureSidebarBindings();

    const paneId = options.paneId || getActivePaneId();
    const source = options.source || 'navigate';
    const pushHistory = options.pushHistory !== false;
    const forcedHistoryIndex = options.forcedHistoryIndex ?? null;

    try {
        const entries = await invoke('list_directory', {
            path,
            showHidden: appState.state.showHidden
        });

        const pane = getPane(paneId);
        const { history, historyIndex } = nextHistoryState(pane, path, pushHistory, forcedHistoryIndex);
        const shouldClearSelection = pane.currentPath !== path;
        const nextSelection = shouldClearSelection
            ? []
            : pane.selection.filter((selected) => entries.some((entry) => entry.path === selected.path));

        patchPane(paneId, {
            currentPath: path,
            entries,
            selection: nextSelection,
            history,
            historyIndex
        });

        localStorage.setItem('sovereign_last_path', path);
        emitPathChanged(path, source, paneId);
        return true;
    } catch (err) {
        console.error('navigateTo failed:', err);
        if (path !== 'this-pc') {
            return loadPaneDirectory('this-pc', {
                ...options,
                paneId,
                source: options.source || 'navigate-fallback'
            });
        }
        return false;
    }
}

export function syncSidecarWatchPaths(paths) {
    if (!paths || !Array.isArray(paths)) return;

    let args;
    let shell = 'cmd';
    if (paths.length === 0) {
        args = `type nul > "%APPDATA%\\sovereign-explorer\\watch_path.txt"`;
    } else {
        const content = paths.map((p) => `"${p}"`).join(',');
        args = `Set-Content -Path "$env:APPDATA\\sovereign-explorer\\watch_path.txt" -Value ${content}`;
        shell = 'pwsh';
    }

    invoke('spawn_command', {
        taskId: `watch-sync-${Date.now()}`,
        shell,
        args,
        cwd: 'C:\\'
    }).catch((e) => console.error('Failed to sync watch paths:', e));
}

export function getCurrentPath(optionsOrPaneId) {
    return getPane(getPaneId(optionsOrPaneId)).currentPath;
}

export async function navigateTo(path, optionsOrPaneId = {}) {
    const options = resolvePaneOptions(optionsOrPaneId);
    return loadPaneDirectory(path, {
        ...options,
        source: options.source || 'navigate',
        pushHistory: options.pushHistory !== false
    });
}

export async function navigateToSilent(path, optionsOrPaneId = {}) {
    const options = resolvePaneOptions(optionsOrPaneId);
    return loadPaneDirectory(path, {
        ...options,
        source: options.source || 'navigate-silent',
        pushHistory: false
    });
}

export function goBack(optionsOrPaneId = {}) {
    const paneId = getPaneId(optionsOrPaneId);
    const pane = getPane(paneId);

    if (pane.historyIndex > 0) {
        const targetIndex = pane.historyIndex - 1;
        loadPaneDirectory(pane.history[targetIndex], {
            paneId,
            source: 'history-back',
            pushHistory: false,
            forcedHistoryIndex: targetIndex
        });
    }
}

export function goUp(optionsOrPaneId = {}) {
    const paneId = getPaneId(optionsOrPaneId);
    const currentPath = getCurrentPath(paneId);
    if (!currentPath || currentPath === 'this-pc') return;

    const normalized = currentPath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);

    if (parts.length > 1) {
        parts.pop();
        const parent = parts.join('/');
        navigateTo(parent.length === 2 && parent[1] === ':' ? `${parent}/` : parent, { paneId });
    } else {
        navigateTo('this-pc', { paneId });
    }
}

export function renderBreadcrumb(container, path, optionsOrPaneId = {}) {
    if (!container) return;

    const paneId = getPaneId(optionsOrPaneId);
    container.innerHTML = '';

    const rootCrumb = document.createElement('span');
    rootCrumb.className = (path === '' || path === 'this-pc') ? 'crumb active' : 'crumb';
    rootCrumb.textContent = 'This PC';
    rootCrumb.addEventListener('click', () => navigateTo('this-pc', { paneId }));
    container.appendChild(rootCrumb);

    if (path === '' || path === 'this-pc') return;

    const rootSep = document.createElement('span');
    rootSep.className = 'crumb-sep';
    rootSep.textContent = ' › ';
    container.appendChild(rootSep);

    const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
    let accumulated = '';

    parts.forEach((part, index) => {
        if (index > 0) {
            const sep = document.createElement('span');
            sep.className = 'crumb-sep';
            sep.textContent = ' › ';
            container.appendChild(sep);
        }

        accumulated += `${index === 0 ? '' : '/'}${part}`;
        const crumbPath = accumulated.length === 2 && accumulated[1] === ':' ? `${accumulated}/` : accumulated;

        const crumb = document.createElement('span');
        crumb.className = index === parts.length - 1 ? 'crumb active' : 'crumb';
        crumb.textContent = part;
        crumb.addEventListener('click', () => navigateTo(crumbPath, { paneId }));
        container.appendChild(crumb);
    });
}

export async function initDrives() {
    if (!hasInvoke()) return;

    const driveList = document.getElementById('drive-list');
    if (!driveList) return;

    try {
        const drives = await invoke('list_drives');
        driveList.innerHTML = '';

        drives.forEach((drive) => {
            const item = document.createElement('div');
            item.className = 'tree-item';
            item.dataset.path = drive.path;

            const free = formatBytes(drive.free_space, 1);
            const total = formatBytes(drive.total_size, 1);
            const usedPercent = drive.total_size > 0
                ? Math.round(((drive.total_size - drive.free_space) / drive.total_size) * 100)
                : 0;

            item.title = `${drive.name}\nFree: ${free} / ${total} (${usedPercent}% used)`;
            item.innerHTML = `
                <i data-lucide="hard-drive" class="icon"></i>
                <div style="display: flex; flex-direction: column; overflow: hidden; flex: 1;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>${drive.name || drive.path}</span>
                        <span style="font-size: 9px; opacity: 0.5; font-family: var(--f-terminal);">${free}</span>
                    </div>
                    <div class="drive-bar-bg" style="height: 3px; background: var(--bg-1); border-radius: 2px; margin-top: 2px; overflow: hidden;">
                        <div class="drive-bar-fill" style="height: 100%; width: ${usedPercent}%; background: ${usedPercent > 90 ? 'var(--red)' : 'var(--accent)'};"></div>
                    </div>
                </div>
            `;

            item.addEventListener('click', () => navigateTo(drive.path));
            driveList.appendChild(item);
        });

        if (window.lucide?.createIcons) {
            window.lucide.createIcons();
        }
    } catch (err) {
        console.error('Failed to list drives:', err);
    }
}
