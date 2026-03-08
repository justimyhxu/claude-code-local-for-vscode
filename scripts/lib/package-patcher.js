'use strict';

const fs = require('fs');

function patchPackageJson(pkgPath) {
    console.log(`Patching package.json: ${pkgPath}`);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    // Core identity changes
    pkg.name = 'claude-code-local';
    pkg.displayName = 'Claude Code Local for VS Code';
    pkg.publisher = 'justimyhxu';

    // extensionKind: allow running on UI side (local)
    pkg.extensionKind = ['ui', 'workspace'];

    // Enable resolvers proposed API for FileSystemProvider on UI side
    pkg.enabledApiProposals = ['resolvers'];

    // Add forceLocal settings
    const props = pkg.contributes.configuration.properties;

    if (!props['claudeCode.forceLocal']) {
        props['claudeCode.forceLocal'] = {
            type: 'boolean',
            default: false,
            description: 'Force Claude to run locally. File operations are proxied to remote via SSH. Only effective when connected to a remote server.'
        };
    }

    if (!props['claudeCode.sshHost']) {
        props['claudeCode.sshHost'] = {
            type: 'string',
            default: '',
            description: 'SSH host override for force local mode. If empty, auto-detected from Remote SSH connection.'
        };
    }

    if (!props['claudeCode.sshIdentityFile']) {
        props['claudeCode.sshIdentityFile'] = {
            type: 'string',
            default: '',
            description: 'Path to SSH private key file for remote connections (e.g. ~/.ssh/id_rsa). If empty, uses SSH defaults.'
        };
    }

    if (!props['claudeCode.sshExtraArgs']) {
        props['claudeCode.sshExtraArgs'] = {
            type: 'array',
            items: { type: 'string' },
            default: [],
            description: 'Extra arguments to pass to the SSH command (e.g. ["-p", "2222"] for non-standard port).'
        };
    }

    if (!props['claudeCode.useSSHExec']) {
        props['claudeCode.useSSHExec'] = {
            type: 'boolean',
            default: false,
            description: 'Use direct SSH for bash/grep instead of VS Code terminal. Enable if terminal-based execution doesn\'t work.'
        };
    }

    if (!props['claudeCode.forceLocalDiffMode']) {
        props['claudeCode.forceLocalDiffMode'] = {
            type: 'string',
            enum: ['auto', 'review'],
            default: 'auto',
            markdownDescription: 'How file edits are handled in force-local mode.\n- **auto**: Edits apply immediately, inline diff in chat (fast).\n- **review**: Opens VS Code diff tab before writing; you can edit the code and Accept/Reject (safe).'
        };
    }

    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, '\t') + '\n');
    console.log('  package.json patched successfully');
    return pkg;
}

module.exports = { patchPackageJson };
