/**
 * sovereign-scaffolder.js
 * "Bulk Scaffolder" - Industrial multi-item creation engine.
 */
import { invoke } from '../ipc.js';
import { getCurrentPath, navigateToSilent } from '../fs.js';

class SovereignScaffolder extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
    }

    render() {
        this.shadowRoot.innerHTML = `
        <style>
            :host {
                display: none;
                position: fixed;
                top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.7);
                backdrop-filter: blur(4px);
                z-index: 5000;
                align-items: center;
                justify-content: center;
            }
            :host(.open) { display: flex; }
            .modal {
                background: var(--bg-panel, #1a1a1a);
                border: 1px solid var(--accent, #4a9eff);
                border-radius: 6px;
                width: 500px;
                padding: 20px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.6);
                font-family: var(--f-ui, 'Inter', sans-serif);
                color: var(--text, #e0e0e0);
            }
            h2 { margin-top: 0; font-size: 16px; color: var(--accent); }
            .desc { font-size: 12px; color: var(--text-dim, #888); margin-bottom: 12px; line-height: 1.4; }
            textarea {
                width: 100%;
                height: 80px;
                background: var(--bg-input, #111);
                color: var(--text);
                border: 1px solid var(--border, #333);
                border-radius: 4px;
                padding: 10px;
                font-family: var(--f-terminal, 'Consolas', monospace);
                font-size: 13px;
                outline: none;
                resize: none;
                box-sizing: border-box;
            }
            textarea:focus { border-color: var(--accent); }
            .hint { font-size: 11px; color: var(--text-dim); margin-top: 8px; }
            code { background: #222; padding: 2px 4px; border-radius: 3px; color: var(--accent); }
            .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
            button {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                background: #333;
                color: #fff;
            }
            button.primary { background: var(--accent, #4a9eff); }
            button:hover { filter: brightness(1.2); }
        </style>
        <div class="modal">
            <h2>Industrial Scaffolder</h2>
            <div class="desc">Create multiple files and folders using a structured schema.</div>
            <textarea id="schema-input" placeholder="e.g. 1f:assets, 1f:css, 1f:js, 3file:index.html|style.css|app.js"></textarea>
            <div class="hint">
                Format: <code>count + [f|file|d|dir|folder] + : + names</code> (pipe separated)<br>
                Example: <code>2d:src|dist, 3f:index.html|style.css|app.js</code>
            </div>
            <div class="actions">
                <button id="btn-cancel">Cancel</button>
                <button id="btn-create" class="primary">Execute Schema</button>
            </div>
        </div>
        `;

        this.shadowRoot.getElementById('btn-cancel').onclick = () => this.close();
        this.shadowRoot.getElementById('btn-create').onclick = () => this.execute();
        this.shadowRoot.getElementById('schema-input').onkeydown = (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.execute();
            if (e.key === 'Escape') this.close();
        };
    }

    open() {
        this.classList.add('open');
        const input = this.shadowRoot.getElementById('schema-input');
        input.value = '';
        setTimeout(() => input.focus(), 50);
    }

    close() {
        this.classList.remove('open');
    }

    async execute() {
        const raw = this.shadowRoot.getElementById('schema-input').value.trim();
        if (!raw) return;

        const currentDir = getCurrentPath();
        if (!currentDir) return;

        // Simple Parser
        // 1f:assets, 2folder:css|js, 1file:README.md
        const segments = raw.split(',').map(s => s.trim()).filter(Boolean);
        
        this.close();

        for (const segment of segments) {
            const match = segment.match(/^(\d+)([a-z]+):(.*)$/i);
            if (!match) continue;

            const count = parseInt(match[1]);
            const typeRaw = match[2].toLowerCase();
            const names = match[3].split('|').map(n => n.trim()).filter(Boolean);
            
            const isDir = ['d', 'dir', 'folder'].includes(typeRaw);
            const isFile = ['f', 'file'].includes(typeRaw);
            const cmd = isDir ? 'create_dir' : 'create_file';

            if (!isDir && !isFile) {
                console.warn(`[Scaffolder] Unknown type: ${typeRaw}. Defaulting to file.`);
            }

            for (let i = 0; i < count; i++) {
                // If multiple names provided like name1|name2, use them. 
                // If names exhausted but count > names.length, append index.
                let name = names[i] || (isDir ? `new_folder_${i+1}` : `new_file_${i+1}.txt`);
                
                const sep = currentDir.includes('/') ? '/' : '\\';
                const path = currentDir.endsWith(sep) ? currentDir + name : currentDir + sep + name;

                try {
                    await invoke(cmd, { name: path });
                } catch (err) {
                    console.error(`[Scaffolder] Failed to create ${path}:`, err);
                }
            }
        }

        await navigateToSilent(currentDir);
    }
}

customElements.define('sovereign-scaffolder', SovereignScaffolder);
export default SovereignScaffolder;
