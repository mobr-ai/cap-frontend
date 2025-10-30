// src/utils/streamSanitizers.js

// ----------- low-level cleanup ---------------------------------------------
const CONTROL_RE =
    /[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u200B\u200C\u200D\u2060\uFEFF]/g;

const SPACED_LETTERS_RE =
    /(?<=^|[\s(])(?:[A-Za-z0-9`]|\\[A-Za-z])(?:\s(?:[A-Za-z0-9`]|\\[A-Za-z])){2,}(?=[\s.,;:!?)}\]]|$)/g;

function fixSpacedLetters(s) {
    return s.replace(SPACED_LETTERS_RE, (m) => m.replace(/\s+/g, ""));
}

function joinWordBreaks(s) {
    return s.replace(/([A-Za-z0-9])\s*\n\s*([A-Za-z0-9])/g, "$1$2");
}

function joinSoftWraps(s) {
    return s.replace(/([^\n])\n(?!\n)([^\n])/g, "$1 $2");
}

function collapseBlankLines(s) {
    return s.replace(/\n{3,}/g, "\n\n");
}

function ensureBalancedCodeFences(s) {
    const fenceCount = (s.match(/```/g) || []).length;
    return fenceCount % 2 ? s + "\n```" : s;
}

function ensureBalancedDisplayMath(s) {
    const count = (s.match(/\$\$/g) || []).length;
    return count % 2 ? s + "\n$$" : s;
}

// ----------- segmentation (protect code/math) -------------------------------
function segmentByFences(src) {
    const lines = String(src).split(/\r?\n/);
    const out = [];
    let buf = [];
    let mode = "text"; // text | code | math

    const push = () => {
        if (buf.length) out.push({ kind: mode, content: buf.join("\n") });
        buf = [];
    };

    for (const line of lines) {
        if (mode === "text") {
            if (/^```/.test(line)) { push(); mode = "code"; buf.push(line); continue; }
            if (/^\$\$/.test(line)) { push(); mode = "math"; buf.push(line); continue; }
            buf.push(line); continue;
        }
        if (mode === "code") {
            buf.push(line);
            if (/^```/.test(line)) { push(); mode = "text"; }
            continue;
        }
        if (mode === "math") {
            buf.push(line);
            if (/^\$\$/.test(line)) { push(); mode = "text"; }
            continue;
        }
    }
    push();
    return out;
}

// ----------- list & table recovery (text segments only) ---------------------

// Rebuild bullet/ordered lists from broken lines, including markers on their own line.
function normalizeLists(text) {
    const lines = text.split("\n");
    const out = [];
    let i = 0;

    // "- something" / "* something" / "+ something"
    const bulletSameLine = /^\s*([*+\-])\s+(.*)$/;
    // "-" alone (possibly with spaces)
    const bulletAlone = /^\s*([*+\-])\s*$/;

    // "1. something"
    const orderedSameLine = /^\s*(\d{1,3})\.\s+(.*)$/;
    // "1." alone
    const orderedAlone = /^\s*(\d{1,3})\.\s*$/;

    // Helper: consume continuation lines for a list item until we hit a new marker or a blank line.
    const consumeContinuation = (startIndex) => {
        let j = startIndex;
        let parts = [];

        while (j < lines.length) {
            const ln = lines[j];

            // stop if blank line (paragraph break)
            if (!ln.trim()) break;

            // stop if a new list item starts (any type)
            if (
                bulletSameLine.test(ln) ||
                bulletAlone.test(ln) ||
                orderedSameLine.test(ln) ||
                orderedAlone.test(ln)
            ) {
                break;
            }

            parts.push(ln.trim());
            j++;
        }
        return { nextIndex: j, text: parts.join(" ") };
    };

    while (i < lines.length) {
        const line = lines[i];

        // --- Bullet with text on same line
        let m = line.match(bulletSameLine);
        if (m) {
            const marker = m[1];
            let item = m[2].trim();

            const cont = consumeContinuation(i + 1);
            if (cont.text) item += " " + cont.text;
            out.push(`${marker} ${item}`); // emit normalized bullet
            i = cont.nextIndex;
            continue;
        }

        // --- Bullet marker on its own line (possibly followed by blank lines)
        m = line.match(bulletAlone);
        if (m) {
            const marker = m[1];

            // Skip optional blank lines after the marker
            let j = i + 1;
            while (j < lines.length && !lines[j].trim()) j++;

            // First non-empty line starts the item text
            let item = "";
            if (j < lines.length) {
                item = lines[j].trim();
                j++;
            }

            const cont = consumeContinuation(j);
            if (cont.text) item += (item ? " " : "") + cont.text;

            out.push(`${marker} ${item}`.trim());
            i = cont.nextIndex;
            continue;
        }

        // --- Ordered with text on same line
        m = line.match(orderedSameLine);
        if (m) {
            const num = m[1];
            let item = m[2].trim();

            const cont = consumeContinuation(i + 1);
            if (cont.text) item += " " + cont.text;
            out.push(`${num}. ${item}`);
            i = cont.nextIndex;
            continue;
        }

        // --- Ordered marker alone ("1.")
        m = line.match(orderedAlone);
        if (m) {
            const num = m[1];

            // Skip optional blank lines after the marker
            let j = i + 1;
            while (j < lines.length && !lines[j].trim()) j++;

            let item = "";
            if (j < lines.length) {
                item = lines[j].trim();
                j++;
            }

            const cont = consumeContinuation(j);
            if (cont.text) item += (item ? " " : "") + cont.text;

            out.push(`${num}. ${item}`.trim());
            i = cont.nextIndex;
            continue;
        }

        // Not a list marker — pass through
        out.push(line);
        i++;
    }

    return out.join("\n");
}

// Turn inline " - **Key**:" into a real list break.
// Examples:
//   "details:- **Block Number**: 0 - **Hash**: abc"
//    => "details:\n- **Block Number**: 0\n- **Hash**: abc"
function promoteInlineBullets(t) {
    return t
        // after a colon/period/paren, promote the dash to a new list item
        .replace(/([:.)\]])\s*-\s+(?=\*\*[^*]+?\*\*:)/g, "$1\n- ")
        // anywhere we see " - **Key**:" (not already at BOL), promote it
        .replace(/(?<!^)\s-\s+(?=\*\*[^*]+?\*\*:)/gm, "\n- ");
}

