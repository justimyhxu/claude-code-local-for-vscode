[English](README.md) | **中文**

# Claude Code VS Code -- 双模式（本地 + 远程）

> 一个扩展，两种模式：为无网络的服务器**本地运行** Claude Code，或为有网络的服务器**远程运行**——与官方扩展完全一致——由一个设置控制。

**基础版本**: Claude Code VS Code Extension v2.1.71 (Anthropic)
**平台**: macOS ARM64 + Linux x86-64（双平台二进制）
**状态**: 功能正常 -- 所有核心工具已验证通过

---

## 两种工作模式

本扩展通过 `claudeCode.forceLocal` 设置支持**本地**和**远程**两种执行模式：

| 模式 | `forceLocal` | 扩展运行位置 | CLI 运行位置 | 适用场景 |
|------|-------------|------------|------------|---------|
| **本地模式** | `true` | 你的 Mac（本地） | 你的 Mac（本地） | 远程服务器**没有互联网** |
| **远程模式** | `false` | 远程服务器 | 远程服务器（Linux） | 远程服务器**有互联网** — 与官方扩展一致 |

### 本地模式（`forceLocal: true`）

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

### 远程模式（`forceLocal: false`）

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

### 模式切换原理

扩展动态管理 `package.json` 中的 `extensionKind`：

| 环境 | `forceLocal` | `extensionKind` | 效果 |
|---|---|---|---|
| **本地工作区** | 任意 | `["ui", "workspace"]` | 始终本地运行 — 无需切换 |
| **远程** | `true` | `["ui", "workspace"]` | VS Code 在**本地/UI 侧**运行扩展 |
| **远程** | `false` | `["workspace", "ui"]` | VS Code 将扩展部署到**远程服务器** |

在**远程**环境中修改 `forceLocal` 时，扩展更新 `extensionKind` 并提示 VS Code **Reload**。Reload 后，VS Code 读取新的 `extensionKind` 并在正确的位置运行扩展。

对于**本地工作区**（无远程连接），`extensionKind` 始终为 `["ui", "workspace"]`，不受 `forceLocal` 设置影响——无需切换或 Reload。

**重要**：在**工作区**级别（`Cmd+,` -> 工作区 标签页）设置 `forceLocal`，这样每个项目可以独立控制自己的模式。

### 模式标识徽章

在远程环境中，Claude Code 面板标题栏的"New session"按钮旁会显示一个小徽章：

| 徽章 | 含义 |
|------|------|
| **UI** | 远程 + forceLocal ON — 扩展在**本地**运行，文件操作代理到远程 |
| **Workspace** | 远程 + forceLocal OFF — 扩展在**远程服务器**运行 |
| *（无徽章）* | 本地工作区 — 无需模式标识 |

徽章帮助你快速确认扩展的实际运行位置。

---

## 功能特性

### 多平台 CLI 二进制

VSIX 包含两个平台的 CLI 二进制文件：

```
resources/native-binaries/
  darwin-arm64/claude    （175MB，macOS ARM64）
  linux-x64/claude       （213MB，Linux x86-64）
```

官方的 `wD6()` 二进制查找函数根据 `process.platform` 和 `process.arch` 自动选择正确的二进制。

### 6 个 MCP 代理工具（仅本地模式）

| 工具 | VS Code API | 说明 |
|------|------------|------|
| `read_file` | `vscode.workspace.fs.readFile()` | 从远程服务器读取文件 |
| `write_file` | `vscode.workspace.fs.writeFile()` | 在远程服务器上写入文件 |
| `edit_file` | 读取 + 替换 + 写入 | 远程文件查找替换编辑 |
| `glob` | `vscode.workspace.findFiles()` | 远程文件模式匹配搜索 |
| `grep` | 隐藏终端 + `rg`/`grep` | 远程文件内容搜索 |
| `bash` | 隐藏终端 + `bash -c` | 远程命令执行 |

### 自动 / 审查差异模式（仅本地模式）

- **auto**（默认）：编辑自动批准并立即应用。聊天中显示内联差异。
- **review**：每次编辑前打开 VS Code 差异标签页，可在接受前修改内容。

## 前置要求

| 要求 | 详情 |
|------|------|
| **VS Code** | 版本 1.99 或更高 |
| **macOS ARM64 或 Linux x64** | 已打包双平台二进制。本地模式要求 macOS ARM64。 |
| **Claude Code 账户** | Anthropic API 密钥或 Claude Pro/Max/Team/Enterprise 订阅 |
| **Remote - SSH 扩展** | Microsoft 的 [Remote - SSH](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-ssh) |
| **Proposed API 标志** | VS Code 需启用 `--enable-proposed-api justimyhxu.claude-code-local` |

## 安装步骤

