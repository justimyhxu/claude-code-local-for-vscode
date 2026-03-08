'use strict';

/**
 * Patch 16: openFile() — open remote files in forceLocal mode.
 *
 * In forceLocal mode, clicking a file link in the webview calls openFile()
 * which tries Uri.file(localPath) + existsSync(). Files are on the remote
 * server, so this silently fails. Fix: add a forceLocal early-return branch
 * that uses getRemoteUri() to open the file via VS Code's remote FS.
 */
module.exports = {
    id: 'patch-16',
    name: 'openFile() remote file open',

    appliedCheck: /forceLocal: openFile/,

    anchor: {
        pattern: /async openFile\(\w+, \w+\) \{/,
        context: /existsSync|Uri\.file|showTextDocument/,
        hint: 'openFile() method in the main class'
    },

    insertAt: {
        searchRange: 3,
        pattern: /async openFile\(\w+, \w+\) \{/,
        relation: 'after'
    },

    detectVars: (ctx) => {
        // Detect the two params of openFile(z, v)
        const fnMatch = ctx.match(/async openFile\((\w+), (\w+)\)/);
        // Detect vscode alias from r.Uri.file or r.window.showTextDocument
        const vscMatch = ctx.match(/(\w+)\.Uri\.file\(/);
        // Detect Range/Position/Selection from new r.Range
        const rangeMatch = ctx.match(/new (\w+)\.Range\(/);
        return {
            pathVar: fnMatch ? fnMatch[1] : 'z',
            locVar: fnMatch ? fnMatch[2] : 'v',
            vscAlias: vscMatch ? vscMatch[1] : 'r'
        };
    },

    generate: (vars) => `        // --- forceLocal: open remote file via VS Code remote FS ---
        if (isForceLocalMode()) {
            try {
                var _rt_of = require("./src/remote-tools");
                var _remoteUri = _rt_of.getRemoteUri(${vars.pathVar});
                ${vars.vscAlias}.window.showTextDocument(_remoteUri).then((U) => {
                    if (${vars.locVar}?.searchText) {
                        let V = U.document,
                            x = V.getText().indexOf(${vars.locVar}.searchText);
                        if (x !== -1) {
                            let O = V.positionAt(x),
                                B = V.positionAt(x + ${vars.locVar}.searchText.length),
                                q = new ${vars.vscAlias}.Range(O, B);
                            U.revealRange(q, ${vars.vscAlias}.TextEditorRevealType.InCenter), U.selection = new ${vars.vscAlias}.Selection(O, B)
                        }
                    } else if (${vars.locVar}) {
                        let V = new ${vars.vscAlias}.Range(new ${vars.vscAlias}.Position((${vars.locVar}.startLine || 1) - 1, 0), new ${vars.vscAlias}.Position((${vars.locVar}.endLine || ${vars.locVar}.startLine || 1) - 1, 0));
                        U.revealRange(V, ${vars.vscAlias}.TextEditorRevealType.InCenter), U.selection = new ${vars.vscAlias}.Selection(V.start, V.end)
                    }
                });
                return;
            } catch (_e_of) {
                (this.output || this.logger).warn("forceLocal: openFile failed for", ${vars.pathVar}, _e_of.message || _e_of);
            }
        }
        // --- end forceLocal openFile ---`
};
