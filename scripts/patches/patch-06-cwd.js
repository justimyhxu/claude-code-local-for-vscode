'use strict';

/**
 * Patch 06: Webview/panel cwd resolution.
 * Two locations: resolveWebviewView() and setupPanel().
 * Replaces RF.realpathSync(...) with conditional getForceLocalCwd().
 */
module.exports = [
    {
        id: 'patch-06a',
        name: 'resolveWebviewView cwd',

        // Check for first occurrence (both patches use same pattern)
        appliedCheck: /isForceLocalMode\(\) \? getForceLocalCwd\(\) : \w+\.realpathSync/,

        anchor: {
            pattern: /resolveWebviewView\(\w+, \w+, \w+\) \{/,
            hint: 'resolveWebviewView method'
        },

        insertAt: {
            searchRange: 20,
            pattern: /\w+ = \w+\.realpathSync\(\w+\[0\] \|\| \w+\.homedir\(\)\)\.normalize\("NFC"\)/,
            relation: 'replace',
            replaceLines: 1
        },

        detectVars: (ctx) => {
            const match = ctx.match(/(\w+) = (\w+)\.realpathSync\((\w+)\[0\] \|\| (\w+)\.homedir\(\)\)\.normalize\("NFC"\)/);
            return {
                resultVar: match ? match[1] : 'K',
                fsAlias: match ? match[2] : 'RF',
                arrVar: match ? match[3] : 'N',
                osAlias: match ? match[4] : 'bF'
            };
        },

        generate: (vars) =>
            `            ${vars.resultVar} = isForceLocalMode() ? getForceLocalCwd() : ${vars.fsAlias}.realpathSync(${vars.arrVar}[0] || ${vars.osAlias}.homedir()).normalize("NFC"),`
    },
    {
        id: 'patch-06b',
        name: 'setupPanel cwd',

        // Use same check — both locations have realpathSync in unpatched code
        appliedCheck: /setupPanel[\s\S]{1,500}isForceLocalMode\(\) \? getForceLocalCwd\(\)/,

        anchor: {
            // setupPanel method definition (not call site) — has realpathSync inside
            pattern: /^\s+setupPanel\(\w+, \w+, \w+.*\) \{/,
            context: /realpathSync/,
            hint: 'setupPanel method definition with realpathSync inside'
        },

        insertAt: {
            searchRange: 20,
            pattern: /\w+ = \w+\.realpathSync\(\w+\[0\] \|\| \w+\.homedir\(\)\)\.normalize\("NFC"\)/,
            relation: 'replace',
            replaceLines: 1
        },

        detectVars: (ctx) => {
            const match = ctx.match(/(\w+) = (\w+)\.realpathSync\((\w+)\[0\] \|\| (\w+)\.homedir\(\)\)\.normalize\("NFC"\)/);
            return {
                resultVar: match ? match[1] : 'K',
                fsAlias: match ? match[2] : 'RF',
                arrVar: match ? match[3] : 'N',
                osAlias: match ? match[4] : 'bF'
            };
        },

        generate: (vars) =>
            `            ${vars.resultVar} = isForceLocalMode() ? getForceLocalCwd() : ${vars.fsAlias}.realpathSync(${vars.arrVar}[0] || ${vars.osAlias}.homedir()).normalize("NFC"),`
    }
];
