import { generateIconHTML } from '../theme.js';
import { inspect } from '../inspector.js';
import { formatBytes, formatDate, formatTime } from '../utils.js';
import SelectionManager from '../selection.js';
import SortManager from '../sort.js';
import { deleteSelected, renameItem, openItem } from '../operations.js';
import { convertFileSrc, invoke } from '../ipc.js';
import { getPane, setActivePane } from '../panes/store.js';
import { navigateTo, navigateToSilent, getCurrentPath } from '../fs.js';

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico'];

export class SovereignFileList extends HTMLElement {
    constructor() {
        super();
        this.navigateCallback = null;
        this._anchorPath = null;
        this._entries = [];
        this._searchTerm = '';
        this._pointerDrag = null;
        this._dragBadge = null;
        this._activeDropTarget = null;
        this._suppressClickUntil = 0;
    }

    connectedCallback() {
        this._ac = new AbortController();
        this.classList.add('file-list-host');
        this.classList.toggle('view-grid', this._getPaneState().viewMode === 'grid');
        this.classList.toggle('view-list', this._getPaneState().viewMode !== 'grid');
        this.setAttribute('tabindex', '0');
        this._initHeaderContextMenu();
        this._initKeyboard();
        this.addEventListener('pointerdown', () => setActivePane(this._getPaneId()), { signal: this._ac?.signal });

        this.addEventListener('contextmenu', (e) => {
            if (e.target === this || e.target.classList.contains('file-placeholder')) {
                e.preventDefault();
                const ctx = document.getElementById('file-context-menu');
                if (ctx) ctx.show(e.pageX, e.pageY, null, { paneId: this._getPaneId() });
            }
        });

        // Disable native HTML5 drag in this surface entirely.
        this.addEventListener('dragstart', (e) => {
            e.preventDefault();
        });

        window.addEventListener('sov:clipboard-changed', () => this._syncSelectionVisuals(), { signal: this._ac?.signal });
        window.addEventListener('sov:start-rename', (e) => {
            const { entry } = e.detail;
            if (entry) {
                const el = this._elForPath(entry.path);
                if (el) this.startInlineRename(entry, el);
            }
        }, { signal: this._ac?.signal });

        document.addEventListener('pointermove', (e) => this._handlePointerMove(e), { signal: this._ac?.signal });
        document.addEventListener('pointerup', (e) => this._handlePointerUp(e), { signal: this._ac?.signal });
        document.addEventListener('pointercancel', (e) => this._handlePointerUp(e), { signal: this._ac?.signal });

        this.render(this._entries);
    }

    setNavigator(fn) {
        this.navigateCallback = fn;
    }

    setPaneId(paneId) {
        this.setAttribute('pane-id', paneId);
        this.setView(this._getPaneState().viewMode);
        if (this.isConnected) {
            this._syncSelectionVisuals();
        }
    }

    setSearchTerm(term) {
        this._searchTerm = term || '';
    }

    _getPaneId() {
        return this.getAttribute('pane-id') || 'primary';
    }

    _getPaneState() {
        return getPane(this._getPaneId());
    }

    _navigateTo(path) {
        const paneId = this._getPaneId();
        setActivePane(paneId);
        if (this.navigateCallback) {
            return this.navigateCallback(path, { paneId });
        }
        return navigateTo(path, { paneId });
    }

    setView(view) {
        this.classList.toggle('view-grid', view === 'grid');
        this.classList.toggle('view-list', view !== 'grid');
    }

    render(entries) {
        const entriesArray = Array.isArray(entries) ? entries : [];
        this._entries = entriesArray;
        this.innerHTML = '';

        if (entriesArray.length === 0) {
            this.showMessage('This folder is empty.');
            return;
        }

        const paneId = this._getPaneId();
        const sorted = SortManager.getSorted(entriesArray, paneId);
        this.setView(this._getPaneState().viewMode);

        if (this._getPaneState().viewMode === 'grid') {
            this._renderGrid(sorted);
        } else {
            this._renderList(sorted);
        }

        this._syncSelectionVisuals();
        if (window.hydrateIcons) window.hydrateIcons();
    }

    _getSearchTerm() {
        return this._searchTerm.trim();
    }

    _highlight(text) {
        const term = this._getSearchTerm();
        if (!term || term.length < 1) return text;
        
        try {
            const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            return text.replace(regex, '<mark>$1</mark>');
        } catch (e) {
            return text;
        }
    }

    showMessage(message, tone = '') {
        this.innerHTML = `<div class="file-placeholder${tone ? ' ' + tone : ''}">${message}</div>`;
    }

