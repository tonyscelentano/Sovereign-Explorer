import { invoke } from '../ipc.js';
import { getCurrentPath, navigateTo, navigateToSilent } from '../fs.js';

export class SovereignPalette extends HTMLElement {
    constructor() {
        super();
        this.isOpen = false;
        this.commands = [
            { regex: /^new\s+folder\s+(.+)$/i, action: (name) => this.createDirectory(name), hint: 'new folder [name]' },
            { regex: /^new\s+file\s+(.+)$/i, action: (name) => this.createFile(name), hint: 'new file [name]' },
            { regex: /^go\s+(.+)$/i, action: (path) => navigateTo(path), hint: 'go [path]' },
            { regex: /^find\s+(.+)$/i, action: (query) => this.seedSearch(query), hint: 'find [query]' }
        ];
    }

    connectedCallback() {
        this._ac = new AbortController();
        this.render();
        this._bindRefs();
        this._bindEvents();
    }

    render() {
        this.className = 'modal-backdrop';
        this.innerHTML = `
            <div class="palette-container">
                <div class="palette-input-wrap">
                    <i data-lucide="terminal" class="palette-icon"></i>
                    <input type="text" id="palette-input" placeholder="Type a command (spell)…" autocomplete="off" spellcheck="false">
                </div>
                <div id="palette-results">
                    <!-- Command hints will appear here -->
                </div>
            </div>
        `;
        if (window.hydrateIcons) window.hydrateIcons();
    }

    _bindRefs() {
        this.paletteInput = this.querySelector('#palette-input');
        this.resultsEl = this.querySelector('#palette-results');
    }

    _bindEvents() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                this.toggle();
            }
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        }, { signal: this._ac?.signal });

        this.paletteInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.execute(this.paletteInput.value);
            }
        });

        this.paletteInput.addEventListener('input', () => {
            this.updateHints(this.paletteInput.value);
        });

        // Close on backdrop click
        this.addEventListener('click', (e) => {
            if (e.target === this) this.close();
        });
    }

    open() {
        this.isOpen = true;
        this.classList.add('open');
        this.paletteInput.value = '';
        this.updateHints('');
        setTimeout(() => this.paletteInput.focus(), 50);
    }

    close() {
        this.isOpen = false;
        this.classList.remove('open');
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    async execute(raw) {
        const cmd = raw.trim();
        if (!cmd) return;

        let executed = false;
        try {
            for (const c of this.commands) {
                const match = cmd.match(c.regex);
                if (match) {
                    await c.action(match[1]);
                    console.log(`Executed: ${c.hint}`);
                    executed = true;
                    break;
                }
            }
        } catch (error) {
            console.error(`Palette command failed: ${cmd}`, error);
            this.resultsEl.innerHTML = `<div class="palette-hint error">${error}</div>`;
            return;
        }

        if (!executed) console.warn(`Unknown command: ${cmd}`);
        this.close();
    }

    updateHints(raw) {
        if (!this.resultsEl) return;

        const val = raw.toLowerCase().trim();
        if (!val) {
            this.resultsEl.innerHTML = this.commands
                .map((command) => `<div class="palette-hint">${command.hint}</div>`)
                .join('');
            return;
        }

        const matches = this.commands.filter(c => c.hint.toLowerCase().includes(val));
        this.resultsEl.innerHTML = matches.length
            ? matches.map(c => `<div class="palette-hint">${c.hint}</div>`).join('')
            : '<div class="palette-hint error">No matching spells found.</div>';
    }

    resolveTargetPath(name) {
        const base = (getCurrentPath() || '').replace(/[\\/]+$/, '');
        return base ? `${base}/${name}` : name;
    }

    async createDirectory(name) {
        await invoke('create_dir', { name: this.resolveTargetPath(name) });
        if (getCurrentPath()) {
            await navigateToSilent(getCurrentPath());
        }
    }

    async createFile(name) {
        await invoke('create_file', { name: this.resolveTargetPath(name) });
        if (getCurrentPath()) {
            await navigateToSilent(getCurrentPath());
        }
    }

    seedSearch(query) {
        const search = document.querySelector('sovereign-workspace-pane.active-pane .workspace-search-input')
            || document.querySelector('sovereign-workspace-pane .workspace-search-input');
        if (!search) return;
        search.value = query;
        search.focus();
        search.dispatchEvent(new Event('input', { bubbles: true }));
    }

    disconnectedCallback() {
        if (this._ac) {
            this._ac.abort();
            this._ac = null;
        }
    }
}

customElements.define('sovereign-palette', SovereignPalette);
