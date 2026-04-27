import ThemeManager from '../theme.js';
import { invoke } from '../ipc.js';

const WIZARD_STEPS = [
    { key: 'folder', title: 'Folder', desc: 'Standard directory icon' },
    { key: 'file-generic', title: 'Generic File', desc: 'Unknown or default file type' },
    { key: 'text-file', title: 'Text Document', desc: 'For .txt, .md, .log files' },
    { key: 'image-file', title: 'Image', desc: 'For .png, .jpg, .gif files' },
    { key: 'folder-zip', title: 'Archive / Zip', desc: 'For .zip, .rar, .7z files' },
    { key: 'script', title: 'Script', desc: 'For .ps1, .bat, .sh files' },
    { key: 'config-file', title: 'Config File', desc: 'For .ini, .yaml, .json files' }
];

export class SovereignIconThemer extends HTMLElement {
    constructor() {
        super();
        this.isOpen = false;
        this.icons = [];
        this.currentStep = 0;
        this.profile = {};
    }

    async connectedCallback() {
        this._ac = new AbortController();
        this.render();
        this._bindEvents();
    }

    render() {
        this.className = 'modal-backdrop';
        this.innerHTML = `
            <div class="modal-window icon-themer-window" style="width: 700px; max-width: 90vw;">
                <div class="modal-header">
                    <span class="modal-title">Theme Alignment Wizard — <span id="wiz-theme-name"></span></span>
                    <button id="wiz-close" class="modal-close-btn"><i data-lucide="x"></i></button>
                </div>
                <div class="modal-body" style="display: flex; flex-direction: column; height: 70vh;">
                    
                    <div id="wiz-intro" style="padding: 20px; text-align: center; flex: 1;">
                        <i data-lucide="wand-2" style="width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.8;"></i>
                        <h2 style="margin-top: 0;">Align this Theme</h2>
                        <p class="time-dim" style="line-height: 1.5; margin-bottom: 24px;">Because many icon packs are ripped from different Windows versions, their internal numbering often doesn't match standard indices. This wizard will ask you to identify a few core icons for the current pack so Sovereign Explorer can map them perfectly.</p>
                        <button id="btn-wiz-start" class="scan-btn" style="padding: 10px 30px; font-size: 14px;">Start Wizard</button>
                        
                        <div style="margin-top: 48px; border-top: 1px solid var(--border); padding-top: 16px;">
                            <button id="btn-wiz-clear" class="scan-btn" style="background: transparent; color: var(--text-dim);">Clear existing profile for this theme</button>
                        </div>
                    </div>

                    <div id="wiz-prompt-area" style="display: none; padding: 16px; background: var(--bg-hover); border-bottom: 1px solid var(--border); text-align: center;">
                        <h3 id="wiz-prompt-title" style="margin: 0 0 4px 0; color: var(--accent);"></h3>
                        <div id="wiz-prompt-desc" class="time-dim" style="font-size: 12px;"></div>
                        <div style="font-size: 11px; margin-top: 8px; opacity: 0.6;">Step <span id="wiz-step-idx"></span> of ${WIZARD_STEPS.length}</div>
                    </div>

                    <div id="wiz-grid-area" style="display: none; flex: 1; overflow-y: auto; padding: 16px;">
                        <div id="wiz-grid" class="icon-library-grid" style="grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));"></div>
                    </div>
                    
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    _bindEvents() {
        const closeBtn = this.querySelector('#wiz-close');
        closeBtn.onclick = () => this.close();

        const startBtn = this.querySelector('#btn-wiz-start');
        startBtn.onclick = () => this._startWizard();
        
        const clearBtn = this.querySelector('#btn-wiz-clear');
        clearBtn.onclick = () => {
            ThemeManager.clearThemeProfile(ThemeManager.current);
            alert(`Profile cleared for ${ThemeManager.current}`);
            this.close();
        };

        const grid = this.querySelector('#wiz-grid');
        grid.onclick = (e) => {
            const item = e.target.closest('.lib-icon-item');
            if (item) {
                const iconName = item.dataset.icon;
                this._recordStep(iconName);
            }
        };

        this.onclick = (e) => { if(e.target === this) this.close(); };
    }

    async _startWizard() {
        const theme = ThemeManager.current;
        try {
            const icons = await invoke('list_theme_icons', { themeName: theme });
            if (!icons || icons.length === 0) {
                alert(`No valid .ico or .webp icons found in pack: ${theme}`);
                return;
            }
            this.icons = icons;
            this.profile = {};
            this.currentStep = 0;
            
            this.querySelector('#wiz-intro').style.display = 'none';
            this.querySelector('#wiz-prompt-area').style.display = 'block';
            this.querySelector('#wiz-grid-area').style.display = 'block';
            
            this._renderGrid();
            this._showStep();
            
        } catch (err) {
            alert(`Failed to load icons: ${err}`);
        }
    }

    _renderGrid() {
        const grid = this.querySelector('#wiz-grid');
        const theme = ThemeManager.current; // Use raw theme name, encoding breaks local dev server resolving
        
        grid.innerHTML = this.icons.map(icon => {
            // Determine subfolder based on extension
            const ext = icon.split('.').pop();
            const subfolder = ext === 'webp' ? 'webp' : 'ico';
            const src = `assets/themes/IconPacks/${theme}/${subfolder}/${icon}`;
            const baseName = icon.replace(/\.[^/.]+$/, "");
            
            return `
                <div class="lib-icon-item" data-icon="${baseName}" title="${icon}" style="cursor: pointer; padding: 8px;">
                    <img src="${src}" loading="lazy" onerror="this.parentElement.style.display='none'" style="width: 32px; height: 32px;">
                    <span class="lib-icon-name" style="font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; display: block; text-align: center; margin-top: 4px;">${baseName}</span>
                </div>
            `;
        }).join('');
    }

    _showStep() {
        if (this.currentStep >= WIZARD_STEPS.length) {
            this._finishWizard();
            return;
        }

        const step = WIZARD_STEPS[this.currentStep];
        this.querySelector('#wiz-prompt-title').textContent = `Click the icon for: ${step.title}`;
        this.querySelector('#wiz-prompt-desc').textContent = step.desc;
        this.querySelector('#wiz-step-idx').textContent = this.currentStep + 1;
    }

    _recordStep(iconBaseName) {
        const step = WIZARD_STEPS[this.currentStep];
        this.profile[step.key] = iconBaseName;
        
        this.currentStep++;
        this._showStep();
    }

    _finishWizard() {
        ThemeManager.saveThemeProfile(ThemeManager.current, this.profile);
        this.close();
    }

    open() {
        this.isOpen = true;
        this.querySelector('#wiz-theme-name').textContent = ThemeManager.current;
        this.querySelector('#wiz-intro').style.display = 'flex';
        this.querySelector('#wiz-prompt-area').style.display = 'none';
        this.querySelector('#wiz-grid-area').style.display = 'none';
        this.classList.add('open');
    }

    close() {
        this.isOpen = false;
        this.classList.remove('open');
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    disconnectedCallback() {
        if (this._ac) {
            this._ac.abort();
            this._ac = null;
        }
    }
}

customElements.define('sovereign-icon-themer', SovereignIconThemer);