    // ── List view ────────────────────────────────────────────────────────────

    _renderList(entries) {
        const header = document.createElement('div');
        header.className = 'file-row file-header';
        const paneId = this._getPaneId();
        header.innerHTML = `
            <span class="col-icon"></span>
            <span class="col-name sortable" data-sort="name">Name${SortManager.indicator('name', paneId)}</span>
            <span class="col-modified sortable" data-sort="modified">Modified${SortManager.indicator('modified', paneId)}</span>
            <span class="col-size sortable" data-sort="size">Size${SortManager.indicator('size', paneId)}</span>
            <span class="col-diff">Diff</span>
        `;
        header.querySelectorAll('[data-sort]').forEach(col => {
            col.addEventListener('click', (e) => {
                e.stopPropagation();
                SortManager.toggle(col.dataset.sort, paneId);
                this.render(this._entries);
            });
        });
        this.appendChild(header);

        entries.forEach(entry => {
            const row = document.createElement('div');
            row.className = 'file-row' + (entry.is_dir ? ' is-dir' : '');
            row.dataset.path = entry.path;
            const highlightedName = this._highlight(entry.name);
            row.innerHTML = `
                <span class="col-icon">${generateIconHTML(entry, 'sm')}</span>
                <span class="col-name" title="${entry.path}">${highlightedName}</span>
                <span class="col-modified">${formatDate(entry.modified)}<span class="time-dim"> ${formatTime(entry.modified)}</span></span>
                <span class="col-size">${entry.is_dir ? '—' : formatBytes(entry.size)}</span>
                <span class="col-diff" data-file-diff="${entry.path}"></span>
            `;
            this._wireEntryEvents(row, entry);
            this.appendChild(row);
        });

        this._applyStoredColumnVisibility();
    }

    // ── Grid view ────────────────────────────────────────────────────────────

    _renderGrid(entries) {
        entries.forEach(entry => {
            const cell = document.createElement('div');
            cell.className = 'grid-cell' + (entry.is_dir ? ' is-dir' : '');
            cell.dataset.path = entry.path;
            const highlightedName = this._highlight(entry.name);
            
            // Check for thumbnail
            const isImage = IMAGE_EXTS.includes((entry.extension || '').toLowerCase());
            const iconHTML = isImage 
                ? `<img src="${convertFileSrc(entry.path)}" draggable="false" style="width: 100%; height: 100%; object-fit: cover; border-radius: 2px;">`
                : generateIconHTML(entry, 'lg');

            cell.innerHTML = `
                <div class="grid-icon">${iconHTML}</div>
                <div class="grid-name" title="${entry.path}">${highlightedName}</div>
            `;
            this._wireEntryEvents(cell, entry);
            this.appendChild(cell);
        });
    }

    // ── Event wiring ─────────────────────────────────────────────────────────

    _wireEntryEvents(el, entry) {
        el.addEventListener('click',       (e) => this._handleClick(e, entry));
        el.addEventListener('dblclick',    (e) => this._handleDblClick(e, entry));
        el.addEventListener('pointerdown', (e) => this._handlePointerDown(e, entry));
        el.addEventListener('contextmenu', (e) => this._handleContextMenu(e, entry));

        // Child media can become the actual drag source in Chromium.
        el.querySelectorAll('img').forEach((img) => {
            img.setAttribute('draggable', 'false');
        });

        // Hover Peek
        el.addEventListener('mouseenter',  () => {
            if (!entry.is_dir) inspect(entry, { peek: true });
        });
    }

