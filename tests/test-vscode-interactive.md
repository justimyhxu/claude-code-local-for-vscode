# Interactive VS Code Test Cases

## Pre-check: Reload VS Code first
Cmd+Shift+P → "Developer: Reload Window"

## Step 0: Check Output Panel
1. Open Output panel (Cmd+Shift+U)
2. Select "Claude Code" channel
3. Search for these log lines:

Expected SUCCESS:
```
forceLocal: registered remote tools on in-process MCP server. Tools: 6
forceLocal: CLI will run locally, built-in file tools disabled, MCP hooks added
```

Expected FAILURE (the bug we fixed):
```
forceLocal: FAILED to register remote tools on in-process MCP server: s.string is not a function
```

## Step 1-7: Paste each prompt below into Claude Code chat

---

### Test 1: read_file
Prompt:
```
read the file /etc/hostname and show me its content
```
Expected: File content displayed, tool shows as "Read /etc/hostname"
Fail: Agent/WebFetch fallback, or "tool not found" error

---

### Test 2: bash
Prompt:
```
run `uname -a` and `pwd` and show me the output
```
Expected: Linux kernel info + remote working directory path
Fail: Shows local macOS info, or command fails

---

### Test 3: glob
Prompt:
```
list all .py files in the current directory (just use glob, don't use bash)
```
Expected: Tool shows as "Glob **/*.py", lists remote .py files
Fail: Shows "Claude-vscode [glob]" or no results

---

### Test 4: grep
Prompt:
```
search for "import torch" in all .py files in the current directory
```
Expected: Tool shows as "Grep", search results with line numbers
Fail: rg/grep command not found, or falls back to bash

---

### Test 5: write_file
Prompt:
```
create a file /tmp/claude-test-write.txt with content "hello from claude code local mode"
```
Expected: Tool shows as "Write /tmp/claude-test-write.txt", file created
Fail: Permission error or MCP tool not found

---

### Test 6: edit_file
Prompt:
```
read /tmp/claude-test-write.txt, then edit it to replace "hello" with "goodbye"
```
Expected: Tool shows as "Edit /tmp/claude-test-write.txt" with inline diff
Fail: "old_string not found" or MCP error

---

### Test 7: cleanup
Prompt:
```
delete /tmp/claude-test-write.txt using bash
```
Expected: File removed via Bash tool
