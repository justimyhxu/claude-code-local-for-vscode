'use strict';

/**
 * Patch 08: Register remote tools on in-process MCP server in launchClaude().
 * Includes _reviewEdit callback for review mode.
 * Inserted after AS() server creation and before getAdditionalMcpServers().
 */
module.exports = {
    id: 'patch-08',
    name: 'launchClaude in-process MCP + _reviewEdit',

    appliedCheck: /forceLocal: registered remote tools on in-process MCP server/,

    anchor: {
        // getAdditionalMcpServers() call in launchClaude — right after MCP server creation
        pattern: /\w+ = this\.getAdditionalMcpServers\(\)/,
        context: /file_updated|onExperimentGatesUpdated/,
        hint: 'getAdditionalMcpServers() call in launchClaude, after WP()/AS() MCP server creation'
    },

    insertAt: {
        searchRange: 5,
        // Find the }),  line (end of WP() call) that precedes getAdditionalMcpServers
        // Replace it + the getAdditionalMcpServers line to break the let chain
        pattern: /\}\),\s*$/,
        relation: 'replace',
        replaceLines: 2
    },

    detectVars: (ctx) => {
        // Detect the MCP server variable (x in v2.1.71, j in v2.1.42)
        const serverMatch = ctx.match(/(\w+) = \w+\(\(\w+\) => \{\s*\n\s*this\.onExperimentGatesUpdated/);
        // Detect channelId variable (z in v2.1.71, v in v2.1.42)
        const channelMatch = ctx.match(/channelId:\s*(\w+)/);
        // Detect markdown plan check function (ev in v2.1.71, Dz in v2.1.42)
        const mdCheckMatch = ctx.match(/if \((\w+)\(\w+\)\)[\s\S]*?openMarkdownPreview/);
        // Detect permission mode param (U in v2.1.71, N in v2.1.42)
        // It's passed to spawnClaude as the 6th arg
        const permMatch = ctx.match(/spawnClaude\(\w+, \w+, [\s\S]*?, \w+, (\w+),/);
        // Detect the getAdditionalMcpServers result var (O in v2.1.71)
        const addMcpMatch = ctx.match(/([\w$]+) = this\.getAdditionalMcpServers\(\)/);
        return {
            serverVar: serverMatch ? serverMatch[1] : 'x',
            channelVar: channelMatch ? channelMatch[1] : 'z',
            mdCheckFn: mdCheckMatch ? mdCheckMatch[1] : 'ev',
            permVar: permMatch ? permMatch[1] : 'U',
            addMcpVar: addMcpMatch ? addMcpMatch[1] : 'O'
        };
    },

    generate: (vars) => `                });
            // --- forceLocal: register remote file proxy tools on in-process MCP server ---
            if (isForceLocalMode()) {
                try {
                    var _remoteTools2 = require("./src/remote-tools");
                    var _fileUpdatedCb = (D, A, w) => {
                        if (${vars.mdCheckFn}(D)) return;
                        this.send({
                            type: "file_updated",
                            channelId: ${vars.channelVar},
                            filePath: D,
                            oldContent: A,
                            newContent: w
                        });
                    };
                    // --- forceLocal: _reviewEdit callback for review mode ---
                    // Sends tool_permission_request to webview, which triggers dialog + open_diff.
                    // RY() handles the diff tab natively (blocks until Accept/Reject).
                    // User modifications stored via setEditOverride() in RY(), consumed here.
                    var _selfIJ = this;
                    var _forceLocalAcceptAll = false;
                    // Track runtime permission mode (permVar = initial mode from launch_claude)
                    var _forceLocalPermMode = ${vars.permVar} || _selfIJ.settings.getInitialPermissionMode() || "default";
                    var _origSetPermissionMode = _selfIJ.setPermissionMode.bind(_selfIJ);
                    _selfIJ.setPermissionMode = async function(_v, _z) {
                        if (_v === ${vars.channelVar}) _forceLocalPermMode = _z;
                        return _origSetPermissionMode(_v, _z);
                    };
                    var _reviewEdit = async function(mcpToolName, toolInput, oldContent, newContent) {
                        var vsc = require("vscode");
                        var config = vsc.workspace.getConfiguration("claudeCode");
                        var diffMode = config.get("forceLocalDiffMode", "auto");
                        if (diffMode !== "review") return { accepted: true, finalContent: newContent };

                        // Bypass review if permission mode is "bypassPermissions" or "acceptEdits"
                        if (_forceLocalPermMode === "bypassPermissions" || _forceLocalPermMode === "acceptEdits") return { accepted: true, finalContent: newContent };
                        // Bypass review if user chose "allow all edits this session" (button 2)
                        if (_forceLocalAcceptAll) return { accepted: true, finalContent: newContent };

                        var _rt = require("./src/remote-tools");
                        var remotePath = _rt.toRemotePath(toolInput.file_path);

                        // Send tool_permission_request — triggers webview dialog AND open_diff → RY().
                        // RY() handles the diff tab natively (blocks until Accept/Reject).
                        var webviewToolName = mcpToolName === "edit_file" ? "Edit" : "Write";
                        var webviewInputs = Object.assign({}, toolInput, { file_path: remotePath });

                        try {
                            var response = await _selfIJ.sendRequest(${vars.channelVar}, {
                                type: "tool_permission_request",
                                toolName: webviewToolName,
                                inputs: webviewInputs,
                                suggestions: [{ type: "setMode", mode: "acceptEdits", destination: "session" }]
                            }, null);

                            var accepted = response.result.behavior === "allow";

                            if (accepted) {
                                // Check if user chose "allow all edits this session"
                                var perms = response.result.updatedPermissions;
                                if (perms && perms.length > 0) {
                                    for (var _p = 0; _p < perms.length; _p++) {
                                        if (perms[_p].type === "setMode" && perms[_p].mode === "acceptEdits") {
                                            _forceLocalAcceptAll = true;
                                            break;
                                        }
                                    }
                                }
                                // RY() stores user-modified content via setEditOverride() on Accept.
                                // Consume it here; falls back to original newContent if no override.
                                var override = _rt.consumeEditOverride(remotePath);
                                var finalContent = override !== null ? override : newContent;
                                return { accepted: true, finalContent: finalContent };
                            } else {
                                return { accepted: false };
                            }
                        } catch (e) {
                            (_selfIJ.output || _selfIJ.logger).warn("forceLocal: reviewEdit error", e.message || e);
                            return { accepted: false };
                        }
                    };
                    // 'e' is the module-level zod schema (var e = {}; ... string: () => ...).
                    // Same variable used by Patch 04 (Ri/Ml WebSocket MCP). Not a local
                    // launchClaude var — it's the bundled zod library object.
                    _remoteTools2.registerTools(${vars.serverVar}.instance, e, this.output || this.logger, _fileUpdatedCb, _reviewEdit);
                    (this.output || this.logger).info("forceLocal: registered remote tools on in-process MCP server. Tools: " + Object.keys(${vars.serverVar}.instance._registeredTools).length);
                } catch (_rtErr2) {
                    (this.output || this.logger).error("forceLocal: FAILED to register remote tools on in-process MCP server: " + (_rtErr2.message || _rtErr2));
                }
            }
            let ${vars.addMcpVar} = this.getAdditionalMcpServers(),`
};
