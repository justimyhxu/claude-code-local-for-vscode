'use strict';

/**
 * Patch 07: FileSystemProvider registration — wrap in try-catch for forceLocal.
 * Two locations: Ti() function and NA6() function.
 */
module.exports = [
    {
        id: 'patch-07a',
        name: 'Ti() FileSystemProvider try-catch',

        appliedCheck: /FileSystemProvider registration failed \(expected in forceLocal\/UI mode\)/,

        anchor: {
            // Pl()/Ti() function — anchor on unique log message
            pattern: /Claude code extension is now active/,
            context: /registerFileSystemProvider/,
            hint: 'Activation function (Pl/Ti) with "Claude code extension is now active" log'
        },

        insertAt: {
            searchRange: 20,
            // Start from the let declaration for the left FSP
            pattern: /let \w+ = new \w+\("_claude_fs_left"\)/,
            relation: 'replace-region',
            // Region ends at the second registerFileSystemProvider + watch function
            regionEnd: /\.subscriptions\.push\(\w+\.workspace\.registerFileSystemProvider\(\w+\.scheme, \w+\)\).*\w+\(\w+\.scheme\)/
        },

        detectVars: (ctx) => {
            const match = ctx.match(/(\w+)\.subscriptions\.push\((\w+)\.workspace\.registerFileSystemProvider\((\w+)\.scheme, \3\)\)/);
            const logMatch = ctx.match(/(\w+)\.warn\("FileSystemProvider/) || ctx.match(/(\w+)\.info\("Claude code extension/);
            const watchMatch = ctx.match(/subscriptions\.push\((\w+)\(\w+\.scheme\)\)/);
            // Detect the FSP variable names
            const fspLeftMatch = ctx.match(/let (\w+) = new (\w+)\("_claude_fs_left"\)/);
            const fspRightMatch = ctx.match(/let (\w+) = new (\w+)\("_claude_fs_right"\)/);
            return {
                ctxVar: match ? match[1] : 'z',
                vscAlias: match ? match[2] : 's9',
                logVar: logMatch ? logMatch[1] : 'v',
                watchFn: watchMatch ? watchMatch[1] : 'MI6',
                fspLeft: fspLeftMatch ? fspLeftMatch[1] : 'U',
                fspRight: fspRightMatch ? fspRightMatch[1] : 'V',
                fspClass: fspLeftMatch ? fspLeftMatch[2] : 'EH'
            };
        },

        generate: (vars) => `    let ${vars.fspLeft} = new ${vars.fspClass}("_claude_fs_left");
    let ${vars.fspRight} = new ${vars.fspClass}("_claude_fs_right");
    if (isForceLocalMode()) {
        try {
            ${vars.ctxVar}.subscriptions.push(${vars.vscAlias}.workspace.registerFileSystemProvider(${vars.fspLeft}.scheme, ${vars.fspLeft}));
            ${vars.ctxVar}.subscriptions.push(${vars.vscAlias}.workspace.registerFileSystemProvider(${vars.fspRight}.scheme, ${vars.fspRight})), ${vars.ctxVar}.subscriptions.push(${vars.watchFn}(${vars.fspRight}.scheme));
        } catch (fsErr) {
            ${vars.logVar}.warn("FileSystemProvider registration failed (expected in forceLocal/UI mode):", fsErr.message || fsErr);
        }
    } else {
        ${vars.ctxVar}.subscriptions.push(${vars.vscAlias}.workspace.registerFileSystemProvider(${vars.fspLeft}.scheme, ${vars.fspLeft}));
        ${vars.ctxVar}.subscriptions.push(${vars.vscAlias}.workspace.registerFileSystemProvider(${vars.fspRight}.scheme, ${vars.fspRight})), ${vars.ctxVar}.subscriptions.push(${vars.watchFn}(${vars.fspRight}.scheme));
    }`
    },
    {
        id: 'patch-07b',
        name: 'NA6() FileSystemProvider try-catch',

        appliedCheck: /registerTextDocumentContentProvider[\s\S]{1,500}FileSystemProvider registration failed/,

        anchor: {
            pattern: /_claude_vscode_fs_readonly/,
            context: /registerFileSystemProvider/,
            hint: 'NA6() readonly FileSystemProvider near _claude_vscode_fs_readonly'
        },

        insertAt: {
            searchRange: 20,
            // Start from the let declaration for the left FSP
            pattern: /let [\w$]+ = new \w+\("_claude_vscode_fs_left"\)/,
            relation: 'replace-region',
            // Region ends at registerTextDocumentContentProvider + watch function
            regionEnd: /\.subscriptions\.push\(\w+\.workspace\.registerTextDocumentContentProvider\(\w+\.scheme, \w+\)\).*\w+\(\w+\.scheme\)/
        },

        detectVars: (ctx) => {
            const vscMatch = ctx.match(/(\w+)\.commands\.executeCommand\("setContext",\s*"claude-vscode\.updateSupported"/) ||
                             ctx.match(/(\w+)\.window\.createOutputChannel/);
            const ctxMatch = ctx.match(/(\w+)\.subscriptions\.push\(\w+\.workspace\.registerFileSystemProvider/);
            const logMatch = ctx.match(/(\w+)\.warn\("FileSystemProvider/) || ctx.match(/(\w+)\.info\("Starting/);
            const watchMatch = ctx.match(/registerTextDocumentContentProvider[\s\S]*?subscriptions\.push\((\w+)\(\w+\.scheme\)\)/);
            // Detect FSP variable names and class names
            const fspLeftMatch = ctx.match(/let (\w+) = new (\w+)\("_claude_vscode_fs_left"\)/);
            const fspRightMatch = ctx.match(/let (\w+) = new (\w+)\("_claude_vscode_fs_right"\)/);
            const readonlyMatch = ctx.match(/let (\w+) = new (\w+)\("_claude_vscode_fs_readonly"\)/);
            return {
                vscAlias: vscMatch ? vscMatch[1] : 'H6',
                ctxVar: ctxMatch ? ctxMatch[1] : 'z',
                logVar: logMatch ? logMatch[1] : 'v',
                watchFn: watchMatch ? watchMatch[1] : 'EI6',
                fspLeft: fspLeftMatch ? fspLeftMatch[1] : 'K',
                fspLeftClass: fspLeftMatch ? fspLeftMatch[2] : 'RH',
                fspRight: fspRightMatch ? fspRightMatch[1] : 'U',
                fspRightClass: fspRightMatch ? fspRightMatch[2] : 'RH',
                fspReadonly: readonlyMatch ? readonlyMatch[1] : 'V',
                fspReadonlyClass: readonlyMatch ? readonlyMatch[2] : 'oA'
            };
        },

        generate: (vars) => `    let ${vars.fspLeft} = new ${vars.fspLeftClass}("_claude_vscode_fs_left");
    let ${vars.fspRight} = new ${vars.fspRightClass}("_claude_vscode_fs_right");
    let ${vars.fspReadonly} = new ${vars.fspReadonlyClass}("_claude_vscode_fs_readonly");
    if (isForceLocalMode()) {
        try {
            ${vars.ctxVar}.subscriptions.push(${vars.vscAlias}.workspace.registerFileSystemProvider(${vars.fspLeft}.scheme, ${vars.fspLeft}));
            ${vars.ctxVar}.subscriptions.push(${vars.vscAlias}.workspace.registerFileSystemProvider(${vars.fspRight}.scheme, ${vars.fspRight}));
            ${vars.ctxVar}.subscriptions.push(${vars.vscAlias}.workspace.registerTextDocumentContentProvider(${vars.fspReadonly}.scheme, ${vars.fspReadonly})), ${vars.ctxVar}.subscriptions.push(${vars.watchFn}(${vars.fspRight}.scheme));
        } catch (fsErr) {
            ${vars.logVar}.warn("FileSystemProvider registration failed (expected in forceLocal/UI mode):", fsErr.message || fsErr);
        }
    } else {
        ${vars.ctxVar}.subscriptions.push(${vars.vscAlias}.workspace.registerFileSystemProvider(${vars.fspLeft}.scheme, ${vars.fspLeft}));
        ${vars.ctxVar}.subscriptions.push(${vars.vscAlias}.workspace.registerFileSystemProvider(${vars.fspRight}.scheme, ${vars.fspRight}));
        ${vars.ctxVar}.subscriptions.push(${vars.vscAlias}.workspace.registerTextDocumentContentProvider(${vars.fspReadonly}.scheme, ${vars.fspReadonly})), ${vars.ctxVar}.subscriptions.push(${vars.watchFn}(${vars.fspRight}.scheme));
    }`
    }
];
