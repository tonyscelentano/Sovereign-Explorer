// ─── Sovereign Context Menu ───────────────────────────────────────────────────
// File-level right-click menu. Singleton element positioned at cursor.
// Usage: document.getElementById('file-context-menu').show(x, y, entry)

import { deleteSelected, renameItem, openItem, showInFolder, copySelected, cutSelected, pasteToCurrent } from '../operations.js';
import SelectionManager from '../selection.js';
import SortManager from '../sort.js';
import { navigateTo, getCurrentPath, navigateToSilent } from '../fs.js';
import { invoke } from '../ipc.js';
import { getActivePaneId, getPane, patchPane, setActivePane } from '../panes/store.js';

class SovereignContextMenu extends HTMLElement {
    connectedCallback() {
        this._ac = new AbortController();
        this.className = 'context-menu file-context-menu';
        this.style.display = 'none';

        this.addEventListener('click', (e) => this._handleAction(e));

        document.addEventListener('click', (e) => {
            if (!this.contains(e.target)) this.hide();
        }, { signal: this._ac?.signal });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hide();
        }, { signal: this._ac?.signal });
        // Hide on navigation
        window.addEventListener('sov:path-changed', () => this.hide(), { signal: this._ac?.signal });
    }

    show(x, y, entry, options = {}) {
        this._entry = entry;
        this._paneId = options.paneId || getActivePaneId();
        setActivePane(this._paneId);
        const pane = getPane(this._paneId);
        const isMulti = SelectionManager.count(this._paneId) > 1;
        const clip = SelectionManager.getClipboard();
        const hasClipboard = clip.entries.length > 0;

        let html = '';

        if (entry) {
            const deleteLabel = isMulti ? `${SelectionManager.count(this._paneId)} items` : `"${entry.name}"`;
            html = `
                <div class="ctx-item" data-action="open">
                    <i data-lucide="${entry.is_dir ? 'folder-open' : 'external-link'}"></i>
                    <span>Open</span>
                </div>
                ${entry.is_dir ? `
                <div class="ctx-item" data-action="open-in-other-pane">
                    <i data-lucide="columns-2"></i>
                    <span>Open in Other Pane</span>
                </div>` : ''}
                ${!isMulti && !entry.is_dir ? `
                <div class="ctx-item has-submenu" data-action="open-with">
                    <i data-lucide="layers"></i>
                    <span>Open With...</span>
                    <i data-lucide="chevron-right" class="ctx-chevron"></i>
                    <div class="ctx-submenu" id="open-with-submenu">
                        <div class="ctx-item ctx-disabled"><span>Loading...</span></div>
                    </div>
                </div>` : ''}
                ${!isMulti ? `
                <div class="ctx-item" data-action="show-in-folder">
                    <i data-lucide="folder-search"></i>
                    <span>Show in Folder</span>
                </div>
                <div class="ctx-item" data-action="rename">
                    <i data-lucide="pencil"></i>
                    <span>Rename</span>
                </div>
                ${entry.is_dir ? `
                <div class="ctx-item" data-action="set-startup">
                    <i data-lucide="pin"></i>
                    <span>Set as Startup Path</span>
                </div>` : ''}
                ` : ''}
                <div class="ctx-sep"></div>
                <div class="ctx-item" data-action="cut">
                    <i data-lucide="scissors"></i>
                    <span>Cut</span>
                </div>
                <div class="ctx-item" data-action="copy">
                    <i data-lucide="copy"></i>
                    <span>Copy</span>
                </div>
                <div class="ctx-sep"></div>
                <div class="ctx-item" data-action="copy-path">
                    <i data-lucide="link"></i>
                    <span>Copy Path</span>
                </div>
                <div class="ctx-sep"></div>
                <div class="ctx-item ctx-danger" data-action="delete">
                    <i data-lucide="trash-2"></i>
                    <span>Delete ${deleteLabel}</span>
                </div>
            `;
        } else {
            // Background right-click
            const viewMode = pane.viewMode;
            const sortMode = pane.sort?.col || 'name';

            html = `
                <div class="ctx-item has-submenu">
                    <i data-lucide="plus-square"></i>
                    <span>New</span>
                    <i data-lucide="chevron-right" class="ctx-chevron"></i>
                    <div class="ctx-submenu">
                        <div class="ctx-item" data-action="new-folder">
                            <i data-lucide="folder-plus"></i>
                            <span>New Folder</span>
                        </div>
                        <div class="ctx-item" data-action="new-file">
                            <i data-lucide="file-plus"></i>
                            <span>New File</span>
                        </div>
                        <div class="ctx-sep"></div>
                        <div class="ctx-item" data-action="new-bulk">
                            <i data-lucide="layers"></i>
                            <span>Bulk Scaffolder...</span>
                        </div>
                    </div>
                </div>
                <div class="ctx-sep"></div>
                <div class="ctx-item ${!hasClipboard ? 'ctx-disabled' : ''}" data-action="paste">
                    <i data-lucide="clipboard-paste"></i>
                    <span>Paste</span>
                </div>
                <div class="ctx-sep"></div>
                <div class="ctx-item has-submenu">
                    <i data-lucide="monitor"></i>
                    <span>View</span>
                    <i data-lucide="chevron-right" class="ctx-chevron"></i>
                    <div class="ctx-submenu">
                        <div class="ctx-item" data-action="view-list">
                            <i data-lucide="${viewMode === 'list' ? 'check' : 'list'}"></i>
                            <span>List View</span>
                        </div>
                        <div class="ctx-item" data-action="view-grid">
                            <i data-lucide="${viewMode === 'grid' ? 'check' : 'layout-grid'}"></i>
                            <span>Grid View</span>
                        </div>
                    </div>
                </div>
                <div class="ctx-item has-submenu">
                    <i data-lucide="arrow-up-down"></i>
                    <span>Sort By</span>
                    <i data-lucide="chevron-right" class="ctx-chevron"></i>
                    <div class="ctx-submenu">
                        <div class="ctx-item" data-action="sort-name">
                            <i data-lucide="${sortMode === 'name' ? 'check' : 'type'}"></i>
                            <span>Name</span>
                        </div>
                        <div class="ctx-item" data-action="sort-modified">
                            <i data-lucide="${sortMode === 'modified' ? 'check' : 'calendar'}"></i>
                            <span>Date Modified</span>
                        </div>
                        <div class="ctx-item" data-action="sort-size">
                            <i data-lucide="${sortMode === 'size' ? 'check' : 'database'}"></i>
                            <span>Size</span>
                        </div>
                    </div>
                </div>
                <div class="ctx-sep"></div>
                <div class="ctx-item" data-action="terminal-here">
                    <i data-lucide="terminal"></i>
                    <span>Open Terminal Here</span>
                </div>
            `;
        }

        this.innerHTML = html;
        this.style.display = 'block';
        this.style.left = `${x}px`;
        this.style.top = `${y}px`;

        if (window.hydrateIcons) window.hydrateIcons();

        // ─── Dynamic Submenu Logic ──────────────────────────────────────────
        const openWithItem = this.querySelector('[data-action="open-with"]');
        if (openWithItem && entry) {
            openWithItem.addEventListener('mouseenter', () => this._handleOpenWith(entry), { once: true });
        }

        // Clamp to viewport
        requestAnimationFrame(() => {
            const r = this.getBoundingClientRect();
            if (x + r.width > window.innerWidth) this.style.left = `${window.innerWidth - r.width - 5}px`;
            if (y + r.height > window.innerHeight) this.style.top = `${window.innerHeight - r.height - 5}px`;
        });
    }

    async _handleOpenWith(entry) {
        const submenu = this.querySelector('#open-with-submenu');
        if (!submenu) return;

        try {
            const handlers = await invoke('get_open_with_handlers', { extension: entry.extension });
            
            if (handlers.length === 0) {
                submenu.innerHTML = '<div class="ctx-item ctx-disabled"><span>No suggested apps</span></div>';
            } else {
                submenu.innerHTML = handlers.map(h => `
                    <div class="ctx-item" data-action="open-with-cmd" data-cmd="${h.cmd.replace(/"/g, '&quot;')}">
                        <i data-lucide="play"></i>
                        <span>${h.name}</span>
                    </div>
                `).join('');
            }

            // Always add the "Choose another app" system bridge
            submenu.innerHTML += `
                <div class="ctx-sep"></div>
                <div class="ctx-item" data-action="open-with-system">
                    <i data-lucide="settings"></i>
                    <span>Search for apps...</span>
                </div>
            `;
            
            if (window.hydrateIcons) window.hydrateIcons();
        } catch (err) {
            submenu.innerHTML = `<div class="ctx-item ctx-disabled"><span>Error: ${err}</span></div>`;
        }
    }

    hide() {
        this.style.display = 'none';
        this._entry = null;
        this._paneId = null;
    }

    async _handleAction(e) {
        const item = e.target.closest('[data-action]');
        if (!item || item.classList.contains('ctx-disabled')) return;
        e.stopPropagation();

        const action = item.dataset.action;
        const entry = this._entry;
        const paneId = this._paneId || getActivePaneId();
        this.hide();

        switch (action) {
            case 'open':
                if (entry) {
                    if (entry.is_dir) await navigateTo(entry.path, { paneId });
                    else await openItem(entry.path);
                }
                break;
            case 'open-in-other-pane':
                if (entry?.is_dir) {
                    window.dispatchEvent(new CustomEvent('sov:workspace-open-path', {
                        detail: { path: entry.path, sourcePaneId: paneId }
                    }));
                }
                break;
            case 'show-in-folder':
                if (entry) await showInFolder(entry.path);
                break;
            case 'rename':
                if (entry) {
                    window.dispatchEvent(new CustomEvent('sov:start-rename', { detail: { entry } }));
                }
                break;
            case 'set-startup':
                if (entry && entry.is_dir) {
                    localStorage.setItem('sovereign_startup_path', entry.path);
                    window.dispatchEvent(new CustomEvent('sov:startup-path-changed'));
                }
                break;
            case 'copy':
                copySelected(paneId);
                break;
            case 'cut':
                cutSelected(paneId);
                break;
            case 'paste':
                await pasteToCurrent(paneId);
                break;
            case 'delete':
                await deleteSelected(paneId);
                break;
            case 'copy-path':
                if (entry) await navigator.clipboard.writeText(entry.path).catch(() => {});
                break;
            
            case 'open-with-cmd':
                if (entry) {
                    const cmd = item.dataset.cmd;
                    await invoke('open_path_with', { path: entry.path, cmdTemplate: cmd });
                }
                break;
            case 'open-with-system':
                // Bridge to Windows "Default Apps" or "Open With" dialog
                await invoke('open_path', { path: 'ms-settings:defaultapps' });
                break;

            // Background actions
            case 'new-folder':
                await this._createNew('folder', paneId);
                break;
            case 'new-file':
                await this._createNew('file', paneId);
                break;
            case 'new-bulk':
                document.getElementById('scaffolder')?.open();
                break;
            case 'view-list':
                patchPane(paneId, (pane) => ({
                    ...pane,
                    viewMode: 'list'
                }));
                if (paneId === 'primary') localStorage.setItem('sovereign_view', 'list');
                break;
            case 'view-grid':
                patchPane(paneId, (pane) => ({
                    ...pane,
                    viewMode: 'grid'
                }));
                if (paneId === 'primary') localStorage.setItem('sovereign_view', 'grid');
                break;
            case 'sort-name':
                this._applySort('name', paneId);
                break;
            case 'sort-modified':
                this._applySort('modified', paneId);
                break;
            case 'sort-size':
                this._applySort('size', paneId);
                break;
            case 'terminal-here':
                window.dispatchEvent(new CustomEvent('sov:terminal-cd', { detail: { path: getCurrentPath(paneId) } }));
                break;
        }
    }

    async _createNew(itemType, paneId = getActivePaneId()) {
        const currentDir = getCurrentPath(paneId);
        if (!currentDir) return;
        
        const name = prompt(`Enter ${itemType} name:`, `new_${itemType}`);
        if (!name) return;

        const sep = currentDir.includes('/') ? '/' : '\\';
        const path = currentDir.endsWith(sep) ? currentDir + name : currentDir + sep + name;
        const cmd = itemType === 'folder' ? 'create_dir' : 'create_file';

        try {
            await invoke(cmd, { name: path });
            await navigateToSilent(currentDir, { paneId });
        } catch (err) {
            alert(`Failed to create ${itemType}: ${err}`);
        }
    }

    _applySort(mode, paneId = getActivePaneId()) {
        SortManager.toggle(mode, paneId);
        // Trigger rerender via refresh
        navigateToSilent(getCurrentPath(paneId), { paneId });
    }

    disconnectedCallback() {
        if (this._ac) {
            this._ac.abort();
            this._ac = null;
        }
        if (this._unsubPath) this._unsubPath();
    }
}

customElements.define('sovereign-context-menu', SovereignContextMenu);
export default SovereignContextMenu;