> **安装注意事项：**
> 1. **VS Code 版本**：需要较新版本的 VS Code（1.99+，2025 年 4 月或之后发布）。旧版本（如 2024 年 10 月的版本）无法加载本扩展。
> 2. **需要 Git LFS**：CLI 二进制文件（约 175MB + 213MB）使用 [Git LFS](https://git-lfs.github.com/) 存储。克隆后必须安装 Git LFS 并执行 `git lfs pull`，否则二进制文件只是几 KB 的 LFS 指针文件，无法正常运行。

### 第一步：克隆仓库

```bash
git clone <仓库地址> ~/code/claude-code-vscode
cd ~/code/claude-code-vscode
git lfs pull
```

### 第二步：安装依赖

```bash
npm install
```

安装 `js-beautify` 和 `adm-zip`，供自动更新脚本使用。

### 第三步：构建并安装

**方式 A：自动从官方版本更新（推荐）**

自动下载最新官方 VSIX，美化代码，应用所有 patch，打包并安装：

```bash
# 一步完成：构建 + 安装
npm run update -- --install

# 也可以指定版本
npm run update -- --version 2.1.70 --install
```

其他常用参数：

```bash
npm run update -- --dry-run          # 只验证 patch anchor 是否匹配，不修改文件
npm run update -- --skip-download    # 跳过下载，使用上次缓存
npm run update -- --output ~/my.vsix # 自定义输出路径
```

**方式 B：从 repo 文件重新打包（修改了本地代码时用）**

如果你改了 `src/remote-tools.js` 等 repo 文件，只需重新打包：

```bash
rm -rf /tmp/vsix-build
mkdir -p /tmp/vsix-build/extension/{src,webview,resources}

cp package.json extension.js CLAUDE.md /tmp/vsix-build/extension/
cp src/remote-tools.js /tmp/vsix-build/extension/src/
cp -r webview/* /tmp/vsix-build/extension/webview/
cp -r resources/* /tmp/vsix-build/extension/resources/

cat > /tmp/vsix-build/'[Content_Types].xml' << 'XMLEOF'
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".json" ContentType="application/json"/>
  <Default Extension=".js" ContentType="application/javascript"/>
  <Default Extension=".css" ContentType="text/css"/>
  <Default Extension=".png" ContentType="image/png"/>
  <Default Extension=".vsixmanifest" ContentType="text/xml"/>
</Types>
XMLEOF

cd /tmp/vsix-build && zip -r /tmp/claude-code-local.vsix .
code --install-extension /tmp/claude-code-local.vsix --force
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

## 配置说明

在**工作区**级别设置，让每个项目独立控制模式。

### 核心设置

#### `claudeCode.forceLocal`（布尔值，默认：`false`）

**模式开关。**

| 值 | 行为 |
|---|------|
| `true` | **本地模式**：扩展 + CLI 在本地运行，文件操作通过 MCP 工具代理到远程。适用于**无网络**的服务器。 |
| `false` | **远程模式**：扩展 + CLI 在远程运行，与官方扩展一致。适用于**有网络**的服务器。 |

修改后扩展自动更新 `extensionKind` 并提示 Reload。请在**工作区**级别设置，让不同项目使用不同模式。

#### `claudeCode.forceLocalDiffMode`（字符串，默认：`"auto"`）

控制文件编辑展示方式（仅本地模式）：

| 模式 | 行为 |
|------|------|
| `"auto"` | 编辑自动批准并立即应用。聊天中显示内联差异。 |
| `"review"` | 写入前打开差异标签页，可修改后接受或拒绝。 |

### 示例：按工作区配置

```jsonc
// 无网络服务器项目的 .vscode/settings.json
{
    "claudeCode.forceLocal": true
}
```

```jsonc
// 有网络服务器项目的 .vscode/settings.json
{
    "claudeCode.forceLocal": false
}
```

## 使用方法

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

## 文件结构

```
claude-code-vscode/
|-- package.json                    # 扩展清单（已修改）
|-- extension.js                    # 主扩展代码（21 个外科手术式补丁）
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
|   |-- test-patches.js             # 134 个自动化测试，覆盖所有 patch
|   '-- test-vscode-interactive.md  # 手动 VS Code 集成测试计划
|-- webview/
|   |-- index.js                    # Webview React UI（未修改）
|   '-- index.css                   # Webview 样式（未修改）
|-- resources/
|   |-- native-binaries/
|   |   |-- darwin-arm64/claude     # macOS ARM64 CLI（175MB）
|   |   '-- linux-x64/claude        # Linux x86-64 CLI（213MB）
|   |-- native-binary/claude        # 回退 CLI（macOS ARM64）
|   '-- claude-logo.png
|-- CLAUDE.md                       # 详细开发文档
'-- README.md                       # 本文件
```

## 常见问题

### 为什么扩展要自带 CLI 二进制文件，而不用我已安装的 Claude？

CLI 二进制必须与扩展版本严格匹配——扩展与 CLI 之间的内部协议是版本锁定的。使用不同版本的 CLI（如通过 `npm` 或 Homebrew 安装的）会导致协议不匹配和静默失败。这与官方 Claude Code 扩展的做法一致。

如果你想节省磁盘空间，可以用符号链接替代，但**版本必须完全一致**：

```bash
# 仅当你安装的 claude 版本与 v2.1.71 完全匹配时
ln -sf $(which claude) resources/native-binaries/darwin-arm64/claude
```

### 启动 Claude Code 时报 `spawn ENOEXEC`

CLI 二进制文件使用 Git LFS 存储。如果克隆时没有 LFS，二进制文件只是 134 字节的文本指针而非实际可执行文件。修复方法：

```bash
git lfs install
git lfs pull
```

然后重新构建并安装 VSIX。

### 为什么需要 `--enable-proposed-api`？

在本地模式下，扩展运行在 UI 侧（你的 Mac），但需要访问远程文件。VS Code 的 `resolvers` proposed API 用于启用 FileSystemProvider 注册。没有这个标志，文件操作可能会静默失败。远程模式不需要此标志。

### 可以在 Linux 或 Windows 本地机器上使用吗？

目前本地模式仅支持 **macOS ARM64** 作为本地机器（打包的 CLI 是 Mach-O ARM64 二进制）。远程模式可在任何平台使用，因为 Linux x64 CLI 在远程服务器上运行。

### 支持 VS Code 分支版本（Cursor、Windsurf 等）吗？

可能可以但未经测试。扩展大量使用 VS Code API，兼容性取决于分支对这些 API 的实现程度。`--enable-proposed-api` 标志在部分分支中可能不可用。

### 新版 Claude Code 发布后如何更新？

使用自动更新脚本，它会下载最新官方 VSIX，应用所有补丁，并重新构建：

```bash
node scripts/update.js --install
```

自动处理版本变更、代码压缩变化和补丁锚点调整。

### 扩展一直提示 "extensionKind mismatch" 要求重新加载

切换 `forceLocal` 后扩展需要改变运行位置时会出现此提示。点击 **Reload** 一次即可。如果反复出现，请检查是否在**工作区**级别（而非用户级别）设置了 `forceLocal`，因为用户级别设置会全局生效，可能在不同项目间产生冲突。

### 本地模式下文件编辑报 "old_string not found"

通常是写入缓存过期或存在竞态条件。尝试：
1. 编辑前先保存 VS Code 中所有打开的文件
2. 如果问题持续，可能是远程文件在 VS Code 外被修改——先重新读取文件

## 更新日志

### v0.3.0（2026-03）
- **基础版本升级**：从 Claude Code v2.1.42 升级到 v2.1.71
- **自动更新流水线**：`node scripts/update.js` 自动下载官方 VSIX、美化代码、应用所有 13 个 patch 文件（21 个子 patch）、构建可安装 VSIX
- **134 个自动化测试**：`tests/test-patches.js` 覆盖 patcher 逻辑、detectVars 验证、语法检查、跨 patch 一致性
- **修复 zod 变量 bug**：v2.1.71 中代码压缩将 zod 从 `s` 重命名为模块级 `e`，Patch 08 相应更新
- **Patch 16 — 远程文件打开**：forceLocal 模式下点击 webview 聊天中的文件链接现可通过 `getRemoteUri()` 正确打开远程文件
- **自定义主题**：扩展图标和 UI 从 Claude 橙色改为翡翠绿（`#10B981`），与官方扩展视觉区分
- **双语 README**：拆分为 `README.md`（英文）和 `README.zh-CN.md`（中文），顶部提供语言切换链接
- **常见问题**：新增 FAQ 章节，涵盖常见问题与故障排除
- **Patch 数量**：20 -> 21 个子 patch，分布在 13 个 patch 定义文件中

### v2.1.71 升级（2025-03）
- **基础版本升级**：从 Claude Code v2.1.42 升级到 v2.1.71
- **修复 zod 变量 bug**：代码压缩将 zod 从 `s` 重命名为模块级 `e`。
  Patch 08 现使用硬编码的 `e` 进行 MCP 工具注册。
- **新增 Patch 16**：`openFile()` 远程文件打开 -- 在 forceLocal 模式下点击 webview
  聊天中的文件链接现在可以正确打开远程文件。
- **新增测试套件**：`tests/test-patches.js` 包含 134 个自动化测试，覆盖所有 patch
  （patcher 逻辑、detectVars 验证、语法检查、跨 patch 一致性）。
- **Patch 数量**：20 -> 21 个子 patch，分布在 13 个 patch 定义文件中。

## 许可声明

本项目是对 Anthropic 官方 Claude Code VS Code 扩展的**补丁**。原始扩展是 Anthropic PBC 拥有的专有软件。本补丁仅供**个人使用**，与 Anthropic 无关联、未经其认可或支持。

`src/remote-tools.js` 中的新代码和补丁修改按原样提供，仅供教育和个人使用。
