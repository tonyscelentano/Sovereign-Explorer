// ═══════════════════════════════════════════════════════════════════════════════
// Sovereign Explorer — UI View Manager
// Compatibility layer now that workspace UI is pane-local.
// ═══════════════════════════════════════════════════════════════════════════════

import './components/sovereign-workspace-pane.js';
import { getActivePaneId, getPane } from './panes/store.js';

export function initViewControls() {
    // Workspace panes own their local view controls now.
}

export function setNavigator() {
    // Legacy no-op: navigation is pane-local through sovereign-workspace-pane.
}

export function renderFileView() {
    // Legacy no-op preserved for external callers.
}

export function rerender() {
    document.querySelectorAll('sovereign-workspace-pane').forEach((pane) => {
        pane.rerender?.();
    });
}

export function getView() {
    return getPane(getActivePaneId()).viewMode;
}

export function initContextMenu() {
    // Context menu logic lives inside the component now.
}
