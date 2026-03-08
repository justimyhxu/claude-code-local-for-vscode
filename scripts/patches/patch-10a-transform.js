'use strict';

/**
 * Patch 10A: Transform MCP tool names to built-in names for webview rendering.
 * Two parts:
 *  1. Insert the _transformForWebview function before the for-await loop
 *  2. Replace the loop body to use _transformForWebview
 */

const patch10aFunc = {
    id: 'patch-10a',
    name: 'io_message MCP→builtin name transform',

    appliedCheck: /_transformForWebview/,

    anchor: {
        // The for-await loop that sends io_messages in launchClaude
        pattern: /for await \(let \w+ of \w+\) this\.send\(\{/,
        context: /io_message/,
        hint: 'for-await loop in launchClaude that sends io_messages'
    },

    insertAt: {
        searchRange: 5,
        pattern: /for await \(let \w+ of \w+\) this\.send\(\{/,
        relation: 'before'
    },

    detectVars: (ctx) => {
        const forMatch = ctx.match(/for await \(let (\w+) of (\w+)\)/);
        const chMatch = ctx.match(/channelId:\s*(\w+)/);
        return {
            iterVar: forMatch ? forMatch[1] : 'D',
            queryVar: forMatch ? forMatch[2] : 'J',
            channelVar: chMatch ? chMatch[1] : 'v'
        };
    },

    generate: (vars) => `                // --- forceLocal: transform MCP tool names to built-in names for webview rendering ---
                var _mcpToBuiltinName = {
                    "mcp__claude-vscode__read_file": "Read",
                    "mcp__claude-vscode__write_file": "Write",
                    "mcp__claude-vscode__edit_file": "Edit",
                    "mcp__claude-vscode__glob": "Glob",
                    "mcp__claude-vscode__grep": "Grep",
                    "mcp__claude-vscode__bash": "Bash"
                };
                var _transformForWebview = function(${vars.iterVar}) {
                    if (!isForceLocalMode()) return ${vars.iterVar};
                    // Primary path: transform assistant messages with tool_use content blocks
                    if (${vars.iterVar}.type === "assistant" && ${vars.iterVar}.message && Array.isArray(${vars.iterVar}.message.content)) {
                        var _changed = false;
                        var _newContent = ${vars.iterVar}.message.content.map(function(c) {
                            if (c.type === "tool_use" && c.name && _mcpToBuiltinName[c.name]) {
                                _changed = true;
                                var _transformed = Object.assign({}, c, { name: _mcpToBuiltinName[c.name] });
                                if (_transformed.input && _transformed.input.file_path) {
                                    try {
                                        var _rt_xf = require("./src/remote-tools");
                                        _transformed.input = Object.assign({}, _transformed.input, {
                                            file_path: _rt_xf.toRemotePath(_transformed.input.file_path)
                                        });
                                    } catch (_) {}
                                }
                                return _transformed;
                            }
                            return c;
                        });
                        if (_changed) return Object.assign({}, ${vars.iterVar}, { message: Object.assign({}, ${vars.iterVar}.message, { content: _newContent }) });
                    }
                    return ${vars.iterVar};
                };`
};

const patch10aLoop = {
    id: 'patch-10a-loop',
    name: 'io_message loop body transform',

    appliedCheck: /var _D = _transformForWebview/,

    anchor: {
        // The for-await line that sends io_messages (may be single-line or multi-line)
        pattern: /for await \(let \w+ of \w+\) this\.send\(\{/,
        context: /io_message/,
        hint: 'for-await loop sending io_messages'
    },

    insertAt: {
        searchRange: 5,
        pattern: /for await \(let \w+ of \w+\) this\.send\(\{/,
        relation: 'replace',
        replaceLines: 6  // replace the for-await + this.send block
    },

    detectVars: (ctx) => {
        const forMatch = ctx.match(/for await \(let (\w+) of (\w+)\)/);
        const chMatch = ctx.match(/channelId:\s*(\w+)/);
        // Detect post-processor function (jP in v2.1.71, sb in v2.1.42)
        const postMatch = ctx.match(/\), (\w+)\(\w+\);/);
        return {
            iterVar: forMatch ? forMatch[1] : 'G',
            queryVar: forMatch ? forMatch[2] : 'q',
            channelVar: chMatch ? chMatch[1] : 'z',
            postFn: postMatch ? postMatch[1] : 'jP'
        };
    },

    generate: (vars) => `                    for await (let ${vars.iterVar} of ${vars.queryVar}) {
                        var _${vars.iterVar} = _transformForWebview(${vars.iterVar});
                        this.send({
                            type: "io_message",
                            channelId: ${vars.channelVar},
                            message: _${vars.iterVar},
                            done: !1
                        });
                        ${vars.postFn}(_${vars.iterVar});
                    }`
};

module.exports = [patch10aFunc, patch10aLoop];
