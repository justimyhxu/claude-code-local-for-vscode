'use strict';

/**
 * Patch 13: UA6() terminal mode — use node-pty for local CLI in forceLocal mode.
 * Inserted after the progress notification and before the normal terminal creation.
 */
module.exports = {
    id: 'patch-13',
    name: 'UA6() terminal mode node-pty',

    appliedCheck: /forceLocal terminal: loaded node-pty/,

    anchor: {
        // AI6()/UA6() function that creates Claude terminal
        pattern: /^async function \w+\(\w+, \w+, \w+ = !0, \w+, \w+ = \[\], \w+\)/,
        context: /Claude Code launching/,
        hint: 'Terminal launcher function (AI6/UA6) with "Claude Code launching..." progress notification'
    },

    insertAt: {
        searchRange: 15,
        // After the progress notification block
        pattern: /return new Promise\(\(\w+\) => setTimeout\(\w+, 2000\)\)/,
        fallbackPattern: /Claude Code launching/,
        relation: 'after-block'
    },

    detectVars: (ctx) => {
        // Detect the vscode alias (C0 in current)
        const vscMatch = ctx.match(/(\w+)\.window\.withProgress\(/);
        // Detect the path module alias (Si in current)
        const pathMatch = ctx.match(/(\w+)\.join\(\w+\.extensionPath, "resources"/);
        // Detect params: v=logger, z=context, V=prompt, N=args, K=location
        const fnMatch = ctx.match(/async function \w+\((\w+), (\w+), \w+ = !0, (\w+), (\w+) = \[\], (\w+)\)/);
        return {
            vscAlias: vscMatch ? vscMatch[1] : 'C0',
            pathAlias: pathMatch ? pathMatch[1] : 'Si',
            logVar: fnMatch ? fnMatch[1] : 'v',
            ctxVar: fnMatch ? fnMatch[2] : 'z',
            promptVar: fnMatch ? fnMatch[3] : 'V',
            argsVar: fnMatch ? fnMatch[4] : 'N',
            locVar: fnMatch ? fnMatch[5] : 'K'
        };
    },

    generate: (vars) => `    // --- Patch 13: forceLocal terminal mode — use node-pty to run CLI locally ---
    if (isForceLocalMode()) {
        var _flCwd = getForceLocalCwd();
        var _flCliPath = wD6(${vars.ctxVar}) || ${vars.pathAlias}.join(${vars.ctxVar}.extensionPath, "resources", "native-binary", "claude");

        // Build CLI args: disallowed + allowed tools (MUST be space-separated, not comma)
        var _flCliArgs = [...${vars.argsVar},
            "--disallowed-tools", "Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "Bash", "NotebookEdit"
        ];
        var _flAllowed = [
            "mcp__claude-vscode__read_file",
            "mcp__claude-vscode__glob",
            "mcp__claude-vscode__grep",
            "mcp__claude-vscode__bash"
        ];
        var _flDiffMode = ${vars.vscAlias}.workspace.getConfiguration("claudeCode").get("forceLocalDiffMode", "auto");
        if (_flDiffMode !== "review") {
            _flAllowed.push("mcp__claude-vscode__write_file", "mcp__claude-vscode__edit_file");
        }
        _flCliArgs.push("--allowed-tools", ..._flAllowed);
        if (${vars.promptVar}) _flCliArgs.push(${vars.promptVar}); // append prompt if provided

        // Try to load node-pty from VS Code's bundled modules
        var _flNodePty = null;
        try {
            _flNodePty = require(require("path").join(${vars.vscAlias}.env.appRoot, "node_modules", "node-pty"));
            ${vars.logVar}.info("forceLocal terminal: loaded node-pty from VS Code");
        } catch (_e) {
            ${vars.logVar}.warn("forceLocal terminal: node-pty not available (" + _e.message + "), falling back to Python pty");
        }

        var _flWriteEmitter = new ${vars.vscAlias}.EventEmitter();
        var _flCloseEmitter = new ${vars.vscAlias}.EventEmitter();
        var _flPtyProc = null;

        var _flPty;
        if (_flNodePty) {
            // --- Primary: node-pty (correct PTY with TIOCSWINSZ, ONLCR, 24-bit color) ---
            _flPty = {
                onDidWrite: _flWriteEmitter.event,
                onDidClose: _flCloseEmitter.event,
                open: function(dims) {
                    var _env = Object.assign({}, process.env);
                    delete _env.CLAUDECODE;
                    _env.TERM = "xterm-256color";
                    _env.COLORTERM = "truecolor";
                    _env.FORCE_COLOR = "3";
                    _flPtyProc = _flNodePty.spawn(_flCliPath, _flCliArgs, {
                        name: "xterm-256color",
                        cols: dims ? dims.columns : 120,
                        rows: dims ? dims.rows : 30,
                        cwd: _flCwd,
                        env: _env
                    });

                    _flPtyProc.onData(function(data) {
                        _flWriteEmitter.fire(data);
                    });
                    _flPtyProc.onExit(function(e) {
                        _flWriteEmitter.fire("\\r\\n[Process exited with code " + (e.exitCode || 0) + "]\\r\\n");
                        _flCloseEmitter.fire(e.exitCode || 0);
                        _flPtyProc = null;
                    });
                },
                close: function() {
                    if (_flPtyProc) {
                        _flPtyProc.kill();
                    }
                },
                handleInput: function(data) {
                    if (_flPtyProc) {
                        _flPtyProc.write(data);
                    }
                },
                setDimensions: function(dims) {
                    if (_flPtyProc) {
                        _flPtyProc.resize(dims.columns, dims.rows);
                    }
                }
            };
        } else {
            // --- Fallback: Python pty wrapper (for environments without node-pty) ---
            var _flCp = require("child_process");
            var _flPyPty = \`
import pty, os, sys, select, signal, struct, fcntl, termios

pid, fd = pty.openpty()

try:
    cols = int(os.environ.get('COLUMNS', '120'))
    rows = int(os.environ.get('LINES', '30'))
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
except:
    pass

child = os.fork()
if child == 0:
    os.setsid()
    import tty
    tty.setraw(fd)
    os.dup2(fd, 0)
    os.dup2(fd, 1)
    os.dup2(fd, 2)
    os.close(fd)
    os.close(pid)
    os.execvp(sys.argv[1], sys.argv[1:])
else:
    os.close(fd)
    def handle_winch(signum, frame):
        try:
            cols = int(os.environ.get('COLUMNS', '120'))
            rows = int(os.environ.get('LINES', '30'))
            fcntl.ioctl(pid, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
            os.kill(child, signal.SIGWINCH)
        except:
            pass
    signal.signal(signal.SIGWINCH, handle_winch)
    try:
        while True:
            r, _, _ = select.select([pid, 0], [], [], 1)
            if pid in r:
                try:
                    data = os.read(pid, 4096)
                    if not data:
                        break
                    os.write(1, data)
                except OSError:
                    break
            if 0 in r:
                try:
                    data = os.read(0, 4096)
                    if not data:
                        break
                    os.write(pid, data)
                except OSError:
                    break
    except:
        pass
    try:
        os.kill(child, signal.SIGTERM)
    except:
        pass
    _, status = os.waitpid(child, 0)
    sys.exit(os.WEXITSTATUS(status) if os.WIFEXITED(status) else 1)
\`;
            _flPty = {
                onDidWrite: _flWriteEmitter.event,
                onDidClose: _flCloseEmitter.event,
                open: function(dims) {
                    var _env = Object.assign({}, process.env);
                    delete _env.CLAUDECODE;
                    _env.TERM = "xterm-256color";
                    _env.COLORTERM = "truecolor";
                    _env.FORCE_COLOR = "3";
                    if (dims) {
                        _env.COLUMNS = String(dims.columns);
                        _env.LINES = String(dims.rows);
                    }

                    _flPtyProc = _flCp.spawn("python3", ["-c", _flPyPty, _flCliPath].concat(_flCliArgs), {
                        cwd: _flCwd,
                        env: _env,
                        stdio: ["pipe", "pipe", "pipe"]
                    });

                    _flPtyProc.stdout.on("data", function(d) {
                        _flWriteEmitter.fire(d.toString());
                    });
                    _flPtyProc.stderr.on("data", function(d) {
                        _flWriteEmitter.fire(d.toString());
                    });
                    _flPtyProc.on("close", function(code) {
                        _flWriteEmitter.fire("\\r\\n[Process exited with code " + (code || 0) + "]\\r\\n");
                        _flCloseEmitter.fire(code || 0);
                    });
                    _flPtyProc.on("error", function(err) {
                        _flWriteEmitter.fire("\\r\\n[Error: " + err.message + "]\\r\\n");
                        _flCloseEmitter.fire(1);
                    });
                },
                close: function() {
                    if (_flPtyProc) {
                        _flPtyProc.kill("SIGTERM");
                        setTimeout(function() {
                            try { if (_flPtyProc && !_flPtyProc.killed) _flPtyProc.kill("SIGKILL"); } catch(e) {}
                        }, 3000);
                    }
                },
                handleInput: function(data) {
                    if (_flPtyProc && _flPtyProc.stdin && _flPtyProc.stdin.writable) {
                        _flPtyProc.stdin.write(data);
                    }
                },
                setDimensions: function(dims) {
                    if (_flPtyProc && _flPtyProc.pid) {
                        try { process.kill(_flPtyProc.pid, "SIGWINCH"); } catch(e) {}
                    }
                }
            };
        }

        let x = ${vars.locVar} === "beside" || ${vars.locVar} === void 0 ? {
                viewColumn: ${vars.vscAlias}.ViewColumn.Beside
            } : ${vars.locVar} === "window" ? {
                viewColumn: ${vars.vscAlias}.ViewColumn.One
            } : void 0;

        let j = ${vars.vscAlias}.window.createTerminal({
            name: process.env.CLAUDE_CODE_TERMINAL_TITLE || "Claude Code (Local)",
            pty: _flPty,
            iconPath: ${vars.vscAlias}.Uri.file(${vars.pathAlias}.join(${vars.ctxVar}.extensionPath, "resources", "claude-logo.svg")),
            location: x,
            isTransient: !0
        });

        j.show();
        if (${vars.locVar} === "window") await ${vars.vscAlias}.commands.executeCommand("workbench.action.moveEditorToNewWindow");
        ${vars.logVar}.info("forceLocal terminal: launched LOCAL CLI via " + (_flNodePty ? "node-pty" : "Python pty fallback") + ", cwd=" + _flCwd + ", cli=" + _flCliPath);
        return { terminal: j, claudeRunning: !0 };
    }
    // --- end Patch 13 (forceLocal early return above; normal path below) ---`
};
