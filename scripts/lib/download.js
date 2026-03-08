'use strict';

const https = require('https');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');

const MARKETPLACE_API = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';
const EXTENSION_ID = 'anthropic.claude-code';

function httpsGet(url, { maxRedirects = 5, onProgress } = {}) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
        if (!url.startsWith('https://')) return reject(new Error(`Refusing non-HTTPS URL: ${url}`));
        https.get(url, { headers: { 'User-Agent': 'VSCode-Update-Script' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const target = new URL(res.headers.location, url).href;
                return httpsGet(target, { maxRedirects: maxRedirects - 1, onProgress }).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            const encoding = (res.headers['content-encoding'] || '').toLowerCase();
            let stream = res;
            if (encoding === 'gzip') {
                stream = res.pipe(zlib.createGunzip());
            } else if (encoding === 'deflate') {
                stream = res.pipe(zlib.createInflate());
            }
            // For progress, use raw bytes from res (compressed size = transfer size)
            const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
            let receivedBytes = 0;
            res.on('data', (c) => {
                receivedBytes += c.length;
                if (onProgress) onProgress(receivedBytes, totalBytes);
            });
            const chunks = [];
            stream.on('data', (c) => chunks.push(c));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);
            res.on('error', reject);
        }).on('error', reject);
    });
}

function httpsPost(url, body) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const data = JSON.stringify(body);
        const opts = {
            hostname: parsed.hostname,
            port: parsed.port || 443,
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json;api-version=6.1-preview.1',
                'Content-Length': Buffer.byteLength(data),
                'User-Agent': 'VSCode-Update-Script'
            }
        };
        const req = https.request(opts, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                if (res.statusCode !== 200) {
                    return reject(new Error(`HTTP ${res.statusCode}: ${buf.toString().slice(0, 500)}`));
                }
                try {
                    resolve(JSON.parse(buf.toString()));
                } catch (e) {
                    reject(new Error(`Invalid JSON from ${url}: ${buf.toString().slice(0, 200)}`));
                }
            });
            res.on('error', reject);
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function fetchLatestVersion() {
    console.log('Fetching latest version from VS Code Marketplace...');
    const body = {
        filters: [{
            criteria: [
                { filterType: 7, value: EXTENSION_ID }
            ]
        }],
        flags: 0x200 | 0x1 // IncludeVersions | IncludeFiles
    };
    const result = await httpsPost(MARKETPLACE_API, body);
    const ext = result.results?.[0]?.extensions?.[0];
    if (!ext) throw new Error('Extension not found in marketplace');
    const version = ext.versions?.[0]?.version;
    if (!version) throw new Error('No version found');
    console.log(`Latest version: ${version}`);
    return version;
}

function getVsixUrl(version, platform) {
    // VS Code Marketplace VSIX download URL pattern
    return `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/Anthropic/vsextensions/claude-code/${version}/vspackage?targetPlatform=${platform}`;
}

async function downloadFile(url, destPath) {
    const shortUrl = url.split('?')[0];
    const platform = shortUrl.includes('targetPlatform=') ? '' :
        (url.match(/targetPlatform=([^&]+)/)?.[1] || '');
    const label = platform ? `[${platform}]` : path.basename(destPath);
    process.stdout.write(`  ${label}: connecting...`);

    let lastPct = -1;
    const onProgress = (received, total) => {
        const mb = (received / 1024 / 1024).toFixed(1);
        if (total > 0) {
            const pct = Math.floor(received / total * 100);
            if (pct !== lastPct) {
                lastPct = pct;
                const totalMb = (total / 1024 / 1024).toFixed(1);
                const barLen = 30;
                const filled = Math.round(barLen * pct / 100);
                const bar = '#'.repeat(filled) + '-'.repeat(barLen - filled);
                process.stdout.write(`\r  ${label}: [${bar}] ${pct}% (${mb}/${totalMb} MB)`);
            }
        } else {
            process.stdout.write(`\r  ${label}: ${mb} MB downloaded...`);
        }
    };

    const data = await httpsGet(url, { onProgress });
    const sizeMb = (data.length / 1024 / 1024).toFixed(1);
    process.stdout.write(`\r  ${label}: done (${sizeMb} MB)` + ' '.repeat(30) + '\n');
    fs.writeFileSync(destPath, data);
    return destPath;
}

async function extractVsix(vsixPath, destDir) {
    const AdmZip = require('adm-zip');
    console.log(`Extracting: ${vsixPath} -> ${destDir}`);
    fs.mkdirSync(destDir, { recursive: true });
    const zip = new AdmZip(vsixPath);
    zip.extractAllTo(destDir, true);
    console.log(`  Extracted to ${destDir}`);
    return destDir;
}

async function download(version, targetDir) {
    if (!version) {
        version = await fetchLatestVersion();
    }

    targetDir = targetDir || path.join(__dirname, '..', '..', '.update-cache');
    const versionDir = path.join(targetDir, version);
    fs.mkdirSync(versionDir, { recursive: true });

    const platforms = [
        { name: 'darwin-arm64', target: 'darwin-arm64' },
        { name: 'linux-x64', target: 'linux-x64' }
    ];

    const results = {};

    for (const platform of platforms) {
        const vsixFile = path.join(versionDir, `claude-code-${platform.name}.vsix`);
        const extractDir = path.join(versionDir, platform.name);

        if (fs.existsSync(extractDir) && fs.existsSync(path.join(extractDir, 'extension', 'extension.js'))) {
            console.log(`Using cached ${platform.name} for v${version}`);
        } else {
            const url = getVsixUrl(version, platform.target);
            await downloadFile(url, vsixFile);
            await extractVsix(vsixFile, extractDir);
            // Clean up vsix file to save space
            try { fs.unlinkSync(vsixFile); } catch (e) {}
        }

        results[platform.name] = extractDir;
    }

    return {
        version,
        darwinDir: results['darwin-arm64'],
        linuxDir: results['linux-x64'],
        // Use darwin extension.js as the base for patching
        extensionJs: path.join(results['darwin-arm64'], 'extension', 'extension.js'),
        packageJson: path.join(results['darwin-arm64'], 'extension', 'package.json'),
        extensionDir: path.join(results['darwin-arm64'], 'extension')
    };
}

module.exports = { download, fetchLatestVersion };