    _handlePointerDown(e, entry) {
        if (e.button !== 0) return;
        if (e.target.closest('input, button, select, textarea, a')) return;
        setActivePane(this._getPaneId());

        const paneId = this._getPaneId();
        const selection = SelectionManager.getAll(paneId);
        const paths = selection.length > 0 && SelectionManager.has(entry.path, paneId)
            ? selection.map((item) => item.path)
            : [entry.path];

        this._pointerDrag = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            entry,
            paths,
            active: false
        };
    }

    _handlePointerMove(e) {
        const drag = this._pointerDrag;
        if (!drag || drag.pointerId !== e.pointerId) return;

        const deltaX = e.clientX - drag.startX;
        const deltaY = e.clientY - drag.startY;
        const distance = Math.hypot(deltaX, deltaY);

        if (!drag.active) {
            if (distance < 6) return;
            drag.active = true;
            this._renderDragBadge(drag.paths, drag.entry.name, e.clientX, e.clientY);
            document.body.classList.add('file-list-pointer-dragging');
        }

        e.preventDefault();
        this._moveDragBadge(e.clientX, e.clientY);
        this._updateDropTargetFromPoint(e.clientX, e.clientY, drag.paths);
    }

    async _handlePointerUp(e) {
        const drag = this._pointerDrag;
        if (!drag || drag.pointerId !== e.pointerId) return;

        const wasActive = drag.active;
        const dropTarget = this._activeDropTarget;
        this._pointerDrag = null;

        this._clearDropTargetVisual();
        this._destroyDragBadge();
        document.body.classList.remove('file-list-pointer-dragging');

        if (!wasActive) return;

        this._suppressClickUntil = Date.now() + 250;

        if (!dropTarget?.destFolder || !dropTarget?.paneId) return;

        const sourcePaneId = this._getPaneId();
        const validSources = this._filterValidMoveSources(drag.paths, dropTarget.destFolder);
        if (validSources.length === 0) return;

        try {
            await invoke('move_files', { sources: validSources, destFolder: dropTarget.destFolder });

            const refreshes = [
                navigateToSilent(getCurrentPath(sourcePaneId), { paneId: sourcePaneId })
            ];

            if (dropTarget.paneId !== sourcePaneId) {
                refreshes.push(navigateToSilent(getCurrentPath(dropTarget.paneId), { paneId: dropTarget.paneId }));
            }

            await Promise.all(refreshes);
            setActivePane(dropTarget.paneId);
        } catch (err) {
            console.error('Internal pointer-drop failed:', err);
        }
    }

    _renderDragBadge(paths, entryName, clientX, clientY) {
        this._destroyDragBadge();

        const badge = document.createElement('div');
        badge.className = 'pointer-drag-badge';
        badge.textContent = paths.length > 1 ? `Move ${paths.length} items` : `Move ${entryName}`;

        Object.assign(badge.style, {
            position: 'fixed',
            left: `${clientX + 14}px`,
            top: `${clientY + 14}px`,
            zIndex: '9999',
            padding: '6px 10px',
            borderRadius: 'var(--radius)',
            background: 'var(--accent)',
            color: 'var(--bg-0)',
            border: '1px solid var(--accent)',
            fontFamily: 'var(--f-ui)',
            fontSize: '12px',
            pointerEvents: 'none',
            boxShadow: 'var(--shadow-heavy)'
        });

        document.body.appendChild(badge);
        this._dragBadge = badge;
    }

    _moveDragBadge(clientX, clientY) {
        if (!this._dragBadge) return;
        this._dragBadge.style.left = `${clientX + 14}px`;
        this._dragBadge.style.top = `${clientY + 14}px`;
    }

    _destroyDragBadge() {
        if (this._dragBadge?.parentNode) {
            this._dragBadge.remove();
        }
        this._dragBadge = null;
    }

    _updateDropTargetFromPoint(clientX, clientY, sourcePaths) {
        const hovered = document.elementFromPoint(clientX, clientY);
        const target = this._resolveDropTarget(hovered, sourcePaths);

        if (!target) {
            this._clearDropTargetVisual();
            return;
        }

        if (this._isSameDropTarget(target)) return;

        this._clearDropTargetVisual();
        target.element?.classList.add(target.visualClass);
        this._activeDropTarget = target;
    }

    _clearDropTargetVisual() {
        this._activeDropTarget?.element?.classList.remove(this._activeDropTarget.visualClass);
        this._activeDropTarget = null;
    }

    _resolveDropTarget(hovered, sourcePaths) {
        const hoveredList = hovered?.closest?.('sovereign-file-list');
        if (!hoveredList) return null;

        const paneId = hoveredList.getAttribute('pane-id') || 'primary';
        const pane = getPane(paneId);
        if (!pane?.currentPath) return null;

        const dropEl = hovered?.closest?.('[data-path]');
        const dropPath = dropEl?.dataset?.path || '';
        const entry = dropPath ? pane.entries.find((item) => item.path === dropPath) : null;
        const destFolder = entry?.is_dir ? entry.path : pane.currentPath;

        if (!destFolder || !this._filterValidMoveSources(sourcePaths, destFolder).length) {
            return null;
        }

        return {
            paneId,
            destFolder,
            element: entry?.is_dir ? dropEl : hoveredList,
            visualClass: entry?.is_dir ? 'drag-over' : 'drag-over-pane'
        };
    }

    _isSameDropTarget(target) {
        return !!this._activeDropTarget &&
            this._activeDropTarget.paneId === target.paneId &&
            this._activeDropTarget.destFolder === target.destFolder &&
            this._activeDropTarget.visualClass === target.visualClass;
    }

    _filterValidMoveSources(sources, dest) {
        return sources.filter((src) => {
            const srcNormalized = src.replace(/\\/g, '/');
            const destNormalized = dest.replace(/\\/g, '/');

            if (srcNormalized === destNormalized) return false;

            const lastSlash = srcNormalized.lastIndexOf('/');
            const parent = srcNormalized.substring(0, lastSlash);
            if (parent === destNormalized || (parent + '/' === destNormalized)) return false;

            return true;
        });
    }

    _handleClick(e, entry) {
        if (Date.now() < this._suppressClickUntil) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        const paneId = this._getPaneId();
        setActivePane(paneId);
        const sorted = SortManager.getSorted(this._getPaneState().entries, paneId);

        if (e.shiftKey && this._anchorPath) {
            SelectionManager.selectRange(sorted, this._anchorPath, entry.path, paneId);
        } else if (e.ctrlKey || e.metaKey) {
            SelectionManager.toggle(entry, paneId);
            this._anchorPath = entry.path;
        } else {
            SelectionManager.set(entry, paneId);
            this._anchorPath = entry.path;
            if (!entry.is_dir) inspect(entry);
        }
        this._syncSelectionVisuals();
    }

    _handleDblClick(e, entry) {
        e.preventDefault();
        if (entry.is_dir) {
            SelectionManager.clear(this._getPaneId());
            this._navigateTo(entry.path);
        } else {
            openItem(entry.path);
        }
    }

    _handleContextMenu(e, entry) {
        e.preventDefault();
        e.stopPropagation();
        const paneId = this._getPaneId();
        setActivePane(paneId);
        // Ensure right-clicked item is included in selection
        if (!SelectionManager.has(entry.path, paneId)) {
            SelectionManager.set(entry, paneId);
            this._anchorPath = entry.path;
            this._syncSelectionVisuals();
        }
        const ctx = document.getElementById('file-context-menu');
        if (ctx) ctx.show(e.pageX, e.pageY, entry, { paneId });
    }

    // ── Keyboard ─────────────────────────────────────────────────────────────

    _initKeyboard() {
        this.addEventListener('keydown', async (e) => {
            const rows = [...this.querySelectorAll('[data-path]')];
            if (rows.length === 0) return;
            const paneId = this._getPaneId();

            const activeEl  = this.querySelector('[data-path].selected');
            const activeIdx = activeEl ? rows.indexOf(activeEl) : -1;

            switch (e.key) {
                case 'ArrowDown': {
                    e.preventDefault();
                    const next = rows[Math.min(activeIdx + 1, rows.length - 1)];
                    if (next) this._activateRow(next, e.shiftKey);
                    break;
                }
                case 'ArrowUp': {
                    e.preventDefault();
                    const prev = rows[Math.max(activeIdx - 1, 0)];
                    if (prev) this._activateRow(prev, e.shiftKey);
                    break;
                }
                case 'Enter': {
                    if (!activeEl) break;
                    const entry = this._entryForEl(activeEl);
                    if (!entry) break;
                    if (entry.is_dir) {
                        SelectionManager.clear(paneId);
                        this._navigateTo(entry.path);
                    } else {
                        openItem(entry.path);
                    }
                    break;
                }
                case 'Delete': {
                    e.preventDefault();
                    await deleteSelected(paneId);
                    break;
                }
                case 'F2': {
                    e.preventDefault();
                    if (!activeEl) break;
                    const entry = this._entryForEl(activeEl);
                    if (entry) {
                        this.startInlineRename(entry, activeEl);
                    }
                    break;
                }
                case 'a': {
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        SelectionManager.selectAll(this._getPaneState().entries, paneId);
                        this._syncSelectionVisuals();
                    }
                    break;
                }
            }
        });
    }

    _activateRow(el, shift) {
        const paneId = this._getPaneId();
        const path  = el.dataset.path;
        const entry = this._entryForEl(el);
        if (!entry) return;

        if (shift && this._anchorPath) {
            const sorted = SortManager.getSorted(this._getPaneState().entries, paneId);
            SelectionManager.selectRange(sorted, this._anchorPath, path, paneId);
        } else {
            SelectionManager.set(entry, paneId);
            this._anchorPath = path;
        }
        this._syncSelectionVisuals();
        el.scrollIntoView({ block: 'nearest' });
    }

    _entryForEl(el) {
        const path = el?.dataset?.path;
        return path ? this._getPaneState().entries.find(e => e.path === path) : null;
    }

    _elForPath(path) {
        return this.querySelector(`[data-path="${CSS.escape(path)}"]`);
    }

    async startInlineRename(entry, element) {
        if (!entry || !element) return;

        const nameEl = element.querySelector('.col-name') || element.querySelector('.grid-name');
        if (!nameEl) return;

        const oldName = entry.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-rename-input';
        input.value = oldName;

        // Industrial aesthetic inline styles
        Object.assign(input.style, {
            width: '100%',
            background: 'var(--bg-0)',
            color: 'var(--text-primary)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius)',
            padding: '2px 4px',
            fontSize: 'inherit',
            fontFamily: 'inherit',
            outline: 'none',
            zIndex: '10'
        });

        const originalHTML = nameEl.innerHTML;
        nameEl.innerHTML = '';
        nameEl.appendChild(input);

        input.focus();

        const firstDotIndex = oldName.indexOf('.');
        if (firstDotIndex > 0 && !entry.is_dir) {
            input.setSelectionRange(0, firstDotIndex);
        } else {
            input.select();
        }

        let finished = false;

        const commit = async () => {
            if (finished) return;
            finished = true;
            const newName = input.value.trim();
            
            // Windows invalid characters check
            const invalidChars = /[\\/:*?"<>|]/;
            if (invalidChars.test(newName)) {
                alert("A file name can't contain any of the following characters: \\ / : * ? \" < > |");
                nameEl.innerHTML = originalHTML;
                return;
            }

            if (newName && newName !== oldName) {
                const success = await renameItem(entry.path, newName, this._getPaneId());
                if (!success) {
                    nameEl.innerHTML = originalHTML;
                }
                // On success, operations.js calls navigateToSilent which refreshes the DOM.
            } else {
                nameEl.innerHTML = originalHTML;
            }
        };

        const cancel = () => {
            if (finished) return;
            finished = true;
            nameEl.innerHTML = originalHTML;
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        });

        input.addEventListener('blur', () => {
            commit();
        });

        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    // ── Selection visuals ────────────────────────────────────────────────────

    _syncSelectionVisuals() {
        const paneId = this._getPaneId();
        const clip = SelectionManager.getClipboard();
        const cutPaths = clip.operation === 'move' ? clip.entries.map(e => e.path) : [];

        this.querySelectorAll('[data-path]').forEach(el => {
            const path = el.dataset.path;
            el.classList.toggle('selected', SelectionManager.has(path, paneId));
            el.classList.toggle('cut-pending', cutPaths.includes(path));
        });
    }

    // ── Column header context menu (preserved from original) ─────────────────

    _initHeaderContextMenu() {
        const ctxMenu = document.getElementById('header-context-menu');

        this.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.file-header')) {
                e.preventDefault();
                if (ctxMenu) {
                    this._syncColumnMenuState();
                    ctxMenu.style.display = 'block';
                    ctxMenu.style.left = `${e.pageX}px`;
                    ctxMenu.style.top = `${e.pageY}px`;
                }
            }
        });

        if (ctxMenu) {
            ctxMenu.addEventListener('click', (e) => {
                const item = e.target.closest('.context-menu-item');
                if (!item) return;
                const col = item.dataset.col;
                const cb  = document.getElementById(`col-opt-${col}`);
                if (!cb) return;
                cb.checked = !cb.checked;
                const hidden = !cb.checked;
                this.classList.toggle(`hide-col-${col}`, hidden);
                localStorage.setItem(`hide-col-${col}`, hidden ? 'true' : 'false');
            });

            document.addEventListener('click', (e) => {
                if (!ctxMenu.contains(e.target)) ctxMenu.style.display = 'none';
            }, { signal: this._ac?.signal });
        }
    }

    _applyStoredColumnVisibility() {
        ['modified', 'size', 'diff'].forEach((col) => {
            const hidden = localStorage.getItem(`hide-col-${col}`) === 'true';
            this.classList.toggle(`hide-col-${col}`, hidden);
        });
        this._syncColumnMenuState();
    }

    _syncColumnMenuState() {
        ['modified', 'size', 'diff'].forEach((col) => {
            const cb = document.getElementById(`col-opt-${col}`);
            if (cb) cb.checked = localStorage.getItem(`hide-col-${col}`) !== 'true';
        });
    }

    disconnectedCallback() {
        if (this._ac) {
            this._ac.abort();
            this._ac = null;
        }
    }
}

customElements.define('sovereign-file-list', SovereignFileList);