// Detect repeated "Key: Value" records and render a GFM table.
// Heuristic: at least 2 records and at least 3 unique keys overall.
function kvBlocksToTable(text) {
    const lines = text.split("\n");

    const kvLine = (s) => {
        // allow bold keys like **Key**:
        const m = s.match(/^\s*(?:[-*]\s+|\d+\.\s+)?\**\*?([^:*]+?)\*?\**\s*:\s*(.+?)\s*$/);
        return m ? [m[1].trim(), m[2].trim()] : null;
    };

    const records = [];
    let cur = {};
    let sawKV = false;

    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const kv = kvLine(l);

        if (kv) {
            sawKV = true;
            const [k, v] = kv;
            cur[k] = cur[k] ? cur[k] + " " + v : v;

            // record boundary when next starts a new item or blank
            const next = lines[i + 1] ?? "";
            const isNextNewItem = !!kvLine(next);
            if (!next.trim() || isNextNewItem) {
                // continue; the loop will push on transition or at end
            }
        } else {
            if (sawKV) {
                // end of a record
                if (Object.keys(cur).length) records.push(cur);
                cur = {};
                sawKV = false;
            }
        }
    }
    if (Object.keys(cur).length) records.push(cur);

    if (records.length < 2) return null;

    // gather headers
    const headerSet = new Set();
    records.forEach((r) => Object.keys(r).forEach((k) => headerSet.add(k)));
    const headers = Array.from(headerSet);

    if (headers.length < 3) return null;

    const escapePipes = (s) => String(s).replace(/\|/g, "\\|");
    const headerLine = `| ${headers.map(escapePipes).join(" | ")} |`;
    const sepLine = `| ${headers.map(() => "---").join(" | ")} |`;
    const rowLines = records.map(
        (r) => `| ${headers.map((h) => escapePipes(r[h] ?? "")).join(" | ")} |`
    );

    return [headerLine, sepLine, ...rowLines].join("\n");
}

// Run list/table normalization only in plain text areas.
function normalizeListsAndTablesInText(s) {
    let t = normalizeLists(s);

    const table = kvBlocksToTable(t);
    if (table) {
        // If we made a table, replace only the region that looks like KV blocks.
        // Simple approach: when a table is produced, prefer it entirely.
        return table;
    }

    return t;
}

// ----------- public API -----------------------------------------------------

// Lightweight per-chunk clean (heavy work is in finalizeForRender)
export function sanitizeChunk(chunk) {
    let s = String(chunk).replace(CONTROL_RE, "");
    s = joinWordBreaks(s);
    s = fixSpacedLetters(s);
    return s;
}

// Full-buffer finalize: normalize text, then balance fences
export function finalizeForRender(full) {
    const segments = segmentByFences(full);

    const rebuilt = segments
        .map((seg) => {
            if (seg.kind !== "text") return seg.content;

            let t = seg.content;
            t = t.replace(CONTROL_RE, "");
            t = joinWordBreaks(t);
            t = fixSpacedLetters(t);
            t = joinSoftWraps(t);
            t = collapseBlankLines(t);

            t = promoteInlineBullets(t);

            // new: recover lists & tables after spacing is fixed
            t = normalizeListsAndTablesInText(t);

            return t;
        })
        .join("\n");

    let s = ensureBalancedCodeFences(rebuilt);
    s = ensureBalancedDisplayMath(s);
    return s;
}
