'use strict';

/**
 * Core patching engine.
 *
 * Each patch definition has:
 *   id         - unique identifier (e.g. "patch-01")
 *   name       - human-readable description
 *   appliedCheck - regex; if matches anywhere in file, skip (idempotent)
 *   anchor     - { pattern, context? } to find the target region
 *   insertAt   - { searchRange, pattern, fallbackPattern?, relation }
 *                 relation: "before" | "after" | "replace" | "after-block" |
 *                           "replace-region" | "wrap"
 *   detectVars - function(contextLines) => { varName: 'actualName', ... }
 *   generate   - function(vars) => string (the patch code to insert)
 *
 *   For "replace" relation:
 *     replacePattern - regex matching the line(s) to replace
 *     or replaceLines - number of lines to replace from the matched point
 *
 *   For "replace-region" relation:
 *     regionEnd - regex marking end of region to replace
 *
 *   For "wrap" relation:
 *     wrapEnd - regex marking end of block to wrap
 *     wrapBefore - function(vars) => string (code before the wrapped block)
 *     wrapAfter  - function(vars) => string (code after the wrapped block)
 */

function findLineNumber(lines, pattern, startLine, endLine) {
    startLine = Math.max(0, startLine || 0);
    endLine = Math.min(lines.length, endLine || lines.length);
    for (let i = startLine; i < endLine; i++) {
        if (pattern.test(lines[i])) return i;
    }
    return -1;
}

function findClosingBrace(lines, startLine) {
    let depth = 0;
    let inSingleQuote = false, inDoubleQuote = false, inTemplateLit = false;
    let inLineComment = false, inBlockComment = false;
    let escaped = false;

    for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];
        inLineComment = false;
        for (let j = 0; j < line.length; j++) {
            const ch = line[j];
            const prevCh = j > 0 ? line[j - 1] : '';

            if (escaped) { escaped = false; continue; }
            if (ch === '\\' && (inSingleQuote || inDoubleQuote || inTemplateLit)) {
                escaped = true; continue;
            }

            if (inBlockComment) {
                if (ch === '/' && prevCh === '*') inBlockComment = false;
                continue;
            }
            if (inLineComment) continue;
            if (inSingleQuote) {
                if (ch === "'") inSingleQuote = false;
                continue;
            }
            if (inDoubleQuote) {
                if (ch === '"') inDoubleQuote = false;
                continue;
            }
            if (inTemplateLit) {
                if (ch === '`') inTemplateLit = false;
                else if (ch === '{' && prevCh === '$') depth++;
                continue;
            }

            if (ch === '/' && j + 1 < line.length) {
                if (line[j + 1] === '/') { inLineComment = true; continue; }
                if (line[j + 1] === '*') { inBlockComment = true; continue; }
            }
            if (ch === "'") { inSingleQuote = true; continue; }
            if (ch === '"') { inDoubleQuote = true; continue; }
            if (ch === '`') { inTemplateLit = true; continue; }

            if (ch === '{') depth++;
            if (ch === '}') {
                depth--;
                if (depth === 0) return i;
            }
        }
    }
    return -1;
}

function getContext(lines, anchorLine, range) {
    const start = Math.max(0, anchorLine - range);
    const end = Math.min(lines.length, anchorLine + range);
    return lines.slice(start, end).join('\n');
}

