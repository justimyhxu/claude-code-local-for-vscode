'use strict';

/**
 * Patch 03+09: spawnClaude — disable built-in tools, set cwd, add MCP hooks.
 * Also includes CLAUDECODE env deletion.
 *
 * Inserted after the options object closing `};` that contains settingSources.
 * Also patches the env line to delete CLAUDECODE.
 */
module.exports = [
    {
        id: 'patch-03',
        name: 'spawnClaude disallowedTools + cwd + hooks',

        appliedCheck: /forceLocal: CLI will run locally/,

        anchor: {
            pattern: /settingSources:\s*\["user",\s*"project",\s*"local"\]/,
            context: /hooks:\s*\{[\s\S]*?PreToolUse|PostToolUse/,
            hint: 'settingSources in spawnClaude options object'
        },

        insertAt: {
            searchRange: 30,
            // Find the line that assigns env to H (the options object)
            pattern: /\w+\.pathToClaudeCodeExecutable\s*=\s*\w+.*\w+\.executableArgs\s*=\s*\w+.*\w+\.env\s*=/,
            fallbackPattern: /\.pathToClaudeCodeExecutable\s*=\s*\w+/,
            relation: 'before',
            contextRange: 200
        },

        detectVars: (ctx) => {
            // Detect the diagnostics tracker variable (used for captureBaseline)
            const diagMatch = ctx.match(/(\w+)\.captureBaseline\(/);
            // Detect the options object variable name (H in v2.1.71, q in v2.1.42)
            const optsMatch = ctx.match(/let (\w+) = \{\s*\n\s*cwd:/);
            return {
                diagVar: diagMatch ? diagMatch[1] : 'B',
                optsVar: optsMatch ? optsMatch[1] : 'H'
            };
        },

        generate: (vars) => `        // --- forceLocal: disable built-in file tools, use local cwd ---
        if (isForceLocalMode()) {
            ${vars.optsVar}.cwd = getForceLocalCwd();
            ${vars.optsVar}.disallowedTools = [
                "Read", "Write", "Edit", "MultiEdit",
                "Glob", "Grep", "Bash", "NotebookEdit"
            ];
            ${vars.optsVar}.allowedTools = [
                "mcp__claude-vscode__read_file",
                "mcp__claude-vscode__glob",
                "mcp__claude-vscode__grep",
                "mcp__claude-vscode__bash",
                "mcp__claude-vscode__write_file",
                "mcp__claude-vscode__edit_file"
            ];
            // Review mode logic is handled inside the MCP tool handlers themselves
            // (remote-tools.js), so all tools are always auto-approved here.
            // --- forceLocal: add MCP-aware hooks for diagnostics tracking ---
            var _adaptMcpEvent = function(F) {
                var _a = Object.assign({}, F);
                if (_a.tool_name && _a.tool_name.startsWith("mcp__claude-vscode__")) {
                    var _n = _a.tool_name.replace("mcp__claude-vscode__", "");
                    if (_n === "edit_file") _a.tool_name = "Edit";
                    else if (_n === "write_file") _a.tool_name = "Write";
                    else if (_n === "read_file") _a.tool_name = "Read";
                }
                if (_a.tool_input && _a.tool_input.file_path) {
                    try {
                        var _rt = require("./src/remote-tools");
                        var _remUri = _rt.getRemoteUri(_a.tool_input.file_path);
                        _a.tool_input = Object.assign({}, _a.tool_input, { file_path: _remUri.toString(true) });
                    } catch(_e) {}
                }
                return _a;
            };
            ${vars.optsVar}.hooks.PreToolUse.push({
                matcher: "mcp__claude-vscode__edit_file|mcp__claude-vscode__write_file",
                hooks: [(F) => ${vars.diagVar}.captureBaseline(_adaptMcpEvent(F))]
            });
            ${vars.optsVar}.hooks.PreToolUse.push({
                matcher: "mcp__claude-vscode__edit_file|mcp__claude-vscode__write_file|mcp__claude-vscode__read_file",
                hooks: [(F) => this.saveFileIfNeeded(_adaptMcpEvent(F))]
            });
            ${vars.optsVar}.hooks.PostToolUse.push({
                matcher: "mcp__claude-vscode__edit_file|mcp__claude-vscode__write_file",
                hooks: [(F) => ${vars.diagVar}.findDiagnosticsProblems(_adaptMcpEvent(F))]
            });
            this.output.info("forceLocal: CLI will run locally, built-in file tools disabled, MCP hooks added");
            this.output.info(\`forceLocal: cwd=\${${vars.optsVar}.cwd}, disallowedTools=\${${vars.optsVar}.disallowedTools.join(",")}, allowedTools=\${${vars.optsVar}.allowedTools.join(",")}, permissionMode=\${V}, canUseTool=\${!!j}\`);
        } else {
            this.output.info(\`forceLocal: NOT active. forceLocal=\${require("vscode").workspace.getConfiguration("claudeCode").get("forceLocal")}, remoteName=\${require("vscode").env.remoteName}, remoteAuthority=\${require("vscode").env.remoteAuthority}, folderScheme=\${(require("vscode").workspace.workspaceFolders||[])[0]?.uri?.scheme}\`);
        }`
    },
    {
        id: 'patch-03b',
        name: 'delete CLAUDECODE env var',

        appliedCheck: /delete \w+\.env\.CLAUDECODE/,

        anchor: {
            pattern: /pathToClaudeCodeExecutable:\s*\w+/,
            context: /usePythonEnvironment/,
            hint: 'Destructuring of getClaudeBinary() in spawnClaude, near usePythonEnvironment'
        },

        insertAt: {
            searchRange: 200,
            // Find the line that assigns env to H/q (e.g. H.env = Z or q.env = V)
            // Large searchRange because patch-03 inserts ~50 lines above this point
            pattern: /\w+\.pathToClaudeCodeExecutable\s*=\s*\w+.*\w+\.executableArgs\s*=\s*\w+.*\w+\.env\s*=\s*\w+/,
            fallbackPattern: /\.env\s*=\s*\w+/,
            relation: 'after'
        },

        detectVars: (ctx) => {
            // Detect the options variable (H in v2.1.71, q in v2.1.42)
            const optsMatch = ctx.match(/(\w+)\.pathToClaudeCodeExecutable\s*=\s*\w+/);
            return {
                optsVar: optsMatch ? optsMatch[1] : 'H'
            };
        },

        generate: (vars) => `        // Prevent "nested session" detection when another Claude Code instance is running
        delete ${vars.optsVar}.env.CLAUDECODE;`
    }
];
