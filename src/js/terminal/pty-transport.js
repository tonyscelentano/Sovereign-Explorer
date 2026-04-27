import { hasListen, invoke, listen } from '../ipc.js';
import { getCurrentPath } from '../fs.js';
import { appState } from '../state.js';

export class PTYTransport {
    constructor(ui) {
        this.ui = ui;
        this.activeTaskId = null; // Currently executing foreground task (job)
        this.sessionTaskId = null; // The persistent background shell
        this.sessionShell = ui.currentShell || localStorage.getItem('sovereign_shell') || 'pwsh';
        this.sessionRestartTimer = null;
        this.lastSessionCwd = null;
        this.isRestartingSession = false;
        this.lastSessionInterruptAt = 0;
        this.bindOutputListener();
    }

    async bindOutputListener() {
        if (!hasListen()) return;

        await listen('terminal-output', event => {
            const payload = event.payload;
            
            // Filter: Only allow output from the active session OR a specific job
            const isSession = this.sessionTaskId && payload.taskId === this.sessionTaskId;
            const isJob = this.activeTaskId && payload.taskId === this.activeTaskId;
            
            if (!isSession && !isJob) return;

            switch (payload.stream) {
                case 'stdout':
                    this.lastSessionInterruptAt = 0;
                    if (payload.is_pty) this.ui.write(payload.line);
                    else this.ui.appendLine(payload.line);
                    break;
                case 'stderr':
                    this.lastSessionInterruptAt = 0;
                    if (payload.is_pty) this.ui.write(payload.line);
                    else this.ui.appendLine(payload.line, 'line-err');
                    break;
                case 'exit':
                    const code = payload.code;
                    
                    if (isJob) {
                        this.ui.writeln('\x1b[90m[Job finished]\x1b[0m');
                        this.activeTaskId = null;
                        this.ui.setStatus(this.sessionTaskId ? 'session' : 'idle', this.sessionShell);
                        this.ui.exitPtyMode();
                    } else if (isSession) {
                        if (!this.isRestartingSession) {
                            this.ui.appendLine('Main shell session exited. Recovering...', 'line-warn');
                        }
                        this.sessionTaskId = null;
                        this.lastSessionCwd = null;
                        this.ui.setStatus('running', 'recovering');
                        this.scheduleSessionRecovery();
                        this.isRestartingSession = false;
                    }
                    break;
                case 'error':
                    this.ui.appendLine(payload.line, 'line-err');
                    if (!isSession) {
                        this.ui.setStatus('error');
                    }
                    break;
            }
        });
    }

    async initPersistentSession(shell, cwd) {
        if (this.sessionTaskId) return; // Already running
        
        try {
            if (this.sessionRestartTimer) {
                clearTimeout(this.sessionRestartTimer);
                this.sessionRestartTimer = null;
            }
            this.sessionShell = shell;
            this.sessionTaskId = `session-${Date.now()}`;
            await invoke('spawn_persistent_shell', {
                taskId: this.sessionTaskId,
                shell: shell,
                cwd: cwd
            });

            // Set initial size
            const size = this.ui.getSize();
            await invoke('resize_pty', { taskId: this.sessionTaskId, rows: size.rows, cols: size.cols });

            this.lastSessionCwd = cwd;
            this.ui.setStatus('session', shell);
            
            console.log(`Persistent shell started: ${this.sessionTaskId}`);
        } catch (err) {
            this.ui.appendLine(`Failed to start persistent shell: ${err}`, 'line-err');
            this.sessionTaskId = null;
            this.lastSessionCwd = null;
        }
    }

    scheduleSessionRecovery() {
        if (this.sessionRestartTimer) return;

        const cwd = getCurrentPath() || localStorage.getItem('sovereign_last_path') || appState.state.homeDir || '/';
        this.sessionRestartTimer = setTimeout(async () => {
            this.sessionRestartTimer = null;
            if (this.sessionTaskId) return;
            await this.initPersistentSession(this.sessionShell || this.ui.currentShell, cwd);
        }, 150);
    }

    async restartPersistentSession(shell, cwd) {
        if (this.sessionRestartTimer) {
            clearTimeout(this.sessionRestartTimer);
            this.sessionRestartTimer = null;
        }

        if (!this.sessionTaskId) {
            await this.initPersistentSession(shell, cwd);
            return;
        }

        const existing = this.sessionTaskId;
        this.isRestartingSession = true;
        this.ui.appendLine(`Restarting shell: ${shell}`, 'line-dim');
        try {
            await invoke('kill_command', { taskId: existing });
        } catch (_) {
            // Ignore: process may already be dead.
        } finally {
            this.sessionTaskId = null;
            this.lastSessionCwd = null;
        }

        await this.initPersistentSession(shell, cwd);
    }

