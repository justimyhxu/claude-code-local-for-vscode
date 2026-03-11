**English** | [中文](README.zh-CN.md)

# Claude Code VS Code -- Dual Mode (Local + Remote)

> One extension, two modes: run Claude Code **locally** for no-internet servers, or **remotely** just like the official extension -- controlled by a single setting.

**Base version**: Claude Code VS Code Extension v2.1.71 (Anthropic)
**Platforms**: macOS ARM64 + Linux x86-64 (dual binary)
**Status**: Functional -- all core tools verified

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Two Working Modes](#2-two-working-modes)
3. [Installation](#3-installation)
4. [Configuration](#4-configuration)
5. [Usage](#5-usage)
6. [Features](#6-features)
7. [Known Limitations](#7-known-limitations)
8. [FAQ](#8-faq)
9. [Design Philosophy](#9-design-philosophy)
10. [File Structure](#10-file-structure)
11. [Changelog](#11-changelog)
12. [License](#12-license)

---

## 1. Quick Start

```bash
# 1. Clone
git clone <this-repo-url> ~/code/claude-code-vscode
cd ~/code/claude-code-vscode

# 2. Install deps + download official VSIX + apply patches + build + install
npm install
npm run update -- --install

# 3. Enable proposed API (one-time)
#    Cmd+Shift+P -> "Configure Runtime Arguments" -> add to ~/.vscode/argv.json:
#    { "enable-proposed-api": ["justimyhxu.claude-code-local"] }

# 4. Set mode in Workspace settings (Cmd+, -> Workspace tab)
#    claudeCode.forceLocal: true   (no-internet server)
#    claudeCode.forceLocal: false  (server has internet, default)
```

See [Installation](#3-installation) for detailed steps and troubleshooting.

---

## 2. Two Working Modes

This extension supports **both** local and remote execution modes, controlled by the `claudeCode.forceLocal` setting:

| Mode | `forceLocal` | Extension Runs On | CLI Runs On | Best For |
|------|-------------|-------------------|-------------|----------|
| **Local Mode** | `true` | Your Mac (local) | Your Mac (local) | Remote server has **no internet** |
| **Remote Mode** | `false` | Remote server | Remote server (Linux) | Remote server has **internet** -- identical to official extension |

### 2.1 Local Mode (`forceLocal: true`)

```
LOCAL MACHINE (has internet)              REMOTE SERVER (no internet, has files)
+-----------------------------+           +--------------------------+
|  VS Code UI                 |           |  Remote Filesystem       |
|  Extension Host (local)     |           |  /home/user/project/     |
|    |-- CLI (macOS binary)   |           |                          |
|    |-- 6 MCP proxy tools ---|--vscode-->|  read, write, edit, etc  |
|    '-- Hidden Terminal -----|--vscode-->|  bash, grep (via term)   |
+-----------------------------+           +--------------------------+

CLI calls Anthropic API using local internet.
File operations proxied to remote via VS Code's SSH connection.
```

- The CLI's 8 built-in file tools are **disabled**. 6 replacement MCP tools proxy operations to the remote server via VS Code's remote filesystem APIs.
- No additional software needed on the remote server.
- Set `forceLocal: true` in **Workspace** settings for this project.

### 2.2 Remote Mode (`forceLocal: false`)

```
LOCAL MACHINE                             REMOTE SERVER (has internet + files)
+-----------------------------+           +--------------------------+
|  VS Code UI (thin client)   |<--------->|  VS Code Server          |
|                             |           |  Extension Host (remote) |
|                             |           |    |-- CLI (Linux binary) |
|                             |           |    '-- Standard tools    |
+-----------------------------+           +--------------------------+

Everything runs on the remote server -- identical to official Claude Code.
```

- The extension behaves **100% identically** to the official Claude Code extension. All 21 patches are gated by `isForceLocalMode()` and have zero effect.
- The Linux x64 CLI binary is bundled and auto-selected.
- Set `forceLocal: false` (or leave as default) in **Workspace** settings.

### 2.3 How Mode Switching Works

The extension dynamically manages `extensionKind` in its `package.json`:

| Environment | `forceLocal` | `extensionKind` | Effect |
|---|---|---|---|
| **Local workspace** | any | `["ui", "workspace"]` | Always local -- no switching needed |
| **Remote** | `true` | `["ui", "workspace"]` | VS Code runs extension on **local/UI side** |
| **Remote** | `false` | `["workspace", "ui"]` | VS Code deploys extension to **remote server** |

When you change `forceLocal` in a **remote** context, the extension updates `extensionKind` and prompts a VS Code **Reload**. After reload, VS Code reads the new `extensionKind` and runs the extension in the correct location.

For **local workspaces** (no remote connection), `extensionKind` is always `["ui", "workspace"]` regardless of the `forceLocal` setting -- no switching or reload needed.

**Important**: Set `forceLocal` at the **Workspace** scope (`Cmd+,` -> Workspace tab) so each project controls its own mode independently.

### 2.4 Mode Badge Indicator

In remote environments, a small badge appears next to the "New session" button in the Claude Code panel header:

| Badge | Meaning |
|-------|---------|
| **UI** | Remote + forceLocal ON -- extension runs **locally**, file ops proxied to remote |
| **Workspace** | Remote + forceLocal OFF -- extension runs on **remote server** |
| *(no badge)* | Local workspace -- no mode indicator needed |

The badge helps you quickly verify where the extension is actually running.

---

## 3. Installation

> **Important Notes:**
> 1. **VS Code version**: Requires a recent version of VS Code (1.99+, released April 2025 or later). Older versions (e.g. from October 2024) will fail to load the extension.
> 2. **Internet required for build**: The `npm run update` script downloads the official Claude Code VSIX (~50MB) from the VS Code Marketplace. You need internet access during the build step.

### Step 1: Clone the Repository

```bash
git clone <this-repo-url> ~/code/claude-code-vscode
cd ~/code/claude-code-vscode
```

### Step 2: Install Dependencies

```bash
npm install
```

This installs `js-beautify` and `adm-zip`, used by the auto-update script.

### Step 3: Build and Install

**Option A: Auto-update from official release (recommended)**

Downloads the pinned version (v2.1.71) of the official VSIX, extracts binaries and webview assets, beautifies the code, applies all patches automatically, and builds a new VSIX:

```bash
# Build + install in one step
npm run update -- --install

# Or specify a version
npm run update -- --version 2.1.71 --install
```

Other useful flags:

```bash
npm run update -- --dry-run          # Verify all patch anchors match, don't modify
npm run update -- --skip-download    # Use previously downloaded cache
npm run update -- --output ~/my.vsix # Custom output path
```

**Option B: Rebuild from local changes**

If you've modified `src/remote-tools.js` or patch files and want to re-apply patches without re-downloading:

```bash
npm run update -- --skip-download --install
```

### Step 4: Enable the Proposed API Flag

**Method A: Modify `argv.json` (Recommended -- persistent, works with app icon)**

1. Open VS Code
2. `Cmd+Shift+P` -> "Configure Runtime Arguments"
3. Add to `~/.vscode/argv.json`:

```jsonc
{
    // ... existing keys ...
    "enable-proposed-api": ["justimyhxu.claude-code-local"]
}
```

4. Restart VS Code.

**Method B: Command line flag (per-launch)**

```bash
code --enable-proposed-api justimyhxu.claude-code-local
```

Or add to `~/.zshrc`:

```bash
alias code='code --enable-proposed-api justimyhxu.claude-code-local'
```

---

## 4. Configuration

All settings are under `claudeCode` in VS Code settings. **Set mode-related settings at the Workspace scope** so each project is independent.

### 4.1 Core Settings

#### `claudeCode.forceLocal` (boolean, default: `false`)

**The mode switch.** Controls where the extension and CLI run.

| Value | Behavior |
|-------|----------|
| `true` | **Local Mode**: Extension + CLI run locally, file operations proxied to remote via MCP tools. For servers **without internet**. |
| `false` | **Remote Mode**: Extension + CLI run on remote server, identical to official extension. For servers **with internet**. |

When changed, the extension updates `extensionKind` in `package.json` and prompts a reload. Set this per **Workspace** so different projects can use different modes.

### 4.2 SSH Settings (Optional, Local Mode only)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `claudeCode.sshHost` | `string` | `""` | SSH host override. Auto-detected if empty. |
| `claudeCode.useSSHExec` | `boolean` | `false` | Use direct SSH instead of VS Code terminal. |
| `claudeCode.sshIdentityFile` | `string` | `""` | SSH private key path (when `useSSHExec` is true). |
| `claudeCode.sshExtraArgs` | `string[]` | `[]` | Extra SSH args (when `useSSHExec` is true). |

### 4.3 Diff Modes

Controls how file edits are presented (Local Mode only) via `claudeCode.forceLocalDiffMode` (default: `"auto"`):

#### Auto Mode (Default)

```jsonc
"claudeCode.forceLocalDiffMode": "auto"
```

- All MCP tools auto-approved -- no permission prompts.
- Edits applied immediately. Inline diffs in chat (red/green highlighting).
- Best for: fast iteration, experienced users.

#### Review Mode

```jsonc
"claudeCode.forceLocalDiffMode": "review"
```

- For `edit_file` and `write_file`, a diff tab opens before writing.
- You can modify the proposed content in the right-side editor.
- Click **Accept** to write, **Reject** or close the tab to cancel.
- Automatically bypassed when permission mode is `bypassPermissions` or `acceptEdits`.
- Best for: careful review, production codebases.

### 4.4 Example: Per-Workspace Settings

```jsonc
// .vscode/settings.json for a no-internet server project
{
    "claudeCode.forceLocal": true,
    "claudeCode.forceLocalDiffMode": "auto"
}
```

```jsonc
// .vscode/settings.json for a server with internet
{
    "claudeCode.forceLocal": false
}
```

---

## 5. Usage

### Scenario 1: Remote Server WITHOUT Internet

1. Connect to the remote server via VS Code Remote SSH.
2. Set `claudeCode.forceLocal: true` in **Workspace** settings.
3. If prompted, click **Reload** (extensionKind switches to prefer local).
4. Open Claude Code -- the extension runs locally, proxying file ops to the remote.
5. Log message: `forceLocal: CLI will run locally`.

### Scenario 2: Remote Server WITH Internet

1. Connect to the remote server via VS Code Remote SSH.
2. Ensure `claudeCode.forceLocal: false` in **Workspace** settings (this is the default).
3. If prompted, click **Reload** (extensionKind switches to prefer remote).
4. VS Code automatically deploys the extension (including Linux CLI) to the remote server.
5. Claude Code runs on the remote -- identical to the official extension.

### Scenario 3: Local Workspace (No Remote)

Works normally regardless of `forceLocal` setting. No special configuration needed.

---

## 6. Features

### 6.1 Multi-Platform CLI Binaries

The VSIX bundles CLI binaries for both platforms:

```
resources/native-binaries/
  darwin-arm64/claude    (175MB, macOS ARM64)
  linux-x64/claude       (213MB, Linux x86-64)
```

The official `wD6()` binary lookup function automatically selects the correct binary based on `process.platform` and `process.arch`.

### 6.2 MCP Proxy Tools (Local Mode only)

| Tool | VS Code API | Description |
|------|------------|-------------|
| `read_file` | `vscode.workspace.fs.readFile()` | Read files on the remote server with line numbers |
| `write_file` | `vscode.workspace.fs.writeFile()` | Write or create files on the remote server |
| `edit_file` | read + string replace + write | Find-and-replace editing on remote files |
| `glob` | `vscode.workspace.findFiles()` | Pattern-match files on the remote filesystem |
| `grep` | Hidden terminal + `rg` / `grep` | Search file contents on the remote server |
| `bash` | Hidden terminal + `bash -c` | Execute arbitrary commands on the remote server |

### 6.3 Write Cache

A 10-second TTL cache prevents stale reads from `vscode.workspace.fs` immediately after writes.

### 6.4 grep Fallback

The `grep` tool tries `rg` (ripgrep) first. If not installed on the remote server, it automatically falls back to `grep -rn`.

### 6.5 Terminal Mode with node-pty

When `claudeCode.useTerminal` is enabled, the CLI runs in a VS Code terminal backed by **node-pty** with proper PTY handling, 24-bit color, and correct resize.

### 6.6 Webview UI Parity

MCP tool names are transparently transformed to built-in names:
- `mcp__claude-vscode__read_file` renders as `Read filename`
- `mcp__claude-vscode__edit_file` renders as `Edit filename` with inline diff
- `mcp__claude-vscode__bash` renders with standard bash IN/OUT format

### 6.7 IDE Diagnostics Integration

PreToolUse/PostToolUse hooks detect new IDE errors after edits and inject `<ide_diagnostics>` feedback to Claude.

---

## 7. Known Limitations

| Limitation | Details |
|-----------|---------|
| **macOS ARM64 local only** | Local Mode requires macOS ARM64. The local CLI binary is Mach-O ARM64. |
| **Linux x64 remote only** | Remote Mode uses a Linux x86-64 binary. ARM64 Linux servers not yet supported. |
| **Glob line numbers wrap at 100** | Cosmetic issue in the original webview -- not introduced by this patch. |
| **API 403 telemetry errors** | CLI telemetry events get 403 errors (different extension ID). Non-functional. |
| **Extension version locked** | Based on v2.1.71. Use `npm run update` to auto-apply patches to newer versions. |
| **Reload required for mode switch** | Changing `forceLocal` requires a VS Code reload because `extensionKind` is a static manifest property. |

---

## 8. FAQ

### Why does the extension bundle its own CLI binary instead of using my installed Claude?

The CLI binary must match the extension version exactly -- the internal protocol between extension and CLI is version-locked. Using a different CLI version (e.g., one installed via `npm` or Homebrew) would cause protocol mismatches and silent failures. This is the same approach the official Claude Code extension uses.

If you want to save disk space, you can replace the binary with a symlink to your system Claude, but **only if the versions match exactly**:

```bash
# Only if your installed claude matches v2.1.71
ln -sf $(which claude) resources/native-binaries/darwin-arm64/claude
```

### I get `spawn ENOEXEC` when launching Claude Code

The CLI binary may not have been downloaded correctly. Run the build again:

```bash
npm run update -- --install
```

This re-downloads the official VSIX (which contains the CLI binaries) and rebuilds.

### Why do I need `--enable-proposed-api`?

In Local Mode, the extension runs on the UI side (your Mac) but needs to access remote files. VS Code's `resolvers` proposed API enables the FileSystemProvider registration needed for this. Without it, file operations may fail silently. This flag is not needed in Remote Mode.

### Can I use this with a Linux or Windows local machine?

Currently, Local Mode only supports **macOS ARM64** as the local machine (the bundled CLI is a Mach-O ARM64 binary). Remote Mode works on any platform since the Linux x64 CLI runs on the remote server.

### Does this work with VS Code forks (Cursor, Windsurf, etc.)?

It may work but is untested. The extension uses VS Code APIs extensively, so compatibility depends on how faithfully the fork implements those APIs. The `--enable-proposed-api` flag may not be available in all forks.

### How do I update when a new Claude Code version is released?

The default `npm run update` downloads the **pinned** version (v2.1.71) that all patches are tested against. To try a newer version, pass `--version` explicitly:

```bash
# Default: pinned v2.1.71 (patches guaranteed to apply)
node scripts/update.js --install

# Explicit newer version (patches may need updating)
node scripts/update.js --version 2.1.71 --install
```

If patches fail on a newer version, use `--dry-run` first to check which anchors need updating.

### The extension shows "extensionKind mismatch" and keeps asking to reload

This happens when you switch `forceLocal` and the extension needs to change where it runs. Click **Reload** once. If it persists, check that you're setting `forceLocal` at the **Workspace** scope (not User scope), as User-scope settings apply globally and can cause conflicts across different projects.

### File edits fail with "old_string not found" in Local Mode

This usually means the write cache is stale or there's a race condition. Try:
1. Save all open files in VS Code before editing
2. If the issue persists, the remote file may have been modified outside VS Code -- re-read the file first

---

## 9. Design Philosophy

### Why Two Modes in One Extension?

The official Claude Code extension only works when the remote server has internet. Many users work with servers behind firewalls (corporate, HPC, lab environments). Rather than maintaining two separate extensions, this patch adds a single `forceLocal` toggle that dynamically switches between local and remote execution via `extensionKind`.

### Why MCP Tools Instead of Modifying the CLI?

The CLI is a native binary. MCP (Model Context Protocol) is its official extension mechanism. By registering replacement tools via MCP, we work **with** the CLI's architecture.

### Why Proxy Through VS Code APIs?

VS Code Remote SSH maintains an authenticated, multiplexed SSH connection. `vscode.workspace.fs` transparently handles remote file operations through this connection. No separate SSH management needed.

### Why Monkey-Patch?

The extension ships as a single minified file. This project applies **21 surgical patches (13 patch files)** at specific function boundaries. The only wholly new code is `src/remote-tools.js` (~587 lines).

---

## 10. File Structure

```
claude-code-vscode/
|-- package.json                    # Extension manifest (modified)
|-- src/
|   '-- remote-tools.js            # 6 MCP proxy tools (NEW, ~587 lines)
|-- scripts/
|   |-- update.js                   # Auto-update entry point
|   |-- .beautifyrc.json            # js-beautify config
|   |-- lib/
|   |   |-- download.js             # VSIX download + extract
|   |   |-- beautify.js             # js-beautify wrapper
|   |   |-- patcher.js              # Core patching engine
|   |   |-- package-patcher.js      # package.json modifications
|   |   '-- vsix-builder.js         # VSIX packaging
|   '-- patches/
|       |-- index.js                # Patch registry + execution order
|       '-- patch-*.js              # 13 patch definition files (21 patches total)
|-- tests/
|   '-- test-patches.js             # 134 automated tests for all patches
|-- docs/
|   '-- TECHNICAL_BLOG.md           # Technical deep-dive article
'-- README.md                       # This file

# Generated by `npm run update` (not in repo):
# extension.js, webview/*, resources/*, claude-code-settings.schema.json
```

---

## 11. Changelog

### v2.1.71 (2026-03)
- **Upgraded base** from Claude Code v2.1.42 to v2.1.71
- **Auto-update pipeline**: `node scripts/update.js` downloads official VSIX, beautifies code, applies all 13 patch files (21 sub-patches) automatically, and builds installable VSIX
- **134 automated tests**: `tests/test-patches.js` covers patcher logic, detectVars validation, syntax checks, and cross-patch consistency
- **Fixed zod variable bug**: Minification renamed zod from `s` to module-level `e` in v2.1.71. Patch 08 updated accordingly
- **Patch 16 -- remote file open**: Clicking file links in webview chat now correctly opens remote files in forceLocal mode via `getRemoteUri()`
- **Custom theme**: Extension icons and UI rebranded from Claude orange to emerald green (`#10B981`) to visually distinguish from the official extension
- **Bilingual README**: Split into `README.md` (English) and `README.zh-CN.md` (Chinese) with language toggle links
- **FAQ section**: Added common questions and troubleshooting guide
- **Patch count**: 20 -> 21 sub-patches across 13 patch definition files
- **remoteExec debug logging**: Added "Claude Remote Exec" Output channel with detailed execution logs, probe-based terminal readiness check, and polling diagnostics
- **Patch 16 enhanced**: `openFile()` now falls back to `findFiles` for relative paths (e.g. `checkpoint.py`) in forceLocal mode when direct remote URI fails

---

## 12. License

This project is a **patch** of Anthropic's official Claude Code VS Code extension. The original extension is proprietary software owned by Anthropic PBC. This patch is intended for **personal use only** and is not affiliated with, endorsed by, or supported by Anthropic.

The original extension's license applies:
> Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined at https://code.claude.com/docs/en/legal-and-compliance.

The new code in `src/remote-tools.js` and the patch modifications are provided as-is for educational and personal use.
