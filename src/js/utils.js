// ═══════════════════════════════════════════════════════════════════════════════
// Sovereign Explorer — Shared Utilities
// Canonical formatting functions. Import from here, never re-implement.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format a byte count into a human-readable string.
 * @param {number} bytes
 * @param {number} decimals - Number of decimal places
 * @returns {string} e.g. "1.2 MB"
 */
export function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '—';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format a millisecond timestamp into a short date string.
 * @param {number} ms - Milliseconds since UNIX epoch
 * @returns {string} e.g. "Apr 20, 2026"
 */
export function formatDate(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
    });
}

/**
 * Format a millisecond timestamp into a 24h time string.
 * @param {number} ms - Milliseconds since UNIX epoch
 * @returns {string} e.g. "14:30"
 */
export function formatTime(ms) {
    if (!ms) return '';
    return new Date(ms).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false
    });
}

/**
 * Format a millisecond timestamp into a full date+time string.
 * @param {number} ms - Milliseconds since UNIX epoch
 * @returns {string} e.g. "Apr 20, 2026, 14:30"
 */
export function formatDateTime(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

/**
 * Debounced Lucide icon hydration.
 * Prevents multiple rapid calls from locking the main thread.
 */
let lucideDebounce = null;
export function hydrateIcons() {
    if (!window.lucide) return;
    clearTimeout(lucideDebounce);
    lucideDebounce = setTimeout(() => {
        window.lucide.createIcons();
    }, 50);
}

/**
 * Display a temporary non-blocking toast message.
 * @param {string} msg 
 * @param {string} type - 'error', 'info', 'success'
 */
export function showToast(msg, type = 'error') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        Object.assign(container.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            zIndex: '9999'
        });
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    Object.assign(toast.style, {
        background: type === 'error' ? 'var(--alert-error, #f44336)' : 'var(--bg-panel, #333)',
        color: '#fff',
        padding: '10px 20px',
        borderRadius: '4px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
        opacity: '0',
        transition: 'opacity 0.3s'
    });
    toast.textContent = msg;
    container.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => toast.style.opacity = '1');
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
