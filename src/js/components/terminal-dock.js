export class SovereignTerminalDock extends HTMLElement {
    constructor() {
        super();
        this.term = null;
        this.fitAddon = null;
        this.initialized = false;
        
        this.onKeyboardInput = null;
        this.onPtyData = null;
        this.onResize = null;
        this.onKill = null;
        this.onShellChange = null;

        this.currentShell = localStorage.getItem('sovereign_shell') || 'pwsh';
    }

    connectedCallback() {
        this._ac = new AbortController();
        this.render();
        this._bindRefs();
        this._bindEvents();
        this.initTerminal();
        this._bindStyleHotReload();
    }

    render() {
        this.innerHTML = `
            <div class="terminal-header">
                <select id="shell-selector" class="shell-select" title="Shell">
                    <option value="pwsh">PWSH</option>
                    <option value="powershell">PowerShell</option>
                    <option value="cmd">CMD</option>
                </select>
                <span id="terminal-status" class="term-status status-idle" title="Idle">●</span>
                <div class="terminal-header-spacer"></div>
                <button id="btn-kill" class="term-kill-btn" title="Kill Process (Ctrl+C)" style="display:none;">
                    <i data-lucide="x-circle"></i>
                </button>
            </div>
            <div id="terminal-output"></div>
            <div id="terminal-fallback-log" class="terminal-fallback-log" hidden></div>
            <div class="terminal-input-row">
                <span class="prompt">❯</span>
                <input type="text" id="terminal-input" autocomplete="off" spellcheck="false" placeholder="Execute command…">
            </div>
        `;
        
        if (window.hydrateIcons) window.hydrateIcons();
    }

    _bindRefs() {
        this.terminalInput  = this.querySelector('#terminal-input');
        this.terminalOutput = this.querySelector('#terminal-output');
        this.fallbackLog    = this.querySelector('#terminal-fallback-log');
        this.terminalStatus = this.querySelector('#terminal-status');
        this.killBtn        = this.querySelector('#btn-kill');
        this.inputRow       = this.querySelector('.terminal-input-row');
        this.shellSelector  = this.querySelector('#shell-selector');
        
        if (this.shellSelector) this.shellSelector.value = this.currentShell;
    }

    _bindEvents() {
        if (this.shellSelector) {
            this.shellSelector.addEventListener('change', (e) => {
                this.currentShell = e.target.value;
                localStorage.setItem('sovereign_shell', this.currentShell);
                this.appendLine(`Shell: ${this.currentShell}`, 'line-dim');
                if (this.onShellChange) this.onShellChange(this.currentShell);
            });
        }
        if (this.killBtn) {
            this.killBtn.addEventListener('click', () => {
                if (this.onKill) this.onKill();
            });
        }
        if (this.terminalInput) {
            this.terminalInput.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'c') {
                    e.preventDefault();
                    if (this.onKill) this.onKill();
                    return;
                }
                if (this.onKeyboardInput) this.onKeyboardInput(e);
            });
        }
    }

    initTerminal() {
        this.setStatus('idle');
        if (this.killBtn) this.killBtn.style.display = 'none';

        if (this.terminalOutput && !this.initialized) {
            try {
                const theme = this._readTerminalThemeFromCSS();

                this.term = new window.Terminal({
                    fontFamily: theme.fontFamily,
                    fontSize: theme.fontSize,
                    fontWeight: theme.fontWeight,
                    theme: { background: theme.background, foreground: theme.foreground, cursor: '#4ade80' },
                    cursorBlink: true,
                    cursorStyle: 'bar',
                    scrollback: 5000,
                    allowTransparency: false,
                });

                const FitAddon = window.FitAddon?.FitAddon || window.FitAddon;
                if (!FitAddon) throw new Error("xterm-addon-fit not found");

                this.fitAddon = new FitAddon();
                this.term.loadAddon(this.fitAddon);
                this.term.open(this.terminalOutput);
                this.fitAddon.fit();
                this.initialized = true;

                this.term.onData(data => {
                    if (this.onPtyData) this.onPtyData(data);
                });

                let lastCols = 0, lastRows = 0;
                const ro = new ResizeObserver(() => {
                    try {
                        if (this.fitAddon && this.terminalOutput.clientWidth > 0) {
                            this.fitAddon.fit();
                            if (this.term && this.term.cols && this.term.rows && this.onResize) {
                                if (this.term.cols !== lastCols || this.term.rows !== lastRows) {
                                    lastCols = this.term.cols;
                                    lastRows = this.term.rows;
                                    this.onResize(this.term.rows, this.term.cols);
                                }
                            }
                        }
                    } catch (e) { /* ignore fit errors when hidden */ }
                });
                ro.observe(this);

            } catch (err) {
                console.error("xterm.js init failed", err);
                this.appendLine(`⚠ Terminal Error: ${err.message}`, 'line-err');
            }
        }
    }

    _readTerminalThemeFromCSS() {
        const cs = getComputedStyle(document.documentElement);

        const background = cs.getPropertyValue('--f-terminal-bg').trim() || '#0a0a0a';
        const foreground = cs.getPropertyValue('--f-terminal-color').trim() || '#e2e8f0';
        const fontFamily = cs.getPropertyValue('--f-terminal').trim() || '"JetBrains Mono", monospace';

        const weightRaw = cs.getPropertyValue('--f-terminal-weight').trim();
        const fontWeight = weightRaw ? Number.parseInt(weightRaw, 10) : 400;

        const sizeRaw = cs.getPropertyValue('--f-terminal-size').trim();
        const fontSize = sizeRaw ? Number.parseInt(sizeRaw, 10) : 13;

        return {
            background,
            foreground,
            fontFamily,
            fontSize: Number.isFinite(fontSize) ? fontSize : 13,
            fontWeight: Number.isFinite(fontWeight) ? fontWeight : 400,
        };
    }

    applyThemeFromCSS() {
        if (!this.term) return;
        const theme = this._readTerminalThemeFromCSS();
        const nextTheme = { background: theme.background, foreground: theme.foreground, cursor: '#4ade80' };

        if (typeof this.term.setOption === 'function') {
            this.term.setOption('theme', nextTheme);
            this.term.setOption('fontFamily', theme.fontFamily);
            this.term.setOption('fontSize', theme.fontSize);
            this.term.setOption('fontWeight', theme.fontWeight);
        } else if (this.term.options && typeof this.term.options === 'object') {
            // xterm API compatibility: newer builds expose mutable options object.
            this.term.options.theme = nextTheme;
            this.term.options.fontFamily = theme.fontFamily;
            this.term.options.fontSize = theme.fontSize;
            this.term.options.fontWeight = theme.fontWeight;
        }

        try { this.fitAddon?.fit(); } catch (_) {}
    }

    _bindStyleHotReload() {
        if (this._styleListenerBound) return;
        this._styleListenerBound = true;
        window.addEventListener('sov:terminal-style-changed', () => this.applyThemeFromCSS(), { signal: this._ac?.signal });
    }

    appendLine(text, cls = '') {
        if (!this.term) {
            this._appendFallbackLine(text, cls);
            return;
        }
        let colorCode = '';
        if (cls === 'line-err') colorCode = '\x1b[31m';
        else if (cls === 'line-warn') colorCode = '\x1b[33m';
        else if (cls === 'line-ok') colorCode = '\x1b[32m';
        else if (cls === 'line-dim') colorCode = '\x1b[90m';
        else if (cls === 'line-cmd') colorCode = '\x1b[37m';
        
        this.term.writeln(`${colorCode}${text}\x1b[0m`);
    }

    write(text) {
        if (this.term) this.term.write(text);
        else this._appendFallbackLine(text, 'line-dim', false);
    }

    writeln(text) {
        if (this.term) this.term.writeln(text);
        else this._appendFallbackLine(text, 'line-dim');
    }

    clear() {
        if (this.term) this.term.clear();
        if (this.fallbackLog) this.fallbackLog.innerHTML = '';
    }
    
    getSize() {
        if (!this.term) return { cols: 80, rows: 24 };
        return { cols: this.term.cols, rows: this.term.rows };
    }

    setStatus(state, msg = '') {
        if (!this.terminalStatus) return;
        this.terminalStatus.className = 'term-status';
        if (state === 'session') {
            this.terminalStatus.classList.add('status-running');
            this.terminalStatus.title = msg || 'Shell session';
            this.terminalStatus.textContent = '●';
            if (this.killBtn) this.killBtn.style.display = 'inline-block';
        } else if (state === 'running') {
            this.terminalStatus.classList.add('status-running');
            this.terminalStatus.title = msg || 'Running';
            this.terminalStatus.textContent = msg ? `● ${msg}` : '●';
            if (this.killBtn) this.killBtn.style.display = 'inline-block';
        } else if (state === 'error') {
            this.terminalStatus.classList.add('status-error');
            this.terminalStatus.title = 'Error';
            this.terminalStatus.textContent = '●';
        } else {
            this.terminalStatus.classList.add('status-idle');
            this.terminalStatus.title = 'Idle';
            this.terminalStatus.textContent = '●';
            if (this.killBtn) this.killBtn.style.display = 'none';
        }
    }

    enterPtyMode() {
        if (this.inputRow) this.inputRow.style.display = 'none';
        if (this.term) this.term.focus();
    }

    exitPtyMode() {
        if (this.inputRow) this.inputRow.style.display = 'flex';
        if (this.terminalInput) {
            this.terminalInput.value = '';
            this.terminalInput.focus();
        }
    }
    
    getInputValue() { return this.terminalInput ? this.terminalInput.value : ''; }
    setInputValue(val) { if (this.terminalInput) this.terminalInput.value = val; }

    _appendFallbackLine(text, cls = '', newline = true) {
        if (!this.fallbackLog) {
            console.log(`[terminal] ${text}`);
            return;
        }

        this.fallbackLog.hidden = false;

        const line = document.createElement('div');
        line.className = `terminal-fallback-line${cls ? ` ${cls}` : ''}`;
        line.textContent = newline ? String(text) : String(text).replace(/\r?\n$/, '');
        this.fallbackLog.appendChild(line);
        this.fallbackLog.scrollTop = this.fallbackLog.scrollHeight;
    }

    disconnectedCallback() {
        if (this._ac) {
            this._ac.abort();
            this._ac = null;
        }
    }
}

customElements.define('sovereign-terminal-dock', SovereignTerminalDock);
