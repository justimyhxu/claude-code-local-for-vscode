'use strict';

/**
 * Patch 04: Register remote tools on WebSocket MCP server in Ri().
 * Inserted after the last tool definition (executeCode) and before createServer().
 */
module.exports = {
    id: 'patch-04',
    name: 'Ri() WebSocket MCP registration',

    appliedCheck: /forceLocal: remote tools registered on WebSocket MCP server/,

    anchor: {
        pattern: /Execute python code in the Jupyter kernel/,
        hint: 'executeCode tool description in Ri() function'
    },

    insertAt: {
        searchRange: 30,
        // Find the }); that closes the executeCode tool, right before let O = createServer()
        // Use createServer to identify the let chain start, then insert before it
        pattern: /let \w+ = \w+\.createServer\(\)/,
        relation: 'before'
    },

    detectVars: (ctx) => {
        // Detect the MCP server variable name (j in current version)
        const serverMatch = ctx.match(/(\w+)\.tool\("executeCode"/);
        // Detect the zod schema variable (s in current version)
        const zodMatch = ctx.match(/(\w+)\.string\(\)\.describe\(/);
        // Detect the logger variable (V in current version)
        const loggerMatch = ctx.match(/(\w+)\.info\("New WS connection/);
        return {
            serverVar: serverMatch ? serverMatch[1] : 'j',
            zodVar: zodMatch ? zodMatch[1] : 's',
            loggerVar: loggerMatch ? loggerMatch[1] : 'V'
        };
    },

    generate: (vars) => `    // --- forceLocal: register remote file proxy tools ---
    if (isForceLocalMode()) {
        try {
            var _remoteTools = require("./src/remote-tools");
            _remoteTools.registerTools(${vars.serverVar}, ${vars.zodVar}, ${vars.loggerVar});
            ${vars.loggerVar}.info("forceLocal: remote tools registered on WebSocket MCP server. Total tools: " + Object.keys(${vars.serverVar}._registeredTools).length);
        } catch (_rtErr) {
            ${vars.loggerVar}.error("forceLocal: FAILED to register remote tools: " + (_rtErr.message || _rtErr));
        }
    } else {
        ${vars.loggerVar}.info("forceLocal: MCP remote tools NOT registered (forceLocal mode not active)");
    }`
};
