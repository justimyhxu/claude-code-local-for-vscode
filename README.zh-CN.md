[English](README.md) | **中文**

# Claude Code VS Code -- 双模式（本地 + 远程）

> 一个扩展，两种模式：为无网络的服务器**本地运行** Claude Code，或为有网络的服务器**远程运行**——与官方扩展完全一致——由一个设置控制。

**基础版本**: Claude Code VS Code Extension v2.1.71 (Anthropic)
**平台**: macOS ARM64 + Linux x86-64（双平台二进制）
**状态**: 功能正常 -- 所有核心工具已验证通过

---

## 目录

1. [快速开始](#1-快速开始)
2. [两种工作模式](#2-两种工作模式)
3. [安装步骤](#3-安装步骤)
4. [配置说明](#4-配置说明)
5. [使用方法](#5-使用方法)
6. [功能特性](#6-功能特性)
7. [已知限制](#7-已知限制)
8. [常见问题](#8-常见问题)
9. [设计理念](#9-设计理念)
10. [文件结构](#10-文件结构)
11. [更新日志](#11-更新日志)
12. [许可声明](#12-许可声明)

---

## 1. 快速开始

```bash
# 1. 克隆仓库
git clone <仓库地址> ~/code/claude-code-vscode
cd ~/code/claude-code-vscode

# 2. 安装依赖 + 下载官方 VSIX + 应用补丁 + 构建 + 安装
npm install
npm run update -- --install

# 3. 启用 Proposed API（一次性设置）
#    Cmd+Shift+P -> "Configure Runtime Arguments" -> 在 ~/.vscode/argv.json 中添加：
#    { "enable-proposed-api": ["justimyhxu.claude-code-local"] }

# 4. 在工作区设置中选择模式（Cmd+, -> 工作区 标签页）
#    claudeCode.forceLocal: true   （无网络服务器）
#    claudeCode.forceLocal: false  （服务器有网络，默认值）
```

详细步骤和故障排除请参阅[安装步骤](#3-安装步骤)。

---

## 2. 两种工作模式

本扩展通过 `claudeCode.forceLocal` 设置支持**本地**和**远程**两种执行模式：

| 模式 | `forceLocal` | 扩展运行位置 | CLI 运行位置 | 适用场景 |
|------|-------------|------------|------------|---------|
| **本地模式** | `true` | 你的 Mac（本地） | 你的 Mac（本地） | 远程服务器**没有互联网** |
| **远程模式** | `false` | 远程服务器 | 远程服务器（Linux） | 远程服务器**有互联网** — 与官方扩展一致 |

### 2.1 本地模式（`forceLocal: true`）

```
本地机器（有互联网）                       远程服务器（无互联网，有文件）
+-----------------------------+           +--------------------------+
|  VS Code UI                 |           |  远程文件系统             |
|  扩展宿主（本地运行）         |           |  /home/user/project/     |
|    |-- CLI（macOS 二进制）   |           |                          |
|    |-- 6 个 MCP 代理工具 ----|--vscode-->|  读取、写入、编辑等       |
|    '-- 隐藏终端 ------------|--vscode-->|  bash、grep（通过终端）   |
+-----------------------------+           +--------------------------+

CLI 使用本地网络调用 Anthropic API。
文件操作通过 VS Code 的 SSH 连接代理到远程。
```

- CLI 的 8 个内置文件工具被**禁用**。6 个替代 MCP 工具通过 VS Code 远程文件系统 API 代理操作到远程。
- 远程服务器无需安装任何额外软件。
- 在**工作区**设置中设置 `forceLocal: true`。

### 2.2 远程模式（`forceLocal: false`）

```
本地机器                                   远程服务器（有互联网 + 有文件）
+-----------------------------+           +--------------------------+
|  VS Code UI（瘦客户端）      |<--------->|  VS Code Server          |
|                             |           |  扩展宿主（远程运行）     |
|                             |           |    |-- CLI（Linux 二进制） |
|                             |           |    '-- 标准工具          |
+-----------------------------+           +--------------------------+

一切在远程服务器上运行 — 与官方 Claude Code 完全一致。
```

- 扩展行为与官方 Claude Code 扩展 **100% 一致**。所有 21 个补丁都通过 `isForceLocalMode()` 守卫，在此模式下零影响。
- Linux x64 CLI 二进制已打包并自动选择。
- 在**工作区**设置中设置 `forceLocal: false`（或保持默认）。

### 2.3 模式切换原理

扩展动态管理 `package.json` 中的 `extensionKind`：

| 环境 | `forceLocal` | `extensionKind` | 效果 |
|---|---|---|---|
| **本地工作区** | 任意 | `["ui", "workspace"]` | 始终本地运行 — 无需切换 |
| **远程** | `true` | `["ui", "workspace"]` | VS Code 在**本地/UI 侧**运行扩展 |
| **远程** | `false` | `["workspace", "ui"]` | VS Code 将扩展部署到**远程服务器** |

在**远程**环境中修改 `forceLocal` 时，扩展更新 `extensionKind` 并提示 VS Code **Reload**。Reload 后，VS Code 读取新的 `extensionKind` 并在正确的位置运行扩展。

对于**本地工作区**（无远程连接），`extensionKind` 始终为 `["ui", "workspace"]`，不受 `forceLocal` 设置影响——无需切换或 Reload。

**重要**：在**工作区**级别（`Cmd+,` -> 工作区 标签页）设置 `forceLocal`，这样每个项目可以独立控制自己的模式。

### 2.4 模式标识徽章

在远程环境中，Claude Code 面板标题栏的"New session"按钮旁会显示一个小徽章：

| 徽章 | 含义 |
|------|------|
| **UI** | 远程 + forceLocal ON — 扩展在**本地**运行，文件操作代理到远程 |
| **Workspace** | 远程 + forceLocal OFF — 扩展在**远程服务器**运行 |
| *（无徽章）* | 本地工作区 — 无需模式标识 |

徽章帮助你快速确认扩展的实际运行位置。

---

## 3. 安装步骤

> **安装注意事项：**
> 1. **VS Code 版本**：需要较新版本的 VS Code（1.99+，2025 年 4 月或之后发布）。旧版本（如 2024 年 10 月的版本）无法加载本扩展。
> 2. **构建时需要网络**：`npm run update` 脚本会从 VS Code 商店下载官方 Claude Code VSIX（约 50MB）。构建步骤需要网络访问。

### 第一步：克隆仓库

```bash
git clone <仓库地址> ~/code/claude-code-vscode
cd ~/code/claude-code-vscode
```

### 第二步：安装依赖

```bash
npm install
```

安装 `js-beautify` 和 `adm-zip`，供自动更新脚本使用。

### 第三步：构建并安装

**方式 A：自动从官方版本更新（推荐）**

自动下载固定版本（v2.1.71）的官方 VSIX，提取二进制和 webview 资源，美化代码，应用所有 patch，打包并安装：

```bash
# 一步完成：构建 + 安装
npm run update -- --install

# 也可以指定版本
npm run update -- --version 2.1.71 --install
```

其他常用参数：

```bash
npm run update -- --dry-run          # 只验证 patch anchor 是否匹配，不修改文件
npm run update -- --skip-download    # 跳过下载，使用上次缓存
npm run update -- --output ~/my.vsix # 自定义输出路径
```

**方式 B：从本地修改重新构建**

如果你改了 `src/remote-tools.js` 或 patch 文件，想重新应用补丁而不重新下载：

```bash
npm run update -- --skip-download --install
```

### 第四步：启用 Proposed API 标志

**方法 A：修改 `argv.json`（推荐 — 永久生效）**

`Cmd+Shift+P` -> "Configure Runtime Arguments"，在 `~/.vscode/argv.json` 中添加：

```jsonc
{
    "enable-proposed-api": ["justimyhxu.claude-code-local"]
}
```

**方法 B：命令行标志**

```bash
code --enable-proposed-api justimyhxu.claude-code-local
```

---

## 4. 配置说明

在**工作区**级别设置，让每个项目独立控制模式。

### 4.1 核心设置

#### `claudeCode.forceLocal`（布尔值，默认：`false`）

**模式开关。**

| 值 | 行为 |
|---|------|
| `true` | **本地模式**：扩展 + CLI 在本地运行，文件操作通过 MCP 工具代理到远程。适用于**无网络**的服务器。 |
| `false` | **远程模式**：扩展 + CLI 在远程运行，与官方扩展一致。适用于**有网络**的服务器。 |

修改后扩展自动更新 `extensionKind` 并提示 Reload。请在**工作区**级别设置，让不同项目使用不同模式。

### 4.2 SSH 设置（可选，仅本地模式）

| 设置 | 类型 | 默认值 | 说明 |
|------|-----|--------|------|
| `claudeCode.sshHost` | `string` | `""` | SSH 主机覆盖。留空则自动检测。 |
| `claudeCode.useSSHExec` | `boolean` | `false` | 使用直接 SSH 而非 VS Code 终端。 |
| `claudeCode.sshIdentityFile` | `string` | `""` | SSH 私钥路径（`useSSHExec` 为 true 时）。 |
| `claudeCode.sshExtraArgs` | `string[]` | `[]` | 额外 SSH 参数（`useSSHExec` 为 true 时）。 |

### 4.3 差异模式

通过 `claudeCode.forceLocalDiffMode`（默认：`"auto"`）控制文件编辑展示方式（仅本地模式）：

#### 自动模式（默认）

```jsonc
"claudeCode.forceLocalDiffMode": "auto"
```

- 所有 MCP 工具自动批准 — 无权限提示。
- 编辑立即应用。聊天中显示内联差异（红/绿高亮）。
- 适合：快速迭代、有经验的用户。

#### 审查模式

```jsonc
"claudeCode.forceLocalDiffMode": "review"
```

- `edit_file` 和 `write_file` 写入前打开差异标签页。
- 可在右侧编辑器中修改建议内容。
- 点击 **Accept** 写入，**Reject** 或关闭标签页取消。
- 权限模式为 `bypassPermissions` 或 `acceptEdits` 时自动跳过。
- 适合：仔细审查、生产代码库。

### 4.4 示例：按工作区配置

```jsonc
// 无网络服务器项目的 .vscode/settings.json
{
    "claudeCode.forceLocal": true,
    "claudeCode.forceLocalDiffMode": "auto"
}
```

```jsonc
// 有网络服务器项目的 .vscode/settings.json
{
    "claudeCode.forceLocal": false
}
```

---

## 5. 使用方法

### 场景 1：远程服务器无互联网

1. 通过 VS Code Remote SSH 连接远程服务器
2. 在**工作区**设置中启用 `claudeCode.forceLocal: true`
3. 如提示，点击 **Reload**
4. Claude Code 在本地运行，文件操作代理到远程
5. 日志显示：`forceLocal: CLI will run locally`

### 场景 2：远程服务器有互联网

1. 通过 VS Code Remote SSH 连接远程服务器
2. 确保**工作区**设置中 `claudeCode.forceLocal: false`（默认值）
3. 如提示，点击 **Reload**
4. VS Code 自动将扩展（含 Linux CLI）部署到远程
5. Claude Code 在远程运行 — 与官方扩展完全一致

### 场景 3：本地工作区

无需特殊配置，正常使用即可。

---

## 6. 功能特性

### 6.1 多平台 CLI 二进制

VSIX 包含两个平台的 CLI 二进制文件：

```
resources/native-binaries/
  darwin-arm64/claude    （175MB，macOS ARM64）
  linux-x64/claude       （213MB，Linux x86-64）
```

官方的 `wD6()` 二进制查找函数根据 `process.platform` 和 `process.arch` 自动选择正确的二进制。

### 6.2 MCP 代理工具（仅本地模式）

| 工具 | VS Code API | 说明 |
|------|------------|------|
| `read_file` | `vscode.workspace.fs.readFile()` | 从远程服务器读取文件 |
| `write_file` | `vscode.workspace.fs.writeFile()` | 在远程服务器上写入文件 |
| `edit_file` | 读取 + 替换 + 写入 | 远程文件查找替换编辑 |
| `glob` | `vscode.workspace.findFiles()` | 远程文件模式匹配搜索 |
| `grep` | 隐藏终端 + `rg`/`grep` | 远程文件内容搜索 |
| `bash` | 隐藏终端 + `bash -c` | 远程命令执行 |

### 6.3 写入缓存

10 秒 TTL 缓存防止写入后立即从 `vscode.workspace.fs` 读取到过期内容。

### 6.4 grep 回退

`grep` 工具优先使用 `rg`（ripgrep）。如果远程服务器未安装，自动回退到 `grep -rn`。

### 6.5 终端模式与 node-pty

启用 `claudeCode.useTerminal` 时，CLI 在 VS Code 终端中运行，由 **node-pty** 提供 PTY 支持，具备 24 位色彩和正确的窗口调整。

### 6.6 Webview UI 一致性

MCP 工具名称透明转换为内置名称：
- `mcp__claude-vscode__read_file` 显示为 `Read filename`
- `mcp__claude-vscode__edit_file` 显示为 `Edit filename`（含内联差异）
- `mcp__claude-vscode__bash` 使用标准 bash IN/OUT 格式显示

### 6.7 IDE 诊断集成

PreToolUse/PostToolUse 钩子在编辑后检测新的 IDE 错误，并向 Claude 注入 `<ide_diagnostics>` 反馈。

---

## 7. 已知限制

| 限制 | 详情 |
|------|------|
| **仅支持 macOS ARM64 本地** | 本地模式要求 macOS ARM64。本地 CLI 二进制为 Mach-O ARM64。 |
| **仅支持 Linux x64 远程** | 远程模式使用 Linux x86-64 二进制。暂不支持 ARM64 Linux 服务器。 |
| **Glob 行号在 100 处换行** | 原始 webview 的外观问题 — 非本补丁引入。 |
| **API 403 遥测错误** | CLI 遥测事件返回 403 错误（不同的扩展 ID）。不影响功能。 |
| **扩展版本锁定** | 基于 v2.1.71。使用 `npm run update` 自动将补丁应用到新版本。 |
| **模式切换需要重新加载** | 修改 `forceLocal` 需要 VS Code 重新加载，因为 `extensionKind` 是静态清单属性。 |

---

## 8. 常见问题

### 为什么扩展要自带 CLI 二进制文件，而不用我已安装的 Claude？

CLI 二进制必须与扩展版本严格匹配——扩展与 CLI 之间的内部协议是版本锁定的。使用不同版本的 CLI（如通过 `npm` 或 Homebrew 安装的）会导致协议不匹配和静默失败。这与官方 Claude Code 扩展的做法一致。

如果你想节省磁盘空间，可以用符号链接替代，但**版本必须完全一致**：

```bash
# 仅当你安装的 claude 版本与 v2.1.71 完全匹配时
ln -sf $(which claude) resources/native-binaries/darwin-arm64/claude
```

### 启动 Claude Code 时报 `spawn ENOEXEC`

CLI 二进制可能没有正确下载。重新构建即可：

```bash
npm run update -- --install
```

这会重新下载官方 VSIX（包含 CLI 二进制）并重新构建。

### 为什么需要 `--enable-proposed-api`？

在本地模式下，扩展运行在 UI 侧（你的 Mac），但需要访问远程文件。VS Code 的 `resolvers` proposed API 用于启用 FileSystemProvider 注册。没有这个标志，文件操作可能会静默失败。远程模式不需要此标志。

### 可以在 Linux 或 Windows 本地机器上使用吗？

目前本地模式仅支持 **macOS ARM64** 作为本地机器（打包的 CLI 是 Mach-O ARM64 二进制）。远程模式可在任何平台使用，因为 Linux x64 CLI 在远程服务器上运行。

### 支持 VS Code 分支版本（Cursor、Windsurf 等）吗？

可能可以但未经测试。扩展大量使用 VS Code API，兼容性取决于分支对这些 API 的实现程度。`--enable-proposed-api` 标志在部分分支中可能不可用。

### 新版 Claude Code 发布后如何更新？

默认的 `npm run update` 会下载**固定版本**（v2.1.71），所有补丁均基于此版本测试。要尝试更新的版本，请显式传入 `--version`：

```bash
# 默认：固定版本 v2.1.71（补丁保证可应用）
node scripts/update.js --install

# 显式指定新版本（补丁可能需要更新）
node scripts/update.js --version 2.1.71 --install
```

如果补丁在新版本上失败，可先用 `--dry-run` 检查哪些锚点需要更新。

### 扩展一直提示 "extensionKind mismatch" 要求重新加载

切换 `forceLocal` 后扩展需要改变运行位置时会出现此提示。点击 **Reload** 一次即可。如果反复出现，请检查是否在**工作区**级别（而非用户级别）设置了 `forceLocal`，因为用户级别设置会全局生效，可能在不同项目间产生冲突。

### 本地模式下文件编辑报 "old_string not found"

通常是写入缓存过期或存在竞态条件。尝试：
1. 编辑前先保存 VS Code 中所有打开的文件
2. 如果问题持续，可能是远程文件在 VS Code 外被修改——先重新读取文件

---

## 9. 设计理念

### 为什么将两种模式合并到一个扩展中？

官方 Claude Code 扩展仅在远程服务器有互联网时才能使用。许多用户的服务器位于防火墙之后（企业、HPC、实验室环境）。与其维护两个独立扩展，不如通过 `forceLocal` 开关在本地和远程执行之间动态切换 `extensionKind`。

### 为什么用 MCP 工具而不是修改 CLI？

CLI 是原生二进制文件。MCP（模型上下文协议）是其官方扩展机制。通过 MCP 注册替代工具，我们**顺应** CLI 的架构设计。

### 为什么通过 VS Code API 代理？

VS Code Remote SSH 维护着经过认证的多路复用 SSH 连接。`vscode.workspace.fs` 通过此连接透明地处理远程文件操作。无需额外的 SSH 管理。

### 为什么用猴子补丁？

扩展以单个压缩文件发布。本项目在特定函数边界应用 **21 个外科手术式补丁（13 个 patch 文件）**。唯一全新的代码是 `src/remote-tools.js`（约 587 行）。

---

## 10. 文件结构

```
claude-code-vscode/
|-- package.json                    # 扩展清单（已修改）
|-- src/
|   '-- remote-tools.js            # 6 个 MCP 代理工具（新文件，约 587 行）
|-- scripts/
|   |-- update.js                   # 自动更新入口
|   |-- .beautifyrc.json            # js-beautify 配置
|   |-- lib/
|   |   |-- download.js             # VSIX 下载 + 解压
|   |   |-- beautify.js             # js-beautify 封装
|   |   |-- patcher.js              # 核心 patching 引擎
|   |   |-- package-patcher.js      # package.json 修改
|   |   '-- vsix-builder.js         # VSIX 打包
|   '-- patches/
|       |-- index.js                # patch 注册表 + 执行顺序
|       '-- patch-*.js              # 13 个 patch 定义文件（共 21 个 patch）
|-- tests/
|   '-- test-patches.js             # 134 个自动化测试，覆盖所有 patch
|-- docs/
|   '-- TECHNICAL_BLOG.md           # 技术深度解析文章
'-- README.md                       # 本文件

# 由 `npm run update` 生成（不在 repo 中）：
# extension.js, webview/*, resources/*, claude-code-settings.schema.json
```

---

## 11. 更新日志

### v2.1.71（2026-03）
- **基础版本升级**：从 Claude Code v2.1.42 升级到 v2.1.71
- **自动更新流水线**：`node scripts/update.js` 自动下载官方 VSIX、美化代码、应用所有 13 个 patch 文件（21 个子 patch）、构建可安装 VSIX
- **134 个自动化测试**：`tests/test-patches.js` 覆盖 patcher 逻辑、detectVars 验证、语法检查、跨 patch 一致性
- **修复 zod 变量 bug**：v2.1.71 中代码压缩将 zod 从 `s` 重命名为模块级 `e`，Patch 08 相应更新
- **Patch 16 — 远程文件打开**：forceLocal 模式下点击 webview 聊天中的文件链接现可通过 `getRemoteUri()` 正确打开远程文件
- **自定义主题**：扩展图标和 UI 从 Claude 橙色改为翡翠绿（`#10B981`），与官方扩展视觉区分
- **双语 README**：拆分为 `README.md`（英文）和 `README.zh-CN.md`（中文），顶部提供语言切换链接
- **常见问题**：新增 FAQ 章节，涵盖常见问题与故障排除
- **Patch 数量**：20 -> 21 个子 patch，分布在 13 个 patch 定义文件中
- **remoteExec 调试日志**：新增 "Claude Remote Exec" Output channel，包含详细执行日志、基于探针的终端就绪检查和轮询诊断信息
- **Patch 16 增强**：forceLocal 模式下 `openFile()` 对相对路径（如 `checkpoint.py`）新增 `findFiles` 回退，当直接远程 URI 失败时自动搜索工作区

---

## 12. 许可声明

本项目是对 Anthropic 官方 Claude Code VS Code 扩展的**补丁**。原始扩展是 Anthropic PBC 拥有的专有软件。本补丁仅供**个人使用**，与 Anthropic 无关联、未经其认可或支持。

`src/remote-tools.js` 中的新代码和补丁修改按原样提供，仅供教育和个人使用。
