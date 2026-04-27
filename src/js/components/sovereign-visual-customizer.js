// ═══════════════════════════════════════════════════════════════════════════════
// Sovereign Visual Customizer
// Modular component for live CSS variable overrides.
// ═══════════════════════════════════════════════════════════════════════════════

class SovereignVisualCustomizer extends HTMLElement {
    constructor() {
        super();
        this.tokens = [
            { id: 'accent', label: 'Primary Accent', default: '#ff00ff' },
            { id: 'bg-0', label: 'Background (Deep)', default: '#000000' },
            { id: 'bg-1', label: 'Panel Surface', default: '#121212' },
            { id: 'text-primary', label: 'Primary Text', default: '#ffffff' },
            { id: 'amber', label: 'Industrial Amber', default: '#ffbf00' },
            { id: 'green', label: 'System Green', default: '#00ff80' }
        ];
    }

    connectedCallback() {
        this._ac = new AbortController();
        this.className = 'modal-backdrop';
        this.id = 'visual-customizer-modal';
        this._render();
        this._loadSaved();
        
        this.addEventListener('click', (e) => {
            if (e.target === this) this.close();
        });
    }

    open() {
        this.classList.add('open');
    }

    close() {
        this.classList.remove('open');
    }

    _apply(token, value) {
        document.documentElement.style.setProperty(`--${token}`, value);
        localStorage.setItem(`sov_vis_${token}`, value);
        
        const hexDisplay = this.querySelector(`#hex-${token}`);
        if (hexDisplay) hexDisplay.value = value.toUpperCase();
    }

    _loadSaved() {
        this.tokens.forEach(t => {
            const saved = localStorage.getItem(`sov_vis_${t.id}`);
            if (saved) {
                document.documentElement.style.setProperty(`--${t.id}`, saved);
                const picker = this.querySelector(`#picker-${t.id}`);
                if (picker) picker.value = saved;
                const hex = this.querySelector(`#hex-${t.id}`);
                if (hex) hex.value = saved.toUpperCase();
            }
        });
    }

    _resetAll() {
        if (!confirm('Reset all visual overrides to theme defaults?')) return;
        this.tokens.forEach(t => {
            document.documentElement.style.removeProperty(`--${t.id}`);
            localStorage.removeItem(`sov_vis_${t.id}`);
        });
        window.location.reload(); // Hard reset to restore CSS cascade
    }

    _render() {
        this.innerHTML = `
            <div class="modal-window" style="width: 600px;">
                <div class="modal-header">
                    <span class="modal-title">Visual Customizer</span>
                    <button class="modal-close-btn" id="visuals-close">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="visuals-grid">
                        ${this.tokens.map(t => `
                            <div class="visual-ctrl">
                                <label>${t.label}</label>
                                <div class="visual-picker-row">
                                    <div class="color-input-wrapper">
                                        <input type="color" id="picker-${t.id}" 
                                               value="${t.default}"
                                               oninput="this.closest('sovereign-visual-customizer')._apply('${t.id}', this.value)">
                                    </div>
                                    <input type="text" id="hex-${t.id}" class="color-hex-val" value="${t.default.toUpperCase()}">
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="modal-footer">
                    <div class="visual-reset-all" id="btn-visuals-reset">
                        <i data-lucide="rotate-ccw"></i>
                        <span>Reset to Theme Defaults</span>
                    </div>
                    <span style="font-size: 10px; color: var(--text-dim);">Live CSS Injector v1.0</span>
                </div>
            </div>
        `;

        this.querySelector('#visuals-close').onclick = () => this.close();
        this.querySelector('#btn-visuals-reset').onclick = () => this._resetAll();
        
        if (window.hydrateIcons) window.hydrateIcons();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    disconnectedCallback() {
        if (this._ac) {
            this._ac.abort();
            this._ac = null;
        }
    }
}

customElements.define('sovereign-visual-customizer', SovereignVisualCustomizer);
export default SovereignVisualCustomizer;
