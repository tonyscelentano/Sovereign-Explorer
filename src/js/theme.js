// ═══════════════════════════════════════════════════════════════════════════════
// Sovereign Explorer — Theme Manager
// Handles CSS theme swapping, icon pack resolution, and persistence.
// ═══════════════════════════════════════════════════════════════════════════════

import masterIndexMap from './master_index_map.js';
import { invoke } from './ipc.js';
import { showToast } from './utils.js';

// ─── Lucide Fallback Map ────────────────────────────────────────────────────
const EXT_ICONS = {
    // Documents
    pdf: 'file-text', doc: 'file-text', docx: 'file-text', txt: 'file-text',
    md: 'file-text', rtf: 'file-text', odt: 'file-text',
    // Spreadsheets
    xls: 'table', xlsx: 'table', csv: 'table',
    // Images
    png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
    bmp: 'image', svg: 'image', webp: 'image', ico: 'image',
    // Audio
    mp3: 'music', wav: 'music', flac: 'music', ogg: 'music',
    aac: 'music', m4a: 'music', wma: 'music',
    // Video
    mp4: 'video', mkv: 'video', avi: 'video', mov: 'video', webm: 'video',
    // Code
    js: 'file-code', ts: 'file-code', py: 'file-code', rs: 'file-code',
    html: 'file-code', css: 'file-code', json: 'file-json', toml: 'file-code',
    jsx: 'file-code', tsx: 'file-code', cpp: 'file-code', c: 'file-code',
    java: 'file-code', go: 'file-code', rb: 'file-code', sh: 'file-code',
    ps1: 'file-code', bat: 'file-code', cmd: 'file-code',
    // Archives
    zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
    // Executables
    exe: 'cog', msi: 'cog', dll: 'cog',
    // Drives
    drive: 'hard-drive',
    // Config
    yaml: 'settings', yml: 'settings', ini: 'settings', cfg: 'settings',
    env: 'settings', lock: 'lock',
};

// ─── Icon Semantics ─────────────────────────────────────────────────────────
const EXT_SEMANTICS = {
    // Text & Docs
    txt: 'text-file', md: 'text-file', log: 'text-file', rtf: 'text-file',
    doc: 'document', docx: 'document', pdf: 'document-text',
    // Images
    png: 'image-file', jpg: 'image-file', jpeg: 'image-file', gif: 'image-file', bmp: 'image-file', webp: 'image-file',
    // Config
    ini: 'config-file', yaml: 'config-file', yml: 'config-file', toml: 'config-file', json: 'config-file', cfg: 'config-file',
    // Scripts
    ps1: 'script', bat: 'script', cmd: 'script', sh: 'script',
    // Archives
    zip: 'folder-zip', rar: 'folder-zip', '7z': 'folder-zip', tar: 'folder-zip', gz: 'folder-zip',
    // Drives
    drive: 'drive-hard',
    // Shell links
    lnk: 'shortcut-overlay',
    // Common specials
    exe: 'file-generic', dll: 'file-generic', msi: 'file-generic',
};

const SEMANTIC_TO_INDEX = Object.entries(masterIndexMap).reduce((acc, [idx, semantic]) => {
    acc[semantic] = idx;
    return acc;
}, {});

// ─── Theme Engine ───────────────────────────────────────────────────────────

/** @type {Function|null} Callback fired after a theme change to re-render views */
let onThemeChange = null;

function safeParseObject(key, fallback = {}) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
    } catch (_) {
        localStorage.removeItem(key);
        return fallback;
    }
}

