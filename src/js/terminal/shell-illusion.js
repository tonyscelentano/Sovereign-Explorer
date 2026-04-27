import { navigateTo, getCurrentPath } from '../fs.js';
import { appState } from '../state.js';

function resolvePath(base, target) {
    if (target.match(/^[A-Za-z]:/) || target.startsWith('/')) return target; // Absolute
    const parts = base.replace(/\\/g, '/').split('/').filter(Boolean);
    const targetParts = target.replace(/\\/g, '/').split('/').filter(Boolean);
    
    for (const p of targetParts) {
        if (p === '.') continue;
        if (p === '..') {
            if (parts.length > 1 || (parts.length === 1 && !parts[0].includes(':'))) parts.pop();
        } else {
            parts.push(p);
        }
    }
    
    let res = parts.join('/');
    return (res.length === 2 && res[1] === ':') ? res + '/' : res;
}

export async function handleInterceptor(raw, termUI, hooks = {}) {
    const cmd = raw.trim();
    const hasSession = typeof hooks.hasSession === 'function' ? hooks.hasSession() : false;
    const lower = cmd.toLowerCase();

    if (hasSession && (lower === 'exit' || lower === 'logout')) {
        termUI.appendLine('Persistent terminal session is protected. Use the kill control to restart it instead.', 'line-warn');
        return true;
    }

    if (cmd === 'cd' || cmd === 'cd ~') {
        const home = appState.state.homeDir || localStorage.getItem('sovereign_home_dir') || 'C:/';
        const ok = await navigateTo(home);
        if (ok && typeof hooks.syncSessionCwd === 'function') {
            await hooks.syncSessionCwd(home);
        } else if (!ok) {
            termUI.appendLine(`Path not accessible: ${home}`, 'line-err');
        } else if (!hasSession) {
            termUI.appendLine(home.replace(/\//g, '\\'), 'line-dim');
        }
        return true;
    }
    if (cmd.startsWith('cd ')) {
        const target = cmd.slice(3).trim().replace(/"/g, '');
        const cwd = getCurrentPath() || 'C:/';
        const resolved = resolvePath(cwd, target);
        const ok = await navigateTo(resolved);
        if (ok && typeof hooks.syncSessionCwd === 'function') {
            await hooks.syncSessionCwd(resolved);
        } else if (!ok) {
            termUI.appendLine(`Path not accessible: ${resolved}`, 'line-err');
        }
        return true;
    }

    // pwd → print current explorer path
    if (cmd === 'pwd') {
        termUI.appendLine(getCurrentPath() || '(no directory selected)', 'line-dim');
        return true;
    }

    // clear → wipe terminal
    if (cmd === 'clear' || cmd === 'cls') {
        termUI.clear();
        return true;
    }

    return false;
}
