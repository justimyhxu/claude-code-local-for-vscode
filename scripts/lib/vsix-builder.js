'use strict';

const fs = require('fs');
const path = require('path');

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
    }
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".json" ContentType="application/json"/>
  <Default Extension=".js" ContentType="application/javascript"/>
  <Default Extension=".css" ContentType="text/css"/>
  <Default Extension=".svg" ContentType="image/svg+xml"/>
  <Default Extension=".png" ContentType="image/png"/>
  <Default Extension=".md" ContentType="text/markdown"/>
  <Default Extension=".vsixmanifest" ContentType="text/xml"/>
</Types>`;

function buildVsix(opts) {
    const { darwinDir, linuxDir, repoDir, outputPath } = opts;
    const { execSync } = require('child_process');

    const stagingDir = path.join(require('os').tmpdir(), 'vsix-build-' + Date.now());
    const extDir = path.join(stagingDir, 'extension');
    fs.mkdirSync(extDir, { recursive: true });

    console.log('Building VSIX...');
    console.log(`  Staging: ${stagingDir}`);

    // [Content_Types].xml
    fs.writeFileSync(path.join(stagingDir, '[Content_Types].xml'), CONTENT_TYPES_XML);

    // Copy extension.vsixmanifest from source VSIX
    const srcManifest = path.join(darwinDir, 'extension.vsixmanifest');
    if (fs.existsSync(srcManifest)) {
        // Update the manifest to use our extension ID
        let manifest = fs.readFileSync(srcManifest, 'utf8');
        manifest = manifest.replace(/Id="claude-code"/g, 'Id="claude-code-local"');
        manifest = manifest.replace(/DisplayName="Claude Code"/g, 'DisplayName="Claude Code Local for VS Code"');
        manifest = manifest.replace(/Publisher="Anthropic"/g, 'Publisher="justimyhxu"');
        fs.writeFileSync(path.join(stagingDir, 'extension.vsixmanifest'), manifest);
    }

    // Copy patched extension.js and package.json from repo
    fs.copyFileSync(path.join(repoDir, 'extension.js'), path.join(extDir, 'extension.js'));
    fs.copyFileSync(path.join(repoDir, 'package.json'), path.join(extDir, 'package.json'));

    // Copy src/remote-tools.js
    const srcDir = path.join(extDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.copyFileSync(path.join(repoDir, 'src', 'remote-tools.js'), path.join(srcDir, 'remote-tools.js'));

    // Copy webview from source VSIX
    const srcWebview = path.join(darwinDir, 'extension', 'webview');
    if (fs.existsSync(srcWebview)) {
        copyRecursive(srcWebview, path.join(extDir, 'webview'));
    }

    // Copy resources (icons, walkthrough, schema) from source VSIX
    const srcResources = path.join(darwinDir, 'extension', 'resources');
    if (fs.existsSync(srcResources)) {
        copyRecursive(srcResources, path.join(extDir, 'resources'));
    }

    // Copy settings schema
    const schemaFile = path.join(darwinDir, 'extension', 'claude-code-settings.schema.json');
    if (fs.existsSync(schemaFile)) {
        fs.copyFileSync(schemaFile, path.join(extDir, 'claude-code-settings.schema.json'));
    }

    // Extract and place CLI binaries
    const binDir = path.join(extDir, 'resources', 'native-binaries');

    // Darwin ARM64 binary
    const darwinBinSrc = path.join(darwinDir, 'extension', 'resources', 'native-binary', 'claude');
    const darwinBinAlt = path.join(darwinDir, 'extension', 'resources', 'native-binaries', 'darwin-arm64', 'claude');
    const darwinBinDest = path.join(binDir, 'darwin-arm64', 'claude');
    fs.mkdirSync(path.dirname(darwinBinDest), { recursive: true });
    if (fs.existsSync(darwinBinAlt)) {
        fs.copyFileSync(darwinBinAlt, darwinBinDest);
    } else if (fs.existsSync(darwinBinSrc)) {
        fs.copyFileSync(darwinBinSrc, darwinBinDest);
    }

    // Linux x64 binary
    const linuxBinSrc = path.join(linuxDir, 'extension', 'resources', 'native-binary', 'claude');
    const linuxBinAlt = path.join(linuxDir, 'extension', 'resources', 'native-binaries', 'linux-x64', 'claude');
    const linuxBinDest = path.join(binDir, 'linux-x64', 'claude');
    fs.mkdirSync(path.dirname(linuxBinDest), { recursive: true });
    if (fs.existsSync(linuxBinAlt)) {
        fs.copyFileSync(linuxBinAlt, linuxBinDest);
    } else if (fs.existsSync(linuxBinSrc)) {
        fs.copyFileSync(linuxBinSrc, linuxBinDest);
    }

    // Fallback binary (darwin-arm64 -> native-binary/claude)
    const fallbackDest = path.join(extDir, 'resources', 'native-binary', 'claude');
    fs.mkdirSync(path.dirname(fallbackDest), { recursive: true });
    if (fs.existsSync(darwinBinDest)) {
        fs.copyFileSync(darwinBinDest, fallbackDest);
    }

    // Set execute permissions on binaries
    for (const binPath of [darwinBinDest, linuxBinDest, fallbackDest]) {
        if (fs.existsSync(binPath)) {
            try { fs.chmodSync(binPath, 0o755); } catch (e) {
                console.warn(`  Warning: could not chmod ${path.basename(binPath)}: ${e.message}`);
            }
        }
    }

    // Build zip using system `zip` command (preserves Unix permissions, especially +x on binaries)
    try {
        console.log('  Creating VSIX archive...');
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        // Remove existing file if present (zip -r appends)
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        const absOutput = path.resolve(outputPath);
        execSync(`cd "${stagingDir}" && zip -r -X "${absOutput}" .`, { stdio: 'pipe' });

        const size = fs.statSync(outputPath).size;
        console.log(`  VSIX: ${outputPath} (${(size / 1024 / 1024).toFixed(1)} MB)`);
        return outputPath;
    } finally {
        // Cleanup staging dir even on error
        try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (e) {}
    }
}

module.exports = { buildVsix };
