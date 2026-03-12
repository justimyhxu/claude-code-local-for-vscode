#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const REPO_DIR = path.resolve(__dirname, '..');

function parseArgs() {
    const args = process.argv.slice(2);
    const opts = {
        version: null,
        source: null,
        dryRun: false,
        install: false,
        skipDownload: false,
        outputPath: null,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--version':
            case '-v':
                if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
                    console.error('Error: --version requires a value');
                    process.exit(1);
                }
                opts.version = args[++i];
                break;
            case '--dry-run':
                opts.dryRun = true;
                break;
            case '--install':
                opts.install = true;
                break;
            case '--skip-download':
                opts.skipDownload = true;
                break;
            case '--source':
            case '-s':
                if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
                    console.error('Error: --source requires a value (marketplace or openvsx)');
                    process.exit(1);
                }
                opts.source = args[++i];
                break;
            case '--output':
            case '-o':
                if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
                    console.error('Error: --output requires a path');
                    process.exit(1);
                }
                opts.outputPath = args[++i];
                break;
            case '--help':
            case '-h':
                opts.help = true;
                break;
        }
    }
    return opts;
}

function printUsage() {
    const { DEFAULT_VERSION, SOURCES } = require('./lib/download');
    const sourceNames = Object.keys(SOURCES).join(', ');
    console.log(`
Usage: node scripts/update.js [options]

Options:
  --version <ver>    Specify version (e.g., 2.1.71). Default: ${DEFAULT_VERSION} (pinned)
  --source <src>     Download source: ${sourceNames}. Default: marketplace
  --dry-run          Only verify anchors, don't modify files
  --install          Install VSIX after building
  --skip-download    Skip download, use cached files
  --output <path>    Output VSIX path
  -h, --help         Show this help

Examples:
  node scripts/update.js                          # Pinned version (v${DEFAULT_VERSION})
  node scripts/update.js --version 2.1.71         # Specific version
  node scripts/update.js --source openvsx         # Download from Open VSX (faster in China)
  node scripts/update.js --dry-run                # Verify anchors only
  node scripts/update.js --install                # Build + install
  node scripts/update.js --skip-download          # Use cached download
`);
}

function printReport(results, totalPatches) {
    console.log('\n' + '='.repeat(70));
    console.log('PATCH REPORT');
    console.log('='.repeat(70));

    let applied = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const idx = String(i + 1).padStart(2, ' ');
        const total = String(totalPatches);
        const label = `[${idx}/${total}] ${r.id} (${r.name})`;
        const dots = '.'.repeat(Math.max(2, 55 - label.length));

        if (r.skipped) {
            console.log(`${label}${dots} SKIP`);
            skipped++;
        } else if (r.success) {
            console.log(`${label}${dots} OK (line ${r.line})`);
            applied++;
        } else {
            console.log(`${label}${dots} FAIL`);
            console.log(`  ${r.message}`);
            failed++;
        }
    }

    console.log('='.repeat(70));
    console.log(`Result: ${applied} applied, ${skipped} skipped, ${failed} failed (${totalPatches} total)`);
    if (failed > 0) {
        console.log('\nWARNING: Some patches failed. The output may not work correctly.');
        console.log('Review the failed patches and update anchor patterns if needed.');
    }
    console.log('');

    return failed;
}

