import { renameItem } from '../operations.js';
import { appState } from '../state.js';

export class SovereignFileTree extends HTMLElement {
    constructor() {
        super();
        this.navigateCallback = null;
        this.cachedEntries = [];
    }

    connectedCallback() {
        this._ac = new AbortController();

        this._unsubEntries = appState.subscribe('entries', (entries) => this.render(entries));

        if (appState.state.entries.length > 0) {
            this.render(appState.state.entries);
        } else {
            this.render([]);
        }

        window.addEventListener('sov:start-rename', (e) => {
            const { entry } = e.detail;
            if (entry) {
                const el = this._elForPath(entry.path);
                if (el) this.startInlineRename(entry, el);
            }
        }, { signal: this._ac?.signal });
    }

    setNavigator(fn) {
        this.navigateCallback = fn;
    }

    render(entries) {
        this.cachedEntries = Array.isArray(entries) ? entries : [];
        this.innerHTML = '';
        const dirs = this.cachedEntries.filter(e => e.is_dir);

        if (dirs.length === 0) {
            this.innerHTML = '<div class="tree-placeholder">No subdirectories.</div>';
            return;
        }

        dirs.forEach(entry => {
            const item = document.createElement('div');
            item.className = 'tree-item';
            item.dataset.path = entry.path;
            item.innerHTML = `<i data-lucide="folder" class="icon"></i> <span class="tree-name">${entry.name}</span>`;

            item.addEventListener('click', () => {
                if (this.navigateCallback) this.navigateCallback(entry.path);
            });

            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const ctx = document.getElementById('file-context-menu');
                if (ctx) ctx.show(e.pageX, e.pageY, entry);
            });

            this.appendChild(item);
        });

        if (window.hydrateIcons) window.hydrateIcons();
    }

    _elForPath(path) {
        return this.querySelector(`[data-path="${CSS.escape(path)}"]`);
    }

    async startInlineRename(entry, element) {
        if (!entry || !element) return;

        const nameEl = element.querySelector('.tree-name');
        if (!nameEl) return;

        const oldName = entry.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-rename-input';
        input.value = oldName;

        Object.assign(input.style, {
            width: '100%',
            background: 'var(--bg-0)',
            color: 'var(--text-primary)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius)',
            padding: '1px 4px',
            fontSize: 'inherit',
            fontFamily: 'inherit',
            outline: 'none',
            marginLeft: '4px'
        });

        const originalHTML = nameEl.innerHTML;
        nameEl.innerHTML = '';
        nameEl.appendChild(input);

        input.focus();
        input.select();

        let finished = false;

        const commit = async () => {
            if (finished) return;
            finished = true;
            const newName = input.value.trim();

            const invalidChars = /[\\/:*?"<>|]/;
            if (invalidChars.test(newName)) {
                alert("A file name can't contain any of the following characters: \\ / : * ? \" < > |");
                nameEl.innerHTML = originalHTML;
                return;
            }

            if (newName && newName !== oldName) {
                const success = await renameItem(entry.path, newName);
                if (!success) {
                    nameEl.innerHTML = originalHTML;
                }
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

    disconnectedCallback() {
        if (this._ac) {
            this._ac.abort();
            this._ac = null;
        }
        if (this._unsubEntries) {
            this._unsubEntries();
        }
    }
}

customElements.define('sovereign-file-tree', SovereignFileTree);
