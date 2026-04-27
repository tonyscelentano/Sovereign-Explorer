import { SovereignTerminalDock } from '../components/terminal-dock.js';
import { PTYTransport } from './pty-transport.js';
import { handleInterceptor } from './shell-illusion.js';
import { appState } from '../state.js';

let ui;
let transport;
let commandHistory = [];
let historyIdx = -1;

try { commandHistory = JSON.parse(localStorage.getItem('sovereign_history') || '[]'); } catch(e){}

export function initTerminal() {
    ui = document.getElementById('terminal-dock');
    if (!ui) {
        console.error('Terminal Dock element not found');
        return;
    }

    transport = new PTYTransport(ui);

    // Boot persistent session
    const shell = ui.currentShell || 'pwsh';
    const cwd = localStorage.getItem('sovereign_last_path') || appState.state.homeDir || '/';
    transport.initPersistentSession(shell, cwd);

    // Bind hooks manually
    ui.onPtyData = (data) => transport.sendRawData(data);
    ui.onResize = (rows, cols) => transport.triggerResize(rows, cols);
    ui.onKill = () => transport.killActive();
    ui.onShellChange = async (nextShell) => {
        const nextCwd = localStorage.getItem('sovereign_last_path') || appState.state.homeDir || '/';
        await transport.restartPersistentSession(nextShell, nextCwd);
    };

    // Removed: Auto-follow via sov:path-changed (Task 1: Disconnect Terminal Auto-Follow)

    window.addEventListener('sov:terminal-cd', async (event) => {
        const nextPath = event.detail?.path;
        if (!nextPath || !transport.hasPersistentSession()) return;
        await transport.syncSessionCwd(nextPath, ui.currentShell);
    });

    // Command Input History + Routing
    ui.onKeyboardInput = async (e) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIdx > 0) historyIdx--;
            else if (historyIdx === -1 && commandHistory.length > 0) historyIdx = commandHistory.length - 1;
            if (historyIdx >= 0) ui.setInputValue(commandHistory[historyIdx]);
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIdx < commandHistory.length - 1) {
                historyIdx++;
                ui.setInputValue(commandHistory[historyIdx]);
            } else {
                historyIdx = -1;
                ui.setInputValue('');
            }
            return;
        }

        if (e.key !== 'Enter') return;

        const raw = ui.getInputValue().trim();
        ui.setInputValue('');
        if (!raw) return;

        // History
        commandHistory.push(raw);
        if (commandHistory.length > 100) commandHistory.shift();
        historyIdx = -1;
        localStorage.setItem('sovereign_history', JSON.stringify(commandHistory));

        // Illusion Router
        if (await handleInterceptor(raw, ui, {
            hasSession: () => transport.hasPersistentSession(),
            syncSessionCwd: (nextPath) => transport.syncSessionCwd(nextPath, ui.currentShell),
        })) return;

        // Only echo commands when we are in the legacy one-shot path.
        if (!transport.hasPersistentSession()) {
            ui.appendLine(`❯ ${raw}`, 'line-cmd');
        }

        // Forward to specific transport runner
        await transport.executeCommand(raw, ui.currentShell);
    };
}

export function appendLine(text, cls) {
    if (ui) ui.appendLine(text, cls);
    else console.log(`[offline] ${text}`);
}