const ThemeManager = {
    current: localStorage.getItem('sovereign_theme') || 'orio',
    availablePacks: ['orio'],
    overrides: safeParseObject('sovereign_icon_overrides', {}),
    themeProfiles: safeParseObject('sovereign_theme_profiles', {}),

    /** Register a callback to fire when the theme swaps (e.g. re-render file list) */
    onSwap(fn) { onThemeChange = fn; },

    async setTheme(name) {
        const requested = String(name || '').trim();
        this.current = this.availablePacks.includes(requested) ? requested : (this.availablePacks[0] || 'orio');
        localStorage.setItem('sovereign_theme', this.current);

        const selector = document.getElementById('theme-selector');
        if (selector) selector.value = this.current;

        this._applyThemeCSS();
    },

    _applyThemeCSS() {
        const cssThemeLink = document.getElementById('theme-css');
        if (!cssThemeLink) {
            if (onThemeChange) onThemeChange();
            return;
        }

        cssThemeLink.onload = () => {
            cssThemeLink.onload = null;
            cssThemeLink.onerror = null;
            if (onThemeChange) onThemeChange();
        };

        cssThemeLink.onerror = () => {
            cssThemeLink.onload = null;
            cssThemeLink.onerror = null;
            console.warn(`Theme CSS not found for '${this.current}', falling back to 'orio'`);
            
            // Apply fallback
            cssThemeLink.onload = () => {
                cssThemeLink.onload = null;
                if (onThemeChange) onThemeChange();
            };
            cssThemeLink.href = 'themes/orio.css';
            showToast(`Theme '${this.current}' failed to load, falling back to default.`, 'error');
        };

        cssThemeLink.href = `themes/${this.current}.css`;
    },

    async init() {
        try {
            const packs = await invoke('list_icon_packs');
            if (Array.isArray(packs) && packs.length > 0) {
                this.availablePacks = packs;
            } else {
                console.warn('[theme] list_icon_packs returned empty or invalid data, using default packs.');
            }
        } catch (err) {
            console.error('[theme] Failed to list icon packs:', err);
            showToast(`Failed to load theme packs: ${err.message || err}`, 'error');
        }

        if (!this.availablePacks.includes(this.current)) {
            this.current = this.availablePacks[0] || 'orio';
        }
        localStorage.setItem('sovereign_theme', this.current);

        const selector = document.getElementById('theme-selector');
        if (selector) {
            this._populateThemeSelector(selector);
            selector.addEventListener('change', (e) => {
                if(e.target.value) this.setTheme(e.target.value);
            });
        }

        this._applyThemeCSS();
    },

    getAvailablePacks() {
        return [...this.availablePacks];
    },

    _populateThemeSelector(selector) {
        if (!selector) return;
        selector.innerHTML = '';
        this.availablePacks.forEach((packName) => {
            const opt = document.createElement('option');
            opt.value = packName;
            opt.textContent = packName;
            selector.appendChild(opt);
        });
        selector.value = this.current;
    },

    saveThemeProfile(themeName, profile) {
        this.themeProfiles[themeName] = profile;
        localStorage.setItem('sovereign_theme_profiles', JSON.stringify(this.themeProfiles));
        if (onThemeChange) onThemeChange();
    },

    clearThemeProfile(themeName) {
        delete this.themeProfiles[themeName];
        localStorage.setItem('sovereign_theme_profiles', JSON.stringify(this.themeProfiles));
        if (onThemeChange) onThemeChange();
    },

    saveOverride(ext, iconFile) {
        this.overrides[ext.toLowerCase()] = iconFile;
        localStorage.setItem('sovereign_icon_overrides', JSON.stringify(this.overrides));
        if (onThemeChange) onThemeChange();
    },

    removeOverride(ext) {
        delete this.overrides[ext.toLowerCase()];
        localStorage.setItem('sovereign_icon_overrides', JSON.stringify(this.overrides));
        if (onThemeChange) onThemeChange();
    },

    /** Resolve the path to a custom icon image for a file entry */
    getCustomIconPath(entry) {
        // 1. Check User Overrides first
        if (entry.extension) {
            const override = this.overrides[entry.extension.toLowerCase()];
            if (override) return `assets/themes/orio/webp_icons/${override}`;
        }

        const pack = this.current;
        const semantic = this._resolveSemanticName(entry);

        // 2. Check Theme Profile (Wizard Aligned)
        const profile = this.themeProfiles[pack];
        if (profile && profile[semantic]) {
            return `assets/themes/IconPacks/${pack}/webp/${profile[semantic]}.webp`;
        }

        // 3. Fallback to Theme Index Map (semantic -> index -> Icon-XYZ.webp)
        const index = SEMANTIC_TO_INDEX[semantic] || SEMANTIC_TO_INDEX['file-generic'] || '2';
        const padded = String(index).padStart(3, '0');

        // ORIO legacy support
        if (pack === 'ORIO') {
            return `assets/themes/IconPacks/ORIO/ico/${semantic}.ico`;
        }

        return `assets/themes/IconPacks/${pack}/webp/Icon-${padded}.webp`;
    },

    _resolveSemanticName(entry) {
        if (entry?.is_dir) return 'folder';
        const ext = String(entry?.extension || '').toLowerCase();
        return EXT_SEMANTICS[ext] || 'file-generic';
    }
};

// ─── Icon Helpers ───────────────────────────────────────────────────────────

export function getLucideIconName(entry) {
    if (entry.is_dir) return 'folder';
    return EXT_ICONS[entry.extension] || 'file';
}

/**
 * Generate an <img> tag that loads the theme's custom icon.
 * On error (icon missing), it swaps itself to a Lucide SVG fallback.
 */
export function generateIconHTML(entry, size = 'sm') {
    const webpPath = ThemeManager.getCustomIconPath(entry);
    const icoPath = webpPath.replace('/webp/', '/ico/').replace('.webp', '.ico');
    const lucideName = getLucideIconName(entry);
    const cls = size === 'lg' ? 'custom-icon custom-icon-lg' : 'custom-icon';
    const lucideCls = size === 'lg' ? 'file-icon file-icon-lg' : 'file-icon';

    // FALLBACK CHAIN: .webp -> .ico -> Lucide
    // We use a data-fallback attribute to track state so we don't infinitely loop
    return `<img src="${webpPath}" class="${cls}" data-ico="${icoPath}"
                 onerror="
                    if (!this.dataset.triedIco) { 
                        this.dataset.triedIco = 'true'; 
                        this.src = this.dataset.ico; 
                    } else { 
                        this.onerror = null; 
                        this.outerHTML = '<i data-lucide=\\'${lucideName}\\' class=\\'${lucideCls}\\'></i>'; 
                        if(window.hydrateIcons) window.hydrateIcons(); 
                    }
                 " loading="lazy">`;
}

export default ThemeManager;
