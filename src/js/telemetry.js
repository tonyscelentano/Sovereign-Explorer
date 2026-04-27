// ═══════════════════════════════════════════════════════════════════════════════
// Sovereign Explorer — Telemetry Sidecar Bridge
// Listens to the Rust IPC pipe for Python messages and updates the UI.
// ═══════════════════════════════════════════════════════════════════════════════

import { hasListen, listen } from './ipc.js';
import { appendLine } from './terminal/index.js';
import { eventHub } from './event-hub.js';
import { appState } from './state.js';
import { syncSidecarWatchPaths } from './fs.js';

let workspaces = [];

function loadWorkspaces() {
    try {
        const stored = localStorage.getItem('sovereign_momentum_workspaces');
        if (stored) {
            workspaces = JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load momentum workspaces', e);
    }
    renderWorkspaces();
    syncSidecarWatchPaths(workspaces);
}

function saveWorkspaces() {
    localStorage.setItem('sovereign_momentum_workspaces', JSON.stringify(workspaces));
    syncSidecarWatchPaths(workspaces);
}

function renderWorkspaces() {
    const container = document.getElementById('momentum-workspaces');
    if (!container) return;

    container.innerHTML = workspaces.map((ws, i) => `
        <div class="tree-item" style="display: flex; justify-content: space-between; align-items: center;">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${ws}">${ws.split(/[/\\]/).pop()}</span>
            <button class="remove-ws-btn" data-index="${i}" style="background: none; border: none; color: var(--text-dim); cursor: pointer;">×</button>
        </div>
    `).join('');

    container.querySelectorAll('.remove-ws-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index);
            workspaces.splice(idx, 1);
            saveWorkspaces();
            renderWorkspaces();
        });
    });
}

export async function initTelemetry() {
    loadWorkspaces();

    const btnAdd = document.getElementById('btn-add-workspace');
    if (btnAdd) {
        btnAdd.addEventListener('click', () => {
            const current = appState.state.currentPath;
            if (current && current !== 'this-pc' && !workspaces.includes(current)) {
                workspaces.push(current);
                saveWorkspaces();
                renderWorkspaces();
            }
        });
    }

    const btnToggle = document.getElementById('btn-toggle-momentum');
    const feed = document.getElementById('momentum-feed');
    const wsContainer = document.getElementById('momentum-workspaces');

    if (btnToggle && feed && wsContainer) {
        let isCollapsed = localStorage.getItem('momentum_collapsed') === 'true';

        const updateCollapseState = () => {
            if (isCollapsed) {
                feed.style.display = 'none';
                wsContainer.style.display = 'none';
                btnToggle.textContent = '▶';
            } else {
                feed.style.display = 'block';
                wsContainer.style.display = 'block';
                btnToggle.textContent = '▼';
            }
        };

        updateCollapseState();

        btnToggle.addEventListener('click', () => {
            isCollapsed = !isCollapsed;
            localStorage.setItem('momentum_collapsed', isCollapsed);
            updateCollapseState();
        });
    }

    if (!hasListen()) {
        console.warn('Telemetry init skipped: IPC listen hook not available.');
        return;
    }

    try {
        // Use eventHub to benefit from microtask batching and avoid race conditions
        eventHub.on('sidecar-telemetry', payloadRaw => {
            try {
                const payload = typeof payloadRaw === 'string' ? JSON.parse(payloadRaw) : payloadRaw;

                switch (payload.type) {
                    case 'status':
                        appendLine(`Sidecar [PID ${payload.data.pid}]: ${payload.data.message}`, 'line-dim');
                        break;
                    case 'pulse':
                        const pulseBadge = document.getElementById('pulse-badge');
                        const readEl = document.getElementById('pulse-read');
                        const writeEl = document.getElementById('pulse-write');

                        if (pulseBadge && readEl && writeEl) {
                            pulseBadge.style.display = 'flex';

                            // Convert bytes/sec to MB/s
                            const r_mb = (payload.data.read_rate / (1024 * 1024)).toFixed(1);
                            const w_mb = (payload.data.write_rate / (1024 * 1024)).toFixed(1);

                            readEl.textContent = `↓${r_mb}`;
                            writeEl.textContent = `↑${w_mb}`;

                            // Visual feedback if writing/reading more than 1MB/s
                            readEl.classList.toggle('active-read', payload.data.read_rate > 1024 * 1024);
                            writeEl.classList.toggle('active-write', payload.data.write_rate > 1024 * 1024);
                        }

                        // Broadcast to extensions
                        window.dispatchEvent(new CustomEvent('sov:telemetry-pulse', { detail: payload.data }));
                        break;
                    case 'momentum':
                        const feed = document.getElementById('momentum-feed');
                        if (feed) {
                            const add_str = payload.data.adds > 0 ? `<span class="momentum-add">+${payload.data.adds}</span>` : '';
                            const sub_str = payload.data.subs > 0 ? `<span class="momentum-sub">-${payload.data.subs}</span>` : '';
                            const time_str = new Date(payload.data.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                            const div = document.createElement('div');
                            div.className = 'momentum-item';
                            div.innerHTML = `
                                <div class="momentum-file" title="${payload.data.file}">${payload.data.file}</div>
                                <div class="momentum-stats">
                                    ${add_str} ${sub_str}
                                    <span class="momentum-time">${time_str}</span>
                                </div>
                            `;

                            feed.prepend(div);
                            if (feed.children.length > 50) {
                                feed.removeChild(feed.lastChild);
                            }
                        }

                        // Inject directly into List View Column if visible
                        if (payload.data.path) {
                            const normalizedPayloadPath = payload.data.path.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
                            const colCells = Array.from(document.querySelectorAll('[data-file-diff]'))
                                .filter((cell) => {
                                    const cellPath = cell.dataset.fileDiff.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
                                    return cellPath === normalizedPayloadPath || normalizedPayloadPath.startsWith(cellPath + '/');
                                });

                            colCells.forEach(colCell => {
                                const add_str = payload.data.adds > 0 ? `<span class="momentum-add">+${payload.data.adds}</span>` : '';
                                const sub_str = payload.data.subs > 0 ? `<span class="momentum-sub">-${payload.data.subs}</span>` : '';
                                colCell.innerHTML = [add_str, sub_str].filter(Boolean).join(' ') || '<span class="time-dim">—</span>';

                                // Flash the row briefly for UX
                                const row = colCell.closest('.file-row');
                                if (row) {
                                    row.style.background = 'rgba(255, 255, 255, 0.1)';
                                    setTimeout(() => row.style.background = '', 400);
                                }
                            });
                        }
                        break;
                    default:
                        console.log('Sidecar Telemetry:', payload);
                }
            } catch (err) {
                console.error('Failed to parse sidecar telemetry:', err, payloadRaw);
            }
        });

        // Register with Tauri PTY
        await listen('sidecar-telemetry');

        appendLine('Telemetry pipe connected to Sidecar.', 'line-dim');
    } catch (err) {
        appendLine(`Failed to bind telemetry listener: ${err}`, 'line-err');
    }
}
