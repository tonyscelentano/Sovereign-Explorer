/**
 * sovereign-bookmarks.js
 * User-customizable bookmarks for the sidebar.
 */
import { appState } from '../state.js';
import { navigateTo } from '../fs.js';

class SovereignBookmarks extends HTMLElement {
    constructor() {
        super();
        this.bookmarks = [];
        this.removeMode = false;
    }

    connectedCallback() {
        this.load();
        this.render();
        
        // Listen for path changes to highlight active bookmark
        this._unsub = appState.subscribe('currentPath', (path) => {
            this.highlightActive(path);
        });

        // Re-load defaults once homeDir is resolved if we are using defaults
        this._unsubHome = appState.subscribe('homeDir', () => {
            if (!localStorage.getItem('sovereign_bookmarks')) {
                this.load();
                this.render();
            }
        });
    }

    disconnectedCallback() {
        if (this._unsub) this._unsub();
        if (this._unsubHome) this._unsubHome();
    }

    load() {
        const stored = localStorage.getItem('sovereign_bookmarks');
        if (stored) {
            try {
                this.bookmarks = JSON.parse(stored);
            } catch (e) {
                console.error('Failed to parse bookmarks:', e);
                this.bookmarks = this.getDefaults();
            }
        } else {
            this.bookmarks = this.getDefaults();
            // Don't save yet if home is not resolved
            if (this.bookmarks[0].path !== '/') {
                this.save();
            }
        }
    }

    getDefaults() {
        const home = appState.state.homeDir || localStorage.getItem('sovereign_home_dir') || '/';
        const h = home.replace(/\\/g, '/');
        const root = h.endsWith('/') ? h : h + '/';

        return [
            { name: 'Home', path: h, icon: 'home' },
            { name: 'Documents', path: root + 'Documents', icon: 'folder' },
            { name: 'Downloads', path: root + 'Downloads', icon: 'download' },
            { name: 'Music', path: root + 'Music', icon: 'music' },
            { name: 'Pictures', path: root + 'Pictures', icon: 'image' }
        ];
    }

    save() {
        localStorage.setItem('sovereign_bookmarks', JSON.stringify(this.bookmarks));
    }

    render() {
        this.innerHTML = `
            <div class="sidebar-section-header">
                <div class="sidebar-section-label">BOOKMARKS</div>
                <div class="section-controls">
                    <button id="btn-add-bookmark" title="Add Bookmark">+</button>
                    <button id="btn-toggle-remove" title="Remove Mode" class="${this.removeMode ? 'active' : ''}">-</button>
                </div>
            </div>
            <nav id="bookmark-list">
                ${this.bookmarks.map((b, i) => `
                    <div class="tree-item bookmark-item ${this.removeMode ? 'removable' : ''}" data-path="${b.path}" data-index="${i}">
                        <i data-lucide="${b.icon || 'folder'}" class="icon"></i>
                        <span class="name">${b.name}</span>
                        ${this.removeMode ? '<i data-lucide="x" class="remove-icon"></i>' : ''}
                    </div>
                `).join('')}
            </nav>

            <div id="add-bookmark-modal" class="modal-backdrop">
                <div class="modal-window" style="width: 400px;">
                    <div class="modal-header">
                        <span class="modal-title">Add Bookmark</span>
                        <button id="bm-modal-close" class="modal-close-btn">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Name</label>
                            <input type="text" id="bm-name" placeholder="My Projects">
                        </div>
                        <div class="form-group">
                            <label>Path</label>
                            <input type="text" id="bm-path" placeholder="C:\\Path\\To\\Folder">
                        </div>
                        <button id="btn-current-folder" class="scan-btn" style="width: 100%; margin-top: 10px;">
                            Add Current Folder
                        </button>
                    </div>
                    <div class="modal-footer">
                        <button id="btn-confirm-add" class="primary-btn">Add Bookmark</button>
                    </div>
                </div>
            </div>
        `;

        this.querySelectorAll('.bookmark-item').forEach(item => {
            item.onclick = () => {
                if (this.removeMode) {
                    this.removeBookmark(parseInt(item.dataset.index));
                } else {
                    navigateTo(item.dataset.path);
                }
            };
        });

        const modal = this.querySelector('#add-bookmark-modal');
        this.querySelector('#btn-add-bookmark').onclick = () => modal.classList.add('open');
        this.querySelector('#bm-modal-close').onclick = () => modal.classList.remove('open');
        
        this.querySelector('#btn-toggle-remove').onclick = () => {
            this.removeMode = !this.removeMode;
            this.render();
        };

        this.querySelector('#btn-current-folder').onclick = () => {
            this.querySelector('#bm-path').value = appState.state.currentPath;
            if (!this.querySelector('#bm-name').value) {
                const parts = appState.state.currentPath.split(/[/\\]/);
                this.querySelector('#bm-name').value = parts[parts.length - 1] || 'New Bookmark';
            }
        };

        this.querySelector('#btn-confirm-add').onclick = () => {
            const name = this.querySelector('#bm-name').value.trim();
            const path = this.querySelector('#bm-path').value.trim().replace(/\\/g, '/');
            if (name && path) {
                this.addBookmark(name, path);
                modal.classList.remove('open');
            }
        };

        if (window.hydrateIcons) window.hydrateIcons();
        this.highlightActive(appState.state.currentPath);
    }

    addBookmark(name, path) {
        this.bookmarks.push({ name, path, icon: 'folder' });
        this.save();
        this.render();
    }

    removeBookmark(index) {
        this.bookmarks.splice(index, 1);
        this.save();
        this.render();
    }

    highlightActive(path) {
        if (!path) return;
        const normalized = path.replace(/\\/g, '/').toLowerCase();
        this.querySelectorAll('.bookmark-item').forEach(item => {
            const bPath = (item.dataset.path || '').toLowerCase();
            item.classList.toggle('active', normalized === bPath || normalized.startsWith(bPath + '/'));
        });
    }
}

customElements.define('sovereign-bookmarks', SovereignBookmarks);
export default SovereignBookmarks;