    hasPersistentSession() {
        return Boolean(this.sessionTaskId);
    }

    _escapePwshLiteral(value) {
        // Single-quoted PowerShell literals escape quotes as doubled single quotes.
        return String(value).replaceAll("'", "''");
    }

    _escapeCmdPath(value) {
        // Best-effort for cmd.exe: escape embedded quotes.
        return String(value).replaceAll('"', '^"');
    }

    _cdCommand(shell, cwd) {
        const normalizedCwd = String(cwd || '').replace(/\\/g, '/');
        if (!normalizedCwd) return null;

        if (shell === 'cmd') {
            return `cd /d "${this._escapeCmdPath(normalizedCwd)}"`;
        }

        // Default to PowerShell semantics for pwsh/powershell.
        return `Set-Location -LiteralPath '${this._escapePwshLiteral(normalizedCwd)}'`;
    }

    async syncSessionCwd(cwd, shell = this.sessionShell || this.ui.currentShell) {
        if (!this.sessionTaskId || !cwd) return;

        const normalizedCwd = String(cwd).replace(/\\/g, '/');
        if (this.lastSessionCwd === normalizedCwd) return;

        const cdCmd = this._cdCommand(shell, normalizedCwd);
        if (!cdCmd) return;

        this.lastSessionCwd = normalizedCwd;

        try {
            await invoke('send_input', {
                taskId: this.sessionTaskId,
                input: cdCmd + '\r'
            });
        } catch (err) {
            this.ui.appendLine(`Failed to sync shell path: ${err}`, 'line-err');
        }
    }

    async executeCommand(raw, currentShell) {
        // If we have a persistent session, just send the text
        if (this.sessionTaskId) {
            try {
                const cwd = getCurrentPath() || localStorage.getItem('sovereign_last_path') || appState.state.homeDir || '/';
                await this.syncSessionCwd(cwd, currentShell);
                await invoke('send_input', { 
                    taskId: this.sessionTaskId, 
                    input: raw + '\r' // Use \r for PTY input
                });
            } catch (err) {
                this.ui.appendLine(`Failed to send input: ${err}`, 'line-err');
            }
            return;
        }

        // Fallback to legacy "Spawn-Stream-Die" for one-off jobs if session fails
        const cwd = getCurrentPath();
        try {
            this.activeTaskId = `job-${Date.now()}`;
            this.ui.setStatus('running', raw);
            this.ui.enterPtyMode();

            await invoke('spawn_command', {
                taskId: this.activeTaskId,
                shell: currentShell,
                args: raw,
                cwd: cwd
            });
        } catch (err) {
            this.ui.appendLine(`Spawn failed: ${err}`, 'line-err');
            this.ui.exitPtyMode();
            this.activeTaskId = null;
        }
    }

    async killActive() {
        const tid = this.activeTaskId || this.sessionTaskId;
        if (!tid) return;
        
        try {
            // Send Ctrl+C to the session first
            if (this.sessionTaskId && !this.activeTaskId) {
                const now = Date.now();
                if (now - this.lastSessionInterruptAt < 1500) {
                    this.lastSessionInterruptAt = 0;
                    this.ui.appendLine('Hard resetting shell session...', 'line-warn');
                    const cwd = getCurrentPath() || localStorage.getItem('sovereign_last_path') || appState.state.homeDir || '/';
                    await this.restartPersistentSession(this.sessionShell || this.ui.currentShell, cwd);
                    return;
                }

                this.lastSessionInterruptAt = now;
                this.ui.appendLine('Sent Ctrl+C. Press again quickly to restart the shell.', 'line-dim');
                await invoke('send_input', { taskId: this.sessionTaskId, input: '\x03' });
                return;
            }

            await invoke('kill_command', { taskId: tid });
            if (tid === this.sessionTaskId) this.sessionTaskId = null;
            else this.activeTaskId = null;

            this.ui.setStatus('idle');
            this.ui.exitPtyMode();
        } catch (err) {
            this.ui.appendLine(`Kill failed: ${err}`, 'line-err');
        }
    }

    async sendRawData(data) {
        const tid = this.activeTaskId || this.sessionTaskId;
        if (!tid) return;
        try {
            await invoke('send_input', { taskId: tid, input: data });
        } catch (err) {
            console.error("PTY Write Error", err);
        }
    }

    async triggerResize(rows, cols) {
        const tid = this.activeTaskId || this.sessionTaskId;
        if (!tid) return;
        try {
            await invoke('resize_pty', { taskId: tid, rows, cols });
        } catch(e) {
            console.error(e);
        }
    }
}
