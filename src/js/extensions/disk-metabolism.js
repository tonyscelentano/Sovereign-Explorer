// ═══════════════════════════════════════════════════════════════════════════════
// Sovereign Extension — Disk Metabolism HUD
// A hovering telemetry widget showing live disk I/O rates.
// ═══════════════════════════════════════════════════════════════════════════════

import registry from './registry.js';

const DISK_METABOLISM_EXT = {
    id: 'disk-metabolism-hud',
    name: 'Disk Metabolism',
    category: 'telemetry',
    autoActivate: true,

    async mount(target) {
        // Create shadow root for absolute CSS isolation
        const shadow = target.attachShadow({ mode: 'open' });
        
        const wrapper = document.createElement('div');
        wrapper.className = 'hud-card';
        wrapper.innerHTML = `
            <style>
                .hud-card {
                    background: rgba(10, 10, 10, 0.85);
                    backdrop-filter: blur(8px);
                    border: 1px solid rgba(0, 255, 128, 0.2);
                    border-radius: 6px;
                    padding: 8px 12px;
                    min-width: 140px;
                    color: #00ff80;
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 10px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    user-select: none;
                    transition: border-color 0.2s;
                    cursor: help;
                }
                .label { opacity: 0.5; text-transform: uppercase; font-size: 8px; margin-bottom: 4px; }
                .row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
                .val { font-size: 14px; font-weight: 700; color: #fff; text-shadow: 0 0 5px rgba(0,255,128,0.3); }
                .unit { opacity: 0.6; font-size: 9px; }
                .active { border-color: #00ff80; }
            </style>
            <div class="label" title="Live Disk I/O telemetry from Python sidecar">Disk Metabolism</div>
            <div class="row">
                <span>Read</span>
                <span><span id="read-val" class="val">0.0</span> <span class="unit">MB/s</span></span>
            </div>
            <div class="row" style="margin-top: 4px;">
                <span>Write</span>
                <span><span id="write-val" class="val">0.0</span> <span class="unit">MB/s</span></span>
            </div>
        `;
        
        shadow.appendChild(wrapper);

        const readVal = shadow.querySelector('#read-val');
        const writeVal = shadow.querySelector('#write-val');

        // Logic: Listen for the global event dispatched by telemetry.js (we'll add this next)
        const updateHandler = (e) => {
            const { read_rate, write_rate } = e.detail;
            const r_mb = (read_rate / (1024 * 1024)).toFixed(1);
            const w_mb = (write_rate / (1024 * 1024)).toFixed(1);
            
            readVal.textContent = r_mb;
            writeVal.textContent = w_mb;

            wrapper.classList.toggle('active', read_rate > 500000 || write_rate > 500000);
        };

        window.addEventListener('sov:telemetry-pulse', updateHandler);

        return {
            unmount: () => {
                window.removeEventListener('sov:telemetry-pulse', updateHandler);
            }
        };
    },

    async unmount(instance) {
        if (instance && instance.unmount) instance.unmount();
    }
};

registry.register(DISK_METABOLISM_EXT);
