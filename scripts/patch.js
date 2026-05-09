const fs = require('fs');
const path = require('path');

const componentsDir = path.join(__dirname, 'src', 'js', 'components');
const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
    const p = path.join(componentsDir, file);
    let code = fs.readFileSync(p, 'utf-8');

    if (!code.includes('connectedCallback() {')) return;
    if (code.includes('disconnectedCallback() {')) return; 

    // 1. Inject AbortController
    if (!code.includes('this._ac = new AbortController();')) {
        code = code.replace(/connectedCallback\(\) \{/, 'connectedCallback() {\n        this._ac = new AbortController();');
    }

    // Find customElements.define
    const defineMatch = code.match(/customElements\.define\(/);
    if (defineMatch) {
        // Find the last '}' before customElements.define
        const beforeDefine = code.substring(0, defineMatch.index);
        const lastBraceIdx = beforeDefine.lastIndexOf('}');
        if (lastBraceIdx !== -1) {
            const disconnected = `\n    disconnectedCallback() {\n        if (this._ac) {\n            this._ac.abort();\n            this._ac = null;\n        }\n    }\n`;
            code = code.substring(0, lastBraceIdx) + disconnected + code.substring(lastBraceIdx);
        }
    } else {
        // fallback if customElements.define is not in the file
        const lastBraceIdx = code.lastIndexOf('}');
        if (lastBraceIdx !== -1) {
            const disconnected = `\n    disconnectedCallback() {\n        if (this._ac) {\n            this._ac.abort();\n            this._ac = null;\n        }\n    }\n`;
            code = code.substring(0, lastBraceIdx) + disconnected + code.substring(lastBraceIdx);
        }
    }

    let out = '';
    let i = 0;
    while (i < code.length) {
        let match = code.substring(i).match(/(window|document)\.addEventListener\(/);
        if (match && match.index !== undefined) {
            let startIdx = i + match.index;
            out += code.substring(i, startIdx + match[0].length);
            i = startIdx + match[0].length;
            
            let depth = 1;
            let argEnd = i;
            while (depth > 0 && argEnd < code.length) {
                if (code[argEnd] === '(') depth++;
                if (code[argEnd] === ')') depth--;
                argEnd++;
            }
            
            let argsContent = code.substring(i, argEnd - 1);
            
            let commas = 0;
            let d = 0;
            for (let c = 0; c < argsContent.length; c++) {
                if (argsContent[c] === '(' || argsContent[c] === '{' || argsContent[c] === '[') d++;
                if (argsContent[c] === ')' || argsContent[c] === '}' || argsContent[c] === ']') d--;
                if (argsContent[c] === ',' && d === 0) commas++;
            }
            
            if (argsContent.includes('signal: this._ac?.signal')) {
                out += argsContent;
            } else if (commas >= 2) {
                out += argsContent;
            } else {
                out += argsContent + ', { signal: this._ac?.signal }';
            }
            out += ')';
            i = argEnd;
        } else {
            out += code.substring(i);
            break;
        }
    }
    code = out;
    fs.writeFileSync(p, code);
    console.log('Patched ' + file);
});
