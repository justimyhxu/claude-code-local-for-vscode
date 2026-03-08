'use strict';

/**
 * Patch 01: isForceLocalMode() + getForceLocalCwd() helper functions.
 * Inserted before the Ri() function definition (WebSocket MCP server setup).
 */
module.exports = {
    id: 'patch-01',
    name: 'isForceLocalMode + getForceLocalCwd helpers',

    appliedCheck: /function isForceLocalMode\(\)/,

    anchor: {
        // The openDiff tool registration inside the WebSocket MCP server function
        pattern: /\.tool\("openDiff", "Open a git diff/,
        hint: 'openDiff tool registration in Ml()/Ri() WebSocket MCP server function'
    },

    insertAt: {
        searchRange: 10,
        // Find the function definition line before the openDiff tool
        pattern: /^function \w+\(\w+, \w+, \w+, \w+, \w+, \w+, \w+\) \{/,
        relation: 'before'
    },

    detectVars: () => ({}),

    generate: () => `
// --- forceLocal mode helper ---
function isForceLocalMode() {
    const _vsc = require("vscode");
    const _cfg = _vsc.workspace.getConfiguration("claudeCode");
    const forceLocal = _cfg.get("forceLocal", false);
    if (!forceLocal) return false;
    // Accept if sshHost is explicitly set, or remoteAuthority/remoteName is present
    const sshHost = _cfg.get("sshHost", "");
    if (sshHost) return true;
    if (_vsc.env.remoteAuthority) return true;
    if (_vsc.env.remoteName) return true;
    // Also check if workspace folders have remote URIs
    const folders = _vsc.workspace.workspaceFolders;
    if (folders && folders.length > 0 && folders[0].uri.scheme !== "file") return true;
    return false;
}

/**
 * In forceLocal mode, create a dedicated local directory as cwd.
 * This avoids accessing remote paths locally and keeps session isolation.
 * Returns the local cwd path (guaranteed to exist).
 */
function getForceLocalCwd() {
    const _vsc = require("vscode");
    const _os = require("os");
    const _path = require("path");
    const _fs = require("fs");

    const folders = _vsc.workspace.workspaceFolders;
    const remotePath = folders && folders.length > 0 ? folders[0].uri.path : "default";
    const host = (() => {
        const cfg = _vsc.workspace.getConfiguration("claudeCode");
        const override = cfg.get("sshHost", "");
        if (override) return override;
        const authority = _vsc.env.remoteAuthority || "";
        const m = authority.match(/^ssh-remote\\+(.+)$/);
        return m ? m[1] : "unknown";
    })();

    // ~/.claude/remote/<host>/<encoded-remote-path>/
    const safeRemotePath = remotePath.replace(/\\//g, "-").replace(/^-/, "");
    const localCwd = _path.join(_os.homedir(), ".claude", "remote", host, safeRemotePath);
    _fs.mkdirSync(localCwd, { recursive: true, mode: 0o755 });
    return localCwd;
}
`
};
