'use strict';

/**
 * Patch registry — defines execution order for all patches.
 * Some patch files export arrays (multiple sub-patches); we flatten them here.
 */

function flatten(patches) {
    const result = [];
    for (const p of patches) {
        if (Array.isArray(p)) {
            result.push(...flatten(p));
        } else {
            result.push(p);
        }
    }
    return result;
}

// Import all patch modules
const patch01 = require('./patch-01-helpers');
const patch03 = require('./patch-03-spawn');
const patch04 = require('./patch-04-ri-mcp');
const patch05 = require('./patch-05-lockfile');
const patch06 = require('./patch-06-cwd');
const patch07 = require('./patch-07-fsp');
const patch08 = require('./patch-08-inprocess');
const patch10a = require('./patch-10a-transform');
const patch11 = require('./patch-11-diff');
const patch13 = require('./patch-13-terminal');
const patch14 = require('./patch-14-extkind');
const patch15 = require('./patch-15-badge');
const patch16 = require('./patch-16-openfile');

// Execution order matters:
// 1. Helpers first (other patches depend on isForceLocalMode/getForceLocalCwd)
// 2. Core spawn patches
// 3. Lock file, cwd patches
// 4. MCP registration (WebSocket + in-process)
// 5. UI patches (transform, diff, terminal)
// 6. Activation patches (FSP, extensionKind, badge)
const allPatches = flatten([
    patch01,    // helpers (isForceLocalMode + getForceLocalCwd)
    patch03,    // spawnClaude + CLAUDECODE env
    patch04,    // Ri() WebSocket MCP
    patch05,    // yF() lock file
    patch06,    // webview/panel cwd (2 locations)
    patch08,    // launchClaude in-process MCP + _reviewEdit
    patch10a,   // io_message transform (2 parts)
    patch11,    // RY()/Ac() diff remote read (3 parts)
    patch13,    // UA6() terminal node-pty
    patch16,    // openFile() remote file open
    patch07,    // FileSystemProvider try-catch (2 locations)
    patch14,    // extensionKind switching
    patch15,    // webview badge (3 parts)
]);

module.exports = { allPatches, flatten };
