const fs = require('fs');
const path = require('path');

const componentsDir = path.join(__dirname, 'src', 'js', 'components');
const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.js'));

function patchFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Check if disconnectedCallback already exists
    if (content.includes('disconnectedCallback()')) {
        console.log(`Skipping ${filePath} (already has disconnectedCallback)`);
        return;
    }

    // Check if it's a Custom Element (has connectedCallback)
    if (!content.includes('connectedCallback() {')) {
        console.log(`Skipping ${filePath} (no connectedCallback)`);
        return;
    }

    // Replace window.addEventListener and document.addEventListener
    // but we only want to do this inside connectedCallback or other methods, 
    // maybe it's easier to just use a global AbortController for the component.

    let modified = false;

    // 1. Inject this._abortController = new AbortController(); at the start of connectedCallback
    content = content.replace(/connectedCallback\(\)\s*\{/, "connectedCallback() {\n        this._abortController = new AbortController();");

    // 2. Add { signal: this._abortController.signal } to window.addEventListener and document.addEventListener
    // This regex matches `window.addEventListener('event', handler)` or `document.addEventListener('event', handler)`
    // and injects the signal object. Note: it might have options already, but usually it doesn't in this codebase.
    content = content.replace(/(window|document)\.addEventListener\(([^,]+),\s*([^()]+(\([^()]*\))?\s*=>\s*\{[^}]*\}|[^,)]+)\)/g, (match, p1, p2, p3) => {
        // Wait, regex for the second argument is very tricky if it spans multiple lines.
        return match; 
    });

}

files.forEach(f => {
    patchFile(path.join(componentsDir, f));
});