function applyPatch(code, patchDef, dryRun) {
    const lines = code.split('\n');
    const result = {
        id: patchDef.id,
        name: patchDef.name,
        success: false,
        skipped: false,
        line: null,
        message: ''
    };

    // Check if already applied
    if (patchDef.appliedCheck) {
        if (patchDef.appliedCheck.test(code)) {
            result.skipped = true;
            result.success = true;
            result.message = 'Already applied (skipped)';
            return { code, result };
        }
    }

    // Find anchor — iterate through matches until context passes
    let anchorLine = -1;
    const ctxRange = patchDef.anchor.contextRange || 15;
    if (patchDef.anchor.context) {
        let searchFrom = 0;
        while (true) {
            const matchLine = findLineNumber(lines, patchDef.anchor.pattern, searchFrom);
            if (matchLine === -1) break;
            const ctx = getContext(lines, matchLine, ctxRange);
            if (patchDef.anchor.context.test(ctx)) {
                anchorLine = matchLine;
                break;
            }
            searchFrom = matchLine + 1;
        }
    } else {
        anchorLine = findLineNumber(lines, patchDef.anchor.pattern);
    }
    if (anchorLine === -1) {
        result.message = `Anchor not found: ${patchDef.anchor.pattern}`;
        if (patchDef.anchor.hint) result.message += `\n  Hint: ${patchDef.anchor.hint}`;
        return { code, result };
    }

    // Find insertion point
    const range = patchDef.insertAt.searchRange || 50;
    const searchStart = Math.max(0, anchorLine - range);
    const searchEnd = Math.min(lines.length, anchorLine + range);

    let insertLine = -1;
    const insertPattern = patchDef.insertAt.pattern;

    if (insertPattern) {
        insertLine = findLineNumber(lines, insertPattern, searchStart, searchEnd);
        if (insertLine === -1 && patchDef.insertAt.fallbackPattern) {
            insertLine = findLineNumber(lines, patchDef.insertAt.fallbackPattern, searchStart, searchEnd);
        }
    } else {
        insertLine = anchorLine;
    }

    if (insertLine === -1) {
        result.message = `Insert point not found near anchor (line ${anchorLine + 1}): ${insertPattern}`;
        return { code, result };
    }

    // Detect variable names from context
    const contextText = getContext(lines, anchorLine, patchDef.insertAt.contextRange || 100);
    const vars = patchDef.detectVars ? patchDef.detectVars(contextText) : {};

    if (dryRun) {
        result.success = true;
        result.line = insertLine + 1;
        result.message = `Dry run: anchor at line ${anchorLine + 1}, insert at line ${insertLine + 1}`;
        result.vars = vars;
        return { code, result };
    }

    // Generate patch code
    const patchCode = patchDef.generate(vars);

    // Apply based on relation
    const relation = patchDef.insertAt.relation || 'after';

    switch (relation) {
        case 'before':
            lines.splice(insertLine, 0, patchCode);
            break;

        case 'after':
            lines.splice(insertLine + 1, 0, patchCode);
            break;

        case 'after-block': {
            const closingLine = findClosingBrace(lines, insertLine);
            if (closingLine === -1) {
                result.message = `Could not find closing brace after line ${insertLine + 1}`;
                return { code, result };
            }
            lines.splice(closingLine + 1, 0, patchCode);
            insertLine = closingLine + 1;
            break;
        }

        case 'replace': {
            const replaceCount = patchDef.insertAt.replaceLines || 1;
            lines.splice(insertLine, replaceCount, patchCode);
            break;
        }

        case 'replace-region': {
            const endPattern = patchDef.insertAt.regionEnd;
            const endLine = findLineNumber(lines, endPattern, insertLine + 1, searchEnd + 200);
            if (endLine === -1) {
                result.message = `Region end not found: ${endPattern}`;
                return { code, result };
            }
            const endOffset = patchDef.insertAt.regionEndOffset || 0;
            const count = endLine - insertLine + 1 + endOffset;
            lines.splice(insertLine, count, patchCode);
            break;
        }

        case 'wrap': {
            const wrapEndLine = findLineNumber(lines, patchDef.insertAt.wrapEnd, insertLine, searchEnd);
            if (wrapEndLine === -1) {
                result.message = `Wrap end not found: ${patchDef.insertAt.wrapEnd}`;
                return { code, result };
            }
            const wrapBefore = patchDef.insertAt.wrapBefore ? patchDef.insertAt.wrapBefore(vars) : '';
            const wrapAfter = patchDef.insertAt.wrapAfter ? patchDef.insertAt.wrapAfter(vars) : '';
            // Insert after first, then before (to maintain line numbers)
            lines.splice(wrapEndLine + 1, 0, wrapAfter);
            lines.splice(insertLine, 0, wrapBefore);
            break;
        }

        default:
            result.message = `Unknown relation: ${relation}`;
            return { code, result };
    }

    result.success = true;
    result.line = insertLine + 1;
    result.message = `Applied at line ${insertLine + 1}`;

    return { code: lines.join('\n'), result };
}

function applyAll(code, patches, dryRun) {
    const results = [];
    let currentCode = code;

    for (const patch of patches) {
        const { code: newCode, result } = applyPatch(currentCode, patch, dryRun);
        currentCode = newCode;
        results.push(result);
    }

    return { code: currentCode, results };
}

module.exports = { applyPatch, applyAll, findLineNumber, findClosingBrace, getContext };
