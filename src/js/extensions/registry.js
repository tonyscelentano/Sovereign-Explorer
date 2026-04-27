// ═══════════════════════════════════════════════════════════════════════════════
// Sovereign Explorer — Extension Registry
// Central hub for registering and managing "Plug-and-Play" plugins.
// ═══════════════════════════════════════════════════════════════════════════════

class ExtensionRegistry {
    constructor() {
        this.extensions = new Map();
        this.activeInstances = new Map();
        this._enabledStates = this._loadStates();
    }

    _loadStates() {
        try {
            const saved = localStorage.getItem('sov_extension_states');
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    }

    _saveStates() {
        localStorage.setItem('sov_extension_states', JSON.stringify(this._enabledStates));
    }

    /**
     * Register a new plugin definition
     */
    register(def) {
        if (!def.id) throw new Error("Extension must have a unique ID");
        this.extensions.set(def.id, def);
        
        // Initialize state if not present
        if (this._enabledStates[def.id] === undefined) {
            this._enabledStates[def.id] = def.autoActivate !== false;
            this._saveStates();
        }

        console.log(`[Extensions] Registered: ${def.name} (${def.id}) [Enabled: ${this._enabledStates[def.id]}]`);
        window.dispatchEvent(new CustomEvent('sov:extension-registered', { detail: def }));
    }

    isEnabled(id) {
        return !!this._enabledStates[id];
    }

    async toggle(id, targetHost) {
        if (this.isEnabled(id)) {
            await this.deactivate(id);
            this._enabledStates[id] = false;
        } else {
            this._enabledStates[id] = true;
            if (targetHost) await this.activate(id, targetHost);
        }
        this._saveStates();
        window.dispatchEvent(new CustomEvent('sov:extension-toggled', { detail: { id, enabled: this._enabledStates[id] } }));
    }

    get(id) {
        return this.extensions.get(id);
    }

    getAll() {
        return Array.from(this.extensions.values());
    }

    async activate(id, targetElement) {
        const def = this.get(id);
        if (!def || !this.isEnabled(id)) return;
        if (this.activeInstances.has(id)) return;

        try {
            const instance = await def.mount(targetElement);
            this.activeInstances.set(id, { instance, container: targetElement });
            console.log(`[Extensions] Activated: ${id}`);
        } catch (err) {
            console.error(`[Extensions] Activation failed for ${id}:`, err);
        }
    }

    async deactivate(id) {
        const entry = this.activeInstances.get(id);
        if (!entry) return;

        const { instance, container } = entry;
        const def = this.get(id);

        try {
            if (def && typeof def.unmount === 'function') {
                await def.unmount(instance);
            }
            if (container && container.parentNode) {
                container.parentNode.removeChild(container);
            }
            this.activeInstances.delete(id);
            console.log(`[Extensions] Deactivated: ${id}`);
        } catch (err) {
            console.error(`[Extensions] Deactivation failed for ${id}:`, err);
        }
    }
}

const registry = new ExtensionRegistry();
export default registry;
