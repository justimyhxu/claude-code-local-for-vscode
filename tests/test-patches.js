#!/usr/bin/env node
'use strict';

/**
 * Comprehensive test suite for the Claude Code VS Code extension patches.
 *
 * Tests:
 *   1. Patch framework (patcher.js) unit tests
 *   2. Each patch's detectVars against real v2.1.71 extension.js
 *   3. Generated code validity (syntax check via Function constructor)
 *   4. Patched extension.js structural checks (correct variable references)
 *   5. Zod variable correctness (the bug we fixed)
 *   6. remote-tools.js registerTools interface check
 *   7. Full pipeline dry-run (all 20 patches apply without failure)
 *
 * Usage: node tests/test-patches.js
 */

const fs = require('fs');
const path = require('path');

// ─── Test harness ────────────────────────────────────────────────────────────

let _passed = 0, _failed = 0, _skipped = 0;
const _failures = [];

function pass(name) {
    _passed++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
}

function fail(name, reason) {
    _failed++;
    _failures.push({ name, reason });
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}`);
    if (reason) console.log(`        → ${reason}`);
}

function skip(name, reason) {
    _skipped++;
    console.log(`  \x1b[33mSKIP\x1b[0m  ${name} (${reason})`);
}

function assert(name, condition, reason) {
    if (condition) pass(name);
    else fail(name, reason || 'assertion failed');
}

function section(title) {
    console.log(`\n\x1b[1m═══ ${title} ═══\x1b[0m`);
}

// ─── Paths ───────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const PATCHED_EXT = path.join(ROOT, 'extension.js');
const REMOTE_TOOLS = path.join(ROOT, 'src', 'remote-tools.js');
const PATCHER = path.join(ROOT, 'scripts', 'lib', 'patcher.js');
const PATCHES_INDEX = path.join(ROOT, 'scripts', 'patches', 'index.js');

// ─── 1. Patcher unit tests ──────────────────────────────────────────────────

function testPatcherUnit() {
    section('1. Patcher Unit Tests');

    const { findLineNumber, findClosingBrace, getContext } = require(PATCHER);

    const sample = [
        'function foo() {',     // 0
        '    if (x) {',         // 1
        '        return 1;',    // 2
        '    }',                // 3
        '    return 0;',        // 4
        '}',                    // 5
        'function bar() {',     // 6
    ];

    // findLineNumber
    assert('findLineNumber: finds pattern',
        findLineNumber(sample, /function foo/) === 0);
    assert('findLineNumber: respects startLine',
        findLineNumber(sample, /function/, 1) === 6);
    assert('findLineNumber: returns -1 when not found',
        findLineNumber(sample, /nonexistent/) === -1);

    // findClosingBrace
    assert('findClosingBrace: finds matching brace for foo()',
        findClosingBrace(sample, 0) === 5);
    assert('findClosingBrace: finds matching brace for if()',
        findClosingBrace(sample, 1) === 3);

    // getContext
    const ctx = getContext(sample, 2, 3);
    assert('getContext: includes lines within range',
        ctx.includes('if (x)') && ctx.includes('return 0'));
    assert('getContext: clamps to bounds',
        getContext(sample, 0, 100).split('\n').length === sample.length);
}

// ─── 2. detectVars against real extension.js ─────────────────────────────────

function testDetectVars() {
    section('2. detectVars on v2.1.71 extension.js');

    if (!fs.existsSync(PATCHED_EXT)) {
        skip('detectVars tests', 'extension.js not found');
        return;
    }

    const { allPatches } = require(PATCHES_INDEX);
    const { getContext, findLineNumber } = require(PATCHER);
    const code = fs.readFileSync(PATCHED_EXT, 'utf8');
    const lines = code.split('\n');

    // We need the UNPATCHED file for anchor detection.
    // Since the patched file has appliedCheck markers, detectVars runs on the
    // context around the anchor. We test detectVars for each patch that has one.
    for (const p of allPatches) {
        if (!p.detectVars) continue;

        // Find anchor in the (already-patched) file — it should still exist
        let anchorLine = -1;
        const ctxRange = p.anchor?.contextRange || 15;
        if (p.anchor?.context) {
            let searchFrom = 0;
            while (true) {
                const matchLine = findLineNumber(lines, p.anchor.pattern, searchFrom);
                if (matchLine === -1) break;
                const ctx = getContext(lines, matchLine, ctxRange);
                if (p.anchor.context.test(ctx)) {
                    anchorLine = matchLine;
                    break;
                }
                searchFrom = matchLine + 1;
            }
        } else if (p.anchor) {
            anchorLine = findLineNumber(lines, p.anchor.pattern);
        }

        if (anchorLine === -1) {
            skip(`detectVars [${p.id}]`, 'anchor not found in patched file');
            continue;
        }

        const ctx = getContext(lines, anchorLine, p.insertAt?.contextRange || 100);
        const vars = p.detectVars(ctx);

        // Basic sanity: all vars should be non-empty strings
        let allValid = true;
        const problems = [];
        for (const [key, val] of Object.entries(vars)) {
            if (typeof val !== 'string' || val.length === 0) {
                allValid = false;
                problems.push(`${key}=${JSON.stringify(val)}`);
            }
        }

        if (allValid) {
            pass(`detectVars [${p.id}]: ${JSON.stringify(vars)}`);
        } else {
            fail(`detectVars [${p.id}]: invalid vars: ${problems.join(', ')}`,
                `Full vars: ${JSON.stringify(vars)}`);
        }
    }
}

// ─── 3. Generated code syntax check ─────────────────────────────────────────

function testGenerateSyntax() {
    section('3. Generated Code Syntax');

    const { allPatches } = require(PATCHES_INDEX);

    for (const p of allPatches) {
        if (!p.generate) continue;

        // Use default vars (the fallback values)
        const defaultVars = p.detectVars ? p.detectVars('') : {};
        const generated = p.generate(defaultVars);

        // Wrap in a function to check syntax.
        // Some patches generate CODE FRAGMENTS (e.g., replacement patches that
        // include closing braces from the original or start mid-expression).
        // These are intentionally not standalone — skip syntax check for them.
        const isFragment = /relation.*replace/.test(JSON.stringify(p.insertAt || {}));
        // Also skip HTML/CSS patches (patch-15a/b/c generate CSS/HTML, not JS)
        const isHtml = generated.includes('<style') || generated.includes('</') ||
                       generated.includes('.force-local-badge') || p.id.startsWith('patch-15');

        if (isFragment || isHtml) {
            pass(`syntax [${p.id}]: fragment/template (syntax check N/A)`);
            continue;
        }

        try {
            const vm = require('vm');
            vm.createScript(`(async function() {\n${generated}\n})`, {
                filename: `${p.id}-generated.js`
            });
            pass(`syntax [${p.id}]: valid JavaScript`);
        } catch (e) {
            fail(`syntax [${p.id}]: ${e.message}`);
        }
    }
}

// ─── 4. Patched extension.js structural checks ──────────────────────────────

function testPatchedStructure() {
    section('4. Patched extension.js Structure');

    if (!fs.existsSync(PATCHED_EXT)) {
        skip('patched structure tests', 'extension.js not found');
        return;
    }

    const code = fs.readFileSync(PATCHED_EXT, 'utf8');

    // All patches should have their appliedCheck markers present
    const { allPatches } = require(PATCHES_INDEX);
    for (const p of allPatches) {
        if (!p.appliedCheck) continue;
        // patch-10a-loop's appliedCheck uses a specific var name that depends on
        // the detected iterVar. The regex /var _D = _transformForWebview/ only matches
        // if iterVar=D. In v2.1.71 iterVar=G → "var _G = _transformForWebview".
        // Check for the generic pattern instead.
        if (p.id === 'patch-10a-loop') {
            assert(`applied marker [${p.id}]`,
                /var _\w+ = _transformForWebview/.test(code),
                'Expected "var _X = _transformForWebview" pattern');
        } else {
            assert(`applied marker [${p.id}]`,
                p.appliedCheck.test(code),
                `Marker not found: ${p.appliedCheck}`);
        }
    }

    // Core helpers must exist
    assert('isForceLocalMode() defined',
        code.includes('function isForceLocalMode()'));
    assert('getForceLocalCwd() defined',
        code.includes('function getForceLocalCwd()'));

    // No orphan references to removed features
    assert('no node-proxy references',
        !code.includes('require("./src/node-proxy")'));
}

// ─── 5. Zod variable correctness (THE BUG FIX) ──────────────────────────────

function testZodVariable() {
    section('5. Zod Variable Correctness (Critical Fix)');

    if (!fs.existsSync(PATCHED_EXT)) {
        skip('zod tests', 'extension.js not found');
        return;
    }

    const code = fs.readFileSync(PATCHED_EXT, 'utf8');
    const lines = code.split('\n');

    // Find module-level zod: var e = {}; followed by string: () => ...
    const zodDefLine = lines.findIndex(l => /^var e = \{\};$/.test(l.trim()));
    assert('module-level zod "e" exists',
        zodDefLine !== -1,
        `Expected "var e = {};" at module level`);

    if (zodDefLine !== -1) {
        // Check that next few lines contain zod exports (lazy: `string: () => ...`)
        const nextLines = lines.slice(zodDefLine, zodDefLine + 30).join('\n');
        assert('zod "e" has string/number/object exports',
            nextLines.includes('string:') && nextLines.includes('number:') && nextLines.includes('object:'),
            'Expected zod-like exports near var e = {}');
    }

    // Patch 08: registerTools must use "e" (module-level zod), NOT "s" or "N"
    const registerLine = lines.find(l => l.includes('_remoteTools2.registerTools('));
    assert('Patch 08 registerTools found',
        !!registerLine,
        'Expected _remoteTools2.registerTools call');

    if (registerLine) {
        // Extract the second argument (zod param)
        const match = registerLine.match(/_remoteTools2\.registerTools\(\w+\.instance,\s*(\w+),/);
        assert('Patch 08 zod argument is "e" (module-level)',
            match && match[1] === 'e',
            `Expected "e" but got "${match ? match[1] : 'NOT FOUND'}"`);

        // Verify it's NOT the old broken values
        assert('Patch 08 zod is NOT "s" (v2.1.42 hardcode)',
            !match || match[1] !== 's',
            'Bug: still using hardcoded "s" from v2.1.42');
        assert('Patch 08 zod is NOT "N" ($1 stream, not zod)',
            !match || match[1] !== 'N',
            'Bug: "N" is new $1 (stream class), not zod');
    }

    // Patch 04: registerTools should also use "e" for WebSocket server
    const wsRegisterLine = lines.find(l =>
        l.includes('_remoteTools.registerTools(') && !l.includes('_remoteTools2'));
    if (wsRegisterLine) {
        const match = wsRegisterLine.match(/_remoteTools\.registerTools\(\w+,\s*(\w+),/);
        assert('Patch 04 zod argument is "e"',
            match && match[1] === 'e',
            `Expected "e" but got "${match ? match[1] : 'NOT FOUND'}"`);
    } else {
        skip('Patch 04 registerTools check', 'WebSocket registerTools line not found');
    }

    // Verify N is NOT zod (it's $1 = stream class)
    const launchClaudeLine = lines.findIndex(l => /async launchClaude\(/.test(l));
    if (launchClaudeLine !== -1) {
        const lcContext = lines.slice(launchClaudeLine, launchClaudeLine + 10).join('\n');
        const nInit = lcContext.match(/let N = new (\$\d+)/);
        if (nInit) {
            // Find the class definition for $1
            const classLine = lines.find(l => l.includes(`class ${nInit[1]} {`));
            assert(`"N = new ${nInit[1]}" is NOT zod (it's a stream/queue class)`,
                classLine && !classLine.includes('string') && !classLine.includes('zod'),
                `Verify ${nInit[1]} is not zod`);
        }
    }
}

// ─── 6. remote-tools.js interface check ──────────────────────────────────────

function testRemoteToolsInterface() {
    section('6. remote-tools.js Interface');

    if (!fs.existsSync(REMOTE_TOOLS)) {
        skip('remote-tools tests', 'src/remote-tools.js not found');
        return;
    }

    const code = fs.readFileSync(REMOTE_TOOLS, 'utf8');

    // registerTools signature
    const sigMatch = code.match(/function registerTools\(([^)]+)\)/);
    assert('registerTools has correct signature',
        !!sigMatch,
        'Expected function registerTools(...)');

    if (sigMatch) {
        const params = sigMatch[1].split(',').map(s => s.trim());
        assert('registerTools has 5 params',
            params.length === 5,
            `Expected 5 params, got ${params.length}: ${params.join(', ')}`);
        assert('registerTools param 2 is "s" (zod schema)',
            params[1] === 's',
            `Expected "s" as param 2, got "${params[1]}"`);
    }

    // Zod usage inside registerTools
    const zodUsages = code.match(/\bs\.(string|number|boolean|object|enum|optional|array)\(\)/g);
    assert('registerTools uses s.string()/s.number() etc.',
        zodUsages && zodUsages.length > 5,
        `Expected many zod schema calls, found ${zodUsages ? zodUsages.length : 0}`);

    // Tool names
    const toolNames = ['read_file', 'write_file', 'edit_file', 'glob', 'grep', 'bash'];
    for (const name of toolNames) {
        assert(`MCP tool "${name}" defined`,
            code.includes(`"${name}"`));
    }

    // Exported functions
    const exports = ['registerTools', 'toRemotePath', 'getRemoteUri', 'getSshHost',
                     'setEditOverride', 'consumeEditOverride'];
    for (const fn of exports) {
        assert(`exports.${fn} defined`,
            code.includes(`${fn}`) && code.includes('module.exports'),
            `Expected ${fn} in module.exports`);
    }
}

// ─── 7. Full pipeline dry-run ────────────────────────────────────────────────

function testFullPipelineDryRun() {
    section('7. Full Pipeline Dry-Run (all 20 patches)');

    // We need the UNPATCHED beautified file for this test.
    // If it doesn't exist, we can check if the patched file has all markers.
    const beautifiedPath = path.join(ROOT, 'extension.beautified.js');
    if (!fs.existsSync(beautifiedPath)) {
        // Alternative: verify all patches are in the patched file
        if (!fs.existsSync(PATCHED_EXT)) {
            skip('pipeline dry-run', 'neither beautified nor patched extension.js found');
            return;
        }

        const code = fs.readFileSync(PATCHED_EXT, 'utf8');
        const { allPatches } = require(PATCHES_INDEX);

        let allPresent = true;
        let missing = [];
        for (const p of allPatches) {
            if (!p.appliedCheck) continue;
            // patch-10a-loop uses version-dependent var name
            if (p.id === 'patch-10a-loop') {
                if (!/var _\w+ = _transformForWebview/.test(code)) {
                    allPresent = false;
                    missing.push(p.id);
                }
            } else if (!p.appliedCheck.test(code)) {
                allPresent = false;
                missing.push(p.id);
            }
        }

        assert(`all ${allPatches.length} patches have markers in extension.js`,
            allPresent,
            `Missing patches: ${missing.join(', ')}`);
        return;
    }

    const unpatched = fs.readFileSync(beautifiedPath, 'utf8');
    const { allPatches } = require(PATCHES_INDEX);
    const { applyAll } = require(PATCHER);

    const { results } = applyAll(unpatched, allPatches, true); // dry-run mode

    let successCount = 0;
    for (const r of results) {
        if (r.success) {
            successCount++;
            pass(`dry-run [${r.id}]: OK at line ${r.line}`);
        } else {
            fail(`dry-run [${r.id}]: ${r.message}`);
        }
    }

    assert(`all ${allPatches.length} patches succeed in dry-run`,
        successCount === allPatches.length,
        `${successCount}/${allPatches.length} succeeded`);
}

// ─── 8. Cross-patch consistency ──────────────────────────────────────────────

function testCrossPatchConsistency() {
    section('8. Cross-Patch Consistency');

    if (!fs.existsSync(PATCHED_EXT)) {
        skip('cross-patch tests', 'extension.js not found');
        return;
    }

    const code = fs.readFileSync(PATCHED_EXT, 'utf8');

    // MCP tool name consistency across patches
    const mcpTools = [
        'mcp__claude-vscode__read_file',
        'mcp__claude-vscode__write_file',
        'mcp__claude-vscode__edit_file',
        'mcp__claude-vscode__glob',
        'mcp__claude-vscode__grep',
        'mcp__claude-vscode__bash',
    ];

    // Patch 03 (spawnClaude) allowedTools — uses `.allowedTools = [...]` format
    // The regex needs to match the multi-line array in the generated patch
    const allowedBlock = code.match(/\.allowedTools\s*=\s*\[([\s\S]*?)\]/);
    if (allowedBlock) {
        for (const tool of mcpTools) {
            assert(`Patch 03 allowedTools includes "${tool.split('__').pop()}"`,
                allowedBlock[1].includes(tool));
        }
    } else {
        skip('Patch 03 allowedTools check', 'allowedTools block not found');
    }

    // Patch 10A transform map should cover all 6 tools
    const transformMap = code.match(/_mcpToBuiltinName\s*=\s*\{([\s\S]*?)\}/);
    if (transformMap) {
        for (const tool of mcpTools) {
            assert(`Patch 10A transform covers "${tool.split('__').pop()}"`,
                transformMap[1].includes(tool));
        }
    }

    // Patch 03 disallowedTools should list 8 built-in tools
    const disallowedMatch = code.match(/disallowedTools\s*=\s*\[([\s\S]*?)\]/);
    if (disallowedMatch) {
        const builtins = ['Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'Bash', 'NotebookEdit'];
        for (const t of builtins) {
            assert(`Patch 03 disallowedTools includes "${t}"`,
                disallowedMatch[1].includes(`"${t}"`));
        }
    }

    // isForceLocalMode() should be called consistently
    const forceLocalCalls = (code.match(/isForceLocalMode\(\)/g) || []).length;
    assert('isForceLocalMode() called in multiple patches',
        forceLocalCalls >= 5,
        `Expected >=5 calls, found ${forceLocalCalls}`);

    // getForceLocalCwd() should be used in patches 03, 05, 06a, 06b, 13
    const getFlCwdCalls = (code.match(/getForceLocalCwd\(\)/g) || []).length;
    assert('getForceLocalCwd() called multiple times',
        getFlCwdCalls >= 4,
        `Expected >=4 calls, found ${getFlCwdCalls}`);
}

// ─── 9. Installed extension validation ───────────────────────────────────────

function testInstalledExtension() {
    section('9. Installed Extension Validation');

    const os = require('os');
    const extDir = path.join(os.homedir(), '.vscode', 'extensions');

    // Find installed extension directory
    let installedDir = null;
    if (fs.existsSync(extDir)) {
        const entries = fs.readdirSync(extDir);
        const match = entries.find(e => e.startsWith('justimyhxu.claude-code-local-'));
        if (match) installedDir = path.join(extDir, match);
    }

    if (!installedDir) {
        skip('installed extension tests', 'extension not installed');
        return;
    }

    const version = path.basename(installedDir).replace('justimyhxu.claude-code-local-', '');
    pass(`installed extension found: v${version}`);

    // Check critical files exist
    const criticalFiles = [
        'extension.js',
        'package.json',
        'src/remote-tools.js',
        'resources/native-binaries/darwin-arm64/claude',
        'resources/native-binaries/linux-x64/claude',
    ];
    for (const f of criticalFiles) {
        const fp = path.join(installedDir, f);
        assert(`installed: ${f} exists`, fs.existsSync(fp));
    }

    // Verify the installed extension.js has the zod fix
    const installedExt = fs.readFileSync(path.join(installedDir, 'extension.js'), 'utf8');
    const registerLine = installedExt.match(/_remoteTools2\.registerTools\(\w+\.instance,\s*(\w+),/);
    assert('installed ext: Patch 08 zod = "e"',
        registerLine && registerLine[1] === 'e',
        `Expected "e", got "${registerLine ? registerLine[1] : 'NOT FOUND'}"`);

    // Verify package.json
    const pkg = JSON.parse(fs.readFileSync(path.join(installedDir, 'package.json'), 'utf8'));
    assert('installed pkg: name is "claude-code-local"',
        pkg.name === 'claude-code-local');
    assert('installed pkg: extensionKind set',
        Array.isArray(pkg.extensionKind) && pkg.extensionKind.length === 2);
    assert('installed pkg: forceLocal setting exists',
        !!pkg.contributes?.configuration?.properties?.['claudeCode.forceLocal']);
    assert('installed pkg: enabledApiProposals includes "resolvers"',
        Array.isArray(pkg.enabledApiProposals) && pkg.enabledApiProposals.includes('resolvers'));

    // Verify remote-tools.js is same as source
    const installedRT = fs.readFileSync(path.join(installedDir, 'src/remote-tools.js'), 'utf8');
    const sourceRT = fs.existsSync(REMOTE_TOOLS) ? fs.readFileSync(REMOTE_TOOLS, 'utf8') : null;
    if (sourceRT) {
        assert('installed remote-tools.js matches source',
            installedRT === sourceRT,
            'Files differ — VSIX may need rebuild');
    }
}

// ─── 10. Patch 08 specific deep dive ─────────────────────────────────────────

function testPatch08DeepDive() {
    section('10. Patch 08 Deep Dive');

    if (!fs.existsSync(PATCHED_EXT)) {
        skip('Patch 08 deep dive', 'extension.js not found');
        return;
    }

    const code = fs.readFileSync(PATCHED_EXT, 'utf8');
    const lines = code.split('\n');

    // Find the registerTools call
    const regLineIdx = lines.findIndex(l => l.includes('_remoteTools2.registerTools('));
    assert('registerTools call found', regLineIdx !== -1);

    if (regLineIdx === -1) return;

    // Verify surrounding context
    const context = lines.slice(Math.max(0, regLineIdx - 5), regLineIdx + 5).join('\n');

    // The isForceLocalMode() check is ~80 lines above registerTools
    assert('registerTools within isForceLocalMode() block',
        lines.slice(Math.max(0, regLineIdx - 90), regLineIdx).join('\n').includes('isForceLocalMode()'));

    assert('registerTools within try-catch',
        context.includes('try {') || lines.slice(Math.max(0, regLineIdx - 40), regLineIdx).join('\n').includes('try {'));

    assert('error handler logs "FAILED to register"',
        lines.slice(regLineIdx, regLineIdx + 5).join('\n').includes('FAILED to register remote tools'));

    // Verify the _registeredTools count log
    assert('tool count log present',
        lines.slice(regLineIdx, regLineIdx + 3).join('\n').includes('_registeredTools'));

    // Verify _reviewEdit callback is defined before use
    const reviewEditDef = lines.findIndex(l => l.includes('var _reviewEdit = async function('));
    assert('_reviewEdit defined before registerTools',
        reviewEditDef !== -1 && reviewEditDef < regLineIdx,
        `_reviewEdit at line ${reviewEditDef + 1}, registerTools at line ${regLineIdx + 1}`);

    // Verify _fileUpdatedCb is defined before use
    const fileUpdatedDef = lines.findIndex(l => l.includes('var _fileUpdatedCb = '));
    assert('_fileUpdatedCb defined before registerTools',
        fileUpdatedDef !== -1 && fileUpdatedDef < regLineIdx);

    // Verify the in-process server variable matches pattern: x.instance
    const serverMatch = lines[regLineIdx].match(/_remoteTools2\.registerTools\((\w+)\.instance/);
    assert('registerTools uses server.instance pattern',
        !!serverMatch);

    if (serverMatch) {
        // Verify this server variable is used with onExperimentGatesUpdated in launchClaude
        const serverVar = serverMatch[1];
        // Search backwards from registerTools for the server definition
        const searchBlock = lines.slice(Math.max(0, regLineIdx - 120), regLineIdx).join('\n');
        assert(`server var "${serverVar}" is in-process MCP server`,
            searchBlock.includes(`${serverVar} = `) && searchBlock.includes('onExperimentGatesUpdated'),
            `Could not find "${serverVar}" definition with onExperimentGatesUpdated context`);
    }
}

// ─── Run all tests ───────────────────────────────────────────────────────────

console.log('\x1b[1m╔═══════════════════════════════════════════════════════╗');
console.log('║  Claude Code VS Code Extension — Patch Test Suite    ║');
console.log('╚═══════════════════════════════════════════════════════╝\x1b[0m');

testPatcherUnit();
testDetectVars();
testGenerateSyntax();
testPatchedStructure();
testZodVariable();
testRemoteToolsInterface();
testFullPipelineDryRun();
testCrossPatchConsistency();
testInstalledExtension();
testPatch08DeepDive();

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n\x1b[1m═══ SUMMARY ═══\x1b[0m');
console.log(`  \x1b[32m${_passed} passed\x1b[0m, \x1b[31m${_failed} failed\x1b[0m, \x1b[33m${_skipped} skipped\x1b[0m`);

if (_failures.length > 0) {
    console.log('\n\x1b[1;31mFailures:\x1b[0m');
    for (const f of _failures) {
        console.log(`  • ${f.name}`);
        if (f.reason) console.log(`    ${f.reason}`);
    }
}

console.log();
process.exit(_failed > 0 ? 1 : 0);
