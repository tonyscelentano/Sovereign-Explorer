// ═══════════════════════════════════════════════════════════════════════════════
// Sovereign Explorer — Snap-Grid Layout Manager
// Foobar2000-style pane resizing and modularity persistence.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── State ──────────────────────────────────────────────────────────────────
let isDragging = false;
let currentSplitter = null;
let startX = 0;
let startY = 0;
let initialSize = 0;
let initialized = false;

// Dimensions constraints
const MIN_SIDEBAR_W = 150;
const MAX_SIDEBAR_W = 600;
const MIN_SCRYING_W = 200;
const MAX_SCRYING_W = 800;
const MIN_TERMINAL_H = 100;
const MAX_TERMINAL_H = 600;

function readStoredPixels(key, min, max, fallback) {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
        localStorage.removeItem(key);
        return fallback;
    }

    return Math.min(max, Math.max(min, parsed));
}

function endResizeSession() {
    if (!isDragging) return;

    isDragging = false;
    document.body.classList.remove('is-resizing', 'resize-col', 'resize-row');

    if (currentSplitter === 'sidebar') {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) localStorage.setItem('sov_sidebar_w', sidebar.offsetWidth);
    } else if (currentSplitter === 'terminal') {
        const dock = document.getElementById('terminal-dock');
        if (dock) localStorage.setItem('sov_terminal_h', dock.offsetHeight);
    } else if (currentSplitter === 'scrying') {
        const scrying = document.getElementById('scrying-panel');
        if (scrying) localStorage.setItem('sov_scrying_w', scrying.offsetWidth);
    }

    currentSplitter = null;
}

export function initLayout() {
    if (initialized) return;
    initialized = true;

    // Recover from any stale resize state left behind by a lost mouseup.
    document.body.classList.remove('is-resizing', 'resize-col', 'resize-row');

    // 1. Hydrate UI variables from localStorage
    const savedSidebar = readStoredPixels('sov_sidebar_w', MIN_SIDEBAR_W, MAX_SIDEBAR_W, 220);
    document.documentElement.style.setProperty('--sidebar-w', `${savedSidebar}px`);

    const savedTerminal = readStoredPixels('sov_terminal_h', MIN_TERMINAL_H, MAX_TERMINAL_H, 200);
    document.documentElement.style.setProperty('--terminal-h', `${savedTerminal}px`);

    const savedScrying = readStoredPixels('sov_scrying_w', MIN_SCRYING_W, MAX_SCRYING_W, 260);
    document.documentElement.style.setProperty('--scrying-w', `${savedScrying}px`);

    // 2. Bind DOM elements
    const splitSidebar = document.getElementById('split-sidebar');
    const splitTerminal = document.getElementById('split-terminal');
    const splitScrying = document.getElementById('split-scrying');

    // 3. Attach Mousedown Hooks
    if (splitSidebar) {
        splitSidebar.addEventListener('mousedown', (e) => {
            isDragging = true;
            currentSplitter = 'sidebar';
            startX = e.clientX;
            const sidebar = document.getElementById('sidebar');
            initialSize = sidebar ? sidebar.offsetWidth : 220;
            document.body.classList.add('is-resizing', 'resize-col');
        });
        splitSidebar.addEventListener('dblclick', () => {
            document.documentElement.style.setProperty('--sidebar-w', '220px');
            localStorage.setItem('sov_sidebar_w', 220);
        });
    }

    if (splitTerminal) {
        splitTerminal.addEventListener('mousedown', (e) => {
            isDragging = true;
            currentSplitter = 'terminal';
            startY = e.clientY;
            const dock = document.getElementById('terminal-dock');
            initialSize = dock ? dock.offsetHeight : 200;
            document.body.classList.add('is-resizing', 'resize-row');
        });
        splitTerminal.addEventListener('dblclick', () => {
            document.documentElement.style.setProperty('--terminal-h', '200px');
            localStorage.setItem('sov_terminal_h', 200);
        });
    }

    if (splitScrying) {
        splitScrying.addEventListener('mousedown', (e) => {
            isDragging = true;
            currentSplitter = 'scrying';
            startX = e.clientX;
            const scrying = document.getElementById('scrying-panel');
            initialSize = scrying ? scrying.offsetWidth : 260; // default from css
            document.body.classList.add('is-resizing', 'resize-col');
        });
        splitScrying.addEventListener('dblclick', () => {
            document.documentElement.style.setProperty('--scrying-w', '260px');
            localStorage.setItem('sov_scrying_w', 260);
        });
    }

    // 4. Global Mouse Move / Up
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onMouseUp);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) onMouseUp();
    });
}

function onMouseMove(e) {
    if (!isDragging) return;
    
    // Prevent default selection while dragging
    e.preventDefault(); 

    if (currentSplitter === 'sidebar') {
        const delta = e.clientX - startX;
        let newWidth = initialSize + delta;
        
        if (newWidth < MIN_SIDEBAR_W) newWidth = MIN_SIDEBAR_W;
        if (newWidth > MAX_SIDEBAR_W) newWidth = MAX_SIDEBAR_W;
        
        document.documentElement.style.setProperty('--sidebar-w', newWidth + 'px');
    } 
    else if (currentSplitter === 'terminal') {
        // Delta is inverted because dock is at bottom, dragging UP increases size
        const delta = startY - e.clientY;
        let newHeight = initialSize + delta;

        if (newHeight < MIN_TERMINAL_H) newHeight = MIN_TERMINAL_H;
        if (newHeight > MAX_TERMINAL_H) newHeight = MAX_TERMINAL_H;

        document.documentElement.style.setProperty('--terminal-h', newHeight + 'px');
    }
    else if (currentSplitter === 'scrying') {
        // Delta is inverted because panel is on right
        const delta = startX - e.clientX;
        let newWidth = initialSize + delta;
        
        if (newWidth < MIN_SCRYING_W) newWidth = MIN_SCRYING_W;
        if (newWidth > MAX_SCRYING_W) newWidth = MAX_SCRYING_W;
        
        document.documentElement.style.setProperty('--scrying-w', newWidth + 'px');
    }
}

function onMouseUp() {
    endResizeSession();
}
