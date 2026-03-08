'use strict';

/**
 * Patch 05: Lock file yF() — use getForceLocalCwd() for workspace folders.
 * Replaces the workspaceFolders line in yF() with a conditional.
 */
module.exports = {
    id: 'patch-05',
    name: 'yF() lock file path',

    appliedCheck: /isForceLocalMode\(\) \? \[getForceLocalCwd\(\)\]/,

    anchor: {
        // KM()/yF() — lock file creation. Use the unique .lock file pattern
        pattern: /\$\{\w+\}\.lock/,
        context: /transport:\s*"ws"/,
        hint: 'Lock file creation function with ${z}.lock and transport:"ws"'
    },

    insertAt: {
        searchRange: 15,
        // Find the line that maps workspaceFolders to fsPath
        pattern: /\w+ = \w+\.workspace\.workspaceFolders\?\.map\(\(\w+\) => \w+\.uri\.fsPath\)/,
        relation: 'replace',
        replaceLines: 1
    },

    detectVars: (ctx) => {
        // Detect the result variable (K), vscode alias, and callback param
        const match = ctx.match(/(\w+) = (\w+)\.workspace\.workspaceFolders\?\.map\(\((\w+)\) => \3\.uri\.fsPath\)/);
        return {
            resultVar: match ? match[1] : 'K',
            vscAlias: match ? match[2] : 'WJ',
            paramVar: match ? match[3] : 'j'
        };
    },

    generate: (vars) =>
        `        ${vars.resultVar} = isForceLocalMode() ? [getForceLocalCwd()] : ${vars.vscAlias}.workspace.workspaceFolders?.map((${vars.paramVar}) => ${vars.paramVar}.uri.fsPath) || [],`
};
