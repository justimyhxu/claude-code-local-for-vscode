'use strict';

/**
 * Patch 14: Dynamic extensionKind switching in NA6().
 * Inserted after the updateSupported context key command.
 */
module.exports = {
    id: 'patch-14',
    name: 'extensionKind dynamic switching',

    appliedCheck: /_syncExtensionKind/,

    anchor: {
        pattern: /claude-vscode\.updateSupported/,
        context: /createOutputChannel.*Claude VSCode/,
        hint: 'NA6() function with "claude-vscode.updateSupported" context key'
    },

    insertAt: {
        searchRange: 5,
        pattern: /\w+\.commands\.executeCommand\("setContext",\s*"claude-vscode\.updateSupported",\s*!1\)/,
        relation: 'after'
    },

    detectVars: (ctx) => {
        // Detect vscode alias (L6 in current)
        const vscMatch = ctx.match(/(\w+)\.commands\.executeCommand\("setContext",\s*"claude-vscode\.updateSupported"/);
        // Detect extension context var (v in current)
        const ctxMatch = ctx.match(/(\w+)\.subscriptions\.push\(\w+\)/);
        // Detect logger var (z in current)
        const logMatch = ctx.match(/let (\w+) = \w+\.window\.createOutputChannel\("Claude VSCode"/);
        return {
            vscAlias: vscMatch ? vscMatch[1] : 'L6',
            ctxVar: ctxMatch ? ctxMatch[1] : 'v',
            logVar: logMatch ? logMatch[1] : 'z'
        };
    },

    generate: (vars) => `    // --- forceLocal: dynamic extensionKind switching ---
    // Rules:
    //   Local workspace (no remote) → always ["ui","workspace"], forceLocal is irrelevant
    //   Remote + forceLocal ON  → ["ui","workspace"]  (run locally, proxy to remote)
    //   Remote + forceLocal OFF → ["workspace","ui"]   (run on remote, like official)
    // Since extensionKind is a static manifest property, we modify package.json and prompt reload.
    (function _syncExtensionKind() {
        var _vsc = ${vars.vscAlias};
        var _fs = require("fs");
        var _path = require("path");
        var _cfg = _vsc.workspace.getConfiguration("claudeCode");
        var _forceLocal = _cfg.get("forceLocal", false);
        var _pkgPath = _path.join(${vars.ctxVar}.extensionPath, "package.json");
        // Detect if we are in a remote environment
        function _isRemoteEnv() {
            if (_vsc.env.remoteAuthority) return true;
            if (_vsc.env.remoteName) return true;
            if (_cfg.get("sshHost", "")) return true;
            var _folders = _vsc.workspace.workspaceFolders;
            if (_folders && _folders.length > 0 && _folders[0].uri.scheme !== "file") return true;
            return false;
        }
        function _computeDesired(forceLocal, isRemote) {
            // Only use ["workspace","ui"] when remote AND forceLocal OFF
            if (isRemote && !forceLocal) return ["workspace", "ui"];
            return ["ui", "workspace"];
        }
        var _isRemote = _isRemoteEnv();
        var _desiredArr = _computeDesired(_forceLocal, _isRemote);
        var _desired = JSON.stringify(_desiredArr);
        try {
            var _pkg = JSON.parse(_fs.readFileSync(_pkgPath, "utf8"));
            var _current = JSON.stringify(_pkg.extensionKind || []);
            if (_current !== _desired) {
                _pkg.extensionKind = _desiredArr;
                _fs.writeFileSync(_pkgPath, JSON.stringify(_pkg, null, 2) + "\\n", "utf8");
                ${vars.logVar}.info("forceLocal: extensionKind updated to " + _desired + " (was " + _current + ", isRemote=" + _isRemote + "). Reload needed.");
                _vsc.window.showInformationMessage(
                    "Claude Code Local: extensionKind switched to " +
                    (_desiredArr[0] === "ui" ? "local (ui)" : "remote (workspace)") +
                    " mode. Please reload the window for the change to take effect.",
                    "Reload"
                ).then(function(choice) {
                    if (choice === "Reload") _vsc.commands.executeCommand("workbench.action.reloadWindow");
                });
            }
        } catch (_e) {
            ${vars.logVar}.warn("forceLocal: failed to sync extensionKind:", _e.message || _e);
        }
        // Also watch for forceLocal setting changes at runtime (debounced to avoid flip-flop)
        var _syncTimer = null;
        var _lastForceLocal = _forceLocal;
        ${vars.ctxVar}.subscriptions.push(_vsc.workspace.onDidChangeConfiguration(function($) {
            if (!$.affectsConfiguration("claudeCode.forceLocal")) return;
            if (_syncTimer) clearTimeout(_syncTimer);
            _syncTimer = setTimeout(function() {
                _syncTimer = null;
                var _newForceLocal = _vsc.workspace.getConfiguration("claudeCode").get("forceLocal", false);
                if (_newForceLocal === _lastForceLocal) return;
                _lastForceLocal = _newForceLocal;
                var _rem = _isRemoteEnv();
                var _desArr = _computeDesired(_newForceLocal, _rem);
                var _desStr = JSON.stringify(_desArr);
                try {
                    var _pkg2 = JSON.parse(_fs.readFileSync(_pkgPath, "utf8"));
                    var _cur2 = JSON.stringify(_pkg2.extensionKind || []);
                    if (_cur2 !== _desStr) {
                        _pkg2.extensionKind = _desArr;
                        _fs.writeFileSync(_pkgPath, JSON.stringify(_pkg2, null, 2) + "\\n", "utf8");
                        ${vars.logVar}.info("forceLocal: setting changed, extensionKind updated to " + _desStr + " (isRemote=" + _rem + "). Prompting reload.");
                        _vsc.window.showInformationMessage(
                            "Claude Code Local: Force Local mode " + (_newForceLocal ? "enabled" : "disabled") +
                            ". Reload required to switch extension to " +
                            (_desArr[0] === "ui" ? "local (ui)" : "remote (workspace)") + " mode.",
                            "Reload Now"
                        ).then(function(choice) {
                            if (choice === "Reload Now") _vsc.commands.executeCommand("workbench.action.reloadWindow");
                        });
                    }
                } catch (_e2) {
                    ${vars.logVar}.warn("forceLocal: failed to update extensionKind on setting change:", _e2.message || _e2);
                }
            }, 500);
        }));
    })();`
};
