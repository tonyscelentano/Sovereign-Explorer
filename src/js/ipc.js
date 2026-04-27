import { eventHub } from './event-hub.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Sovereign Explorer — IPC Bridge
// Resolves Tauri APIs lazily so frontend modules do not race global injection.
// ═══════════════════════════════════════════════════════════════════════════════

function resolveTauriGlobal() {
    if (typeof window === 'undefined') return null;
    return window.__TAURI__ || window.__TAURI_INTERNALS__ || null;
}

function resolveInvoke() {
    const tauri = resolveTauriGlobal();
    return tauri?.tauri?.invoke || tauri?.core?.invoke || tauri?.invoke || null;
}

function resolveListen() {
    const tauri = resolveTauriGlobal();
    return tauri?.event?.listen || tauri?.listen || null;
}

export function isTauri() {
    return Boolean(resolveInvoke());
}

export function hasInvoke() {
    return Boolean(resolveInvoke());
}

export function hasListen() {
    return Boolean(resolveListen());
}

export function convertFileSrc(path) {
    // Normalize path to prevent double-escaping or mixed slash issues
    const normalizedPath = path.replace(/\\/g, '/');
    const tauri = resolveTauriGlobal();
    // V1 API: tauri.convertFileSrc(path)
    if (tauri?.tauri?.convertFileSrc) return tauri.tauri.convertFileSrc(normalizedPath);
    
    // Tauri V1 format is asset://localhost/<encoded_path>
    const encodedPath = encodeURIComponent(normalizedPath);
    return `asset://localhost/${encodedPath}`;
}

export async function invoke(command, payload) {
    const fn = resolveInvoke();
    if (!fn) throw new Error('Tauri invoke API unavailable');
    return fn(command, payload);
}

export async function listen(eventName, handler) {
    // If we're inside the browser/Tauri, wire to eventHub as primary
    // Or just register the listener as original
    const fn = resolveListen();
    if (!fn) throw new Error('Tauri event API unavailable');
    
    return fn(eventName, (event) => {
        eventHub.emit(eventName, event.payload);
        if (handler) handler(event);
    });
}
