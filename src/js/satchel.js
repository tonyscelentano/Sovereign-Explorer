// ═══════════════════════════════════════════════════════════════════════════════
// Sovereign Explorer — The Satchel
// Transparent multi-file clipboard for gathering files across folders.
// ═══════════════════════════════════════════════════════════════════════════════

import { invoke } from './ipc.js';
import { getCurrentPath, navigateToSilent } from './fs.js';
import { showToast } from './utils.js';

const Satchel = {
    items: [], // Array of file entries

    add(entry) {
        if (!entry || !entry.path) return;
        // Prevent duplicates
        if (this.items.find(i => i.path === entry.path)) return;
        
        this.items.push(entry);
        this.render();
        console.log(`Added to satchel: ${entry.name}`);
    },

    remove(path) {
        if (!path) return;
        this.items = this.items.filter(i => i.path !== path);
        this.render();
    },

    clear() {
        this.items = [];
        this.render();
    },

    render() {
        const container = document.getElementById('satchel-container');
        if (!container) return;
        
        if (this.items.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = `
            <div class="satchel-header">
                <i data-lucide="briefcase"></i>
                <span class="satchel-title">SATCHEL (${this.items.length})</span>
                <button id="satchel-clear"><i data-lucide="trash-2"></i></button>
            </div>
            <div class="satchel-body">
                ${this.items.slice(-3).map(i => `<div class="satchel-item" title="${i.path}">${i.name}</div>`).join('')}
                ${this.items.length > 3 ? `<div class="satchel-more">+${this.items.length - 3} more</div>` : ''}
            </div>
            <div class="satchel-footer">
                <button class="satchel-action" id="satchel-move">MOVE HERE</button>
            </div>
        `;

        const clearBtn = document.getElementById('satchel-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clear());
        }
        
        const moveBtn = document.getElementById('satchel-move');
        if (moveBtn) {
            moveBtn.addEventListener('click', async () => {
                const dest = getCurrentPath();
                if (!dest) {
                    showToast("Move failed: Invalid destination folder.", 'error');
                    return;
                }
                const sources = this.items.map(i => i?.path).filter(Boolean);
                if (sources.length === 0) {
                    showToast("Move failed: No valid items in satchel.", 'error');
                    return;
                }

                const originalText = moveBtn.textContent;
                moveBtn.textContent = 'MOVING...';
                moveBtn.disabled = true;

                try {
                    await invoke('move_files', { sources, destFolder: dest });
                    console.log(`Moved ${sources.length} files to ${dest}`);
                    showToast(`Moved ${sources.length} items to satchel dest.`, 'success');
                    this.clear();
                    await navigateToSilent(dest);
                } catch (err) {
                    console.error("[satchel] Move failed:", err);
                    showToast(`Move failed: ${err.message || err}`, 'error');
                } finally {
                    moveBtn.textContent = originalText;
                    moveBtn.disabled = false;
                }
            });
        }

        if (window.hydrateIcons) window.hydrateIcons();
    },

    init() {
        this.render();
    }
};

export default Satchel;