async function main() {
    const opts = parseArgs();

    if (opts.help) {
        printUsage();
        process.exit(0);
    }

    console.log('Claude Code VS Code Extension — Auto Update Script');
    console.log('='.repeat(50));

    // Step 1: Download or locate source files
    let sourceInfo;
    const cacheDir = path.join(REPO_DIR, '.update-cache');

    if (opts.skipDownload) {
        console.log('\n--- Step 1: Using cached files ---');
        // Find the most recent version in cache
        if (!fs.existsSync(cacheDir)) {
            console.error('Error: No cache directory found. Run without --skip-download first.');
            process.exit(1);
        }
        const versions = fs.readdirSync(cacheDir).filter(d =>
            fs.statSync(path.join(cacheDir, d)).isDirectory()
        ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const version = opts.version || versions[versions.length - 1];
        if (!version) {
            console.error('Error: No cached versions found.');
            process.exit(1);
        }
        const versionDir = path.join(cacheDir, version);
        if (!fs.existsSync(versionDir)) {
            console.error(`Error: Version ${version} not found in cache.`);
            process.exit(1);
        }
        sourceInfo = {
            version,
            darwinDir: path.join(versionDir, 'darwin-arm64'),
            linuxDir: path.join(versionDir, 'linux-x64'),
            extensionJs: path.join(versionDir, 'darwin-arm64', 'extension', 'extension.js'),
            packageJson: path.join(versionDir, 'darwin-arm64', 'extension', 'package.json'),
            extensionDir: path.join(versionDir, 'darwin-arm64', 'extension')
        };
        console.log(`Using cached v${version}`);
    } else {
        console.log('\n--- Step 1: Download ---');
        const { download } = require('./lib/download');
        sourceInfo = await download(opts.version, cacheDir, opts.source);
    }

    console.log(`Version: ${sourceInfo.version}`);

    // Step 2: Beautify extension.js
    console.log('\n--- Step 2: Beautify ---');
    const beautifiedPath = path.join(path.dirname(sourceInfo.extensionJs), 'extension.beautified.js');

    if (fs.existsSync(beautifiedPath) && opts.skipDownload) {
        console.log('Using cached beautified file');
    } else {
        const { beautifyFile } = require('./lib/beautify');
        beautifyFile(sourceInfo.extensionJs, beautifiedPath);
    }

    // Step 3: Apply patches
    console.log('\n--- Step 3: Apply Patches ---');
    const { allPatches } = require('./patches');
    const { applyAll } = require('./lib/patcher');

    let code = fs.readFileSync(beautifiedPath, 'utf8');
    const { code: patchedCode, results } = applyAll(code, allPatches, opts.dryRun);

    const failCount = printReport(results, allPatches.length);

    if (opts.dryRun) {
        console.log('Dry run complete. No files were modified.');
        process.exit(failCount > 0 ? 1 : 0);
    }

    // Write patched extension.js to repo
    const patchedOutputPath = path.join(REPO_DIR, 'extension.js');
    fs.writeFileSync(patchedOutputPath, patchedCode);
    console.log(`Patched extension.js written to: ${patchedOutputPath}`);

    // Step 4: Patch package.json
    console.log('\n--- Step 4: Patch package.json ---');
    const { patchPackageJson } = require('./lib/package-patcher');
    const repoPkgPath = path.join(REPO_DIR, 'package.json');

    // Copy fresh package.json from source, then patch it
    fs.copyFileSync(sourceInfo.packageJson, repoPkgPath);
    patchPackageJson(repoPkgPath);

    // Step 5: Build VSIX
    console.log('\n--- Step 5: Build VSIX ---');
    const { buildVsix } = require('./lib/vsix-builder');
    const outputPath = opts.outputPath || `/tmp/claude-code-local-${sourceInfo.version}.vsix`;

    buildVsix({
        darwinDir: sourceInfo.darwinDir,
        linuxDir: sourceInfo.linuxDir,
        repoDir: REPO_DIR,
        outputPath
    });

    console.log(`\nVSIX built: ${outputPath}`);

    // Step 6: Install (if requested)
    if (opts.install) {
        console.log('\n--- Step 6: Install ---');
        const { execSync } = require('child_process');
        try {
            execSync(`code --install-extension "${outputPath}" --force`, { stdio: 'inherit' });
            console.log('Extension installed successfully.');
            console.log('Restart VS Code with: --enable-proposed-api justimyhxu.claude-code-local');
        } catch (e) {
            console.error('Install failed:', e.message);
            process.exit(1);
        }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('DONE');
    console.log(`  Version: ${sourceInfo.version}`);
    console.log(`  VSIX: ${outputPath}`);
    if (failCount > 0) {
        console.log(`  WARNING: ${failCount} patch(es) failed`);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('\nFatal error:', err.message || err);
    console.error(err.stack);
    process.exit(1);
});
