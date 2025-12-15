// src/utils/streamSanitizers.js

// ----------- low-level cleanup ---------------------------------------------
const CONTROL_RE =
  /[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u200B\u200C\u200D\u2060\uFEFF]/g;

const CONSONANT_END_RE = /[bcdfghjklmnpqrstvwxyz]$/i;
const VOWEL_START_RE = /^[aeiou]/i;

function isAlpha(s) {
  return /^[A-Za-z]+$/.test(s);
}
function isLowerAlpha(s) {
  return /^[a-z]+$/.test(s);
}

// Helpers to keep punctuation sane without collapsing valid word boundaries.
function fixPunctuationAndParens(s) {
  let t = String(s);

  // Remove spaces BEFORE punctuation: "word ," -> "word,"
  t = t.replace(/\s+([,.;:!?])/g, "$1");

  // Tighten parentheses: "( 1,271 )" -> "(1,271)"
  t = t.replace(/\(\s+/g, "(");
  t = t.replace(/\s+\)/g, ")");

  // Ensure one space AFTER punctuation when followed by a letter
  t = t.replace(/([,.;:!?])(?=[A-Za-z])/g, "$1 ");

  // Ensure one space after ")" when followed by a letter
  t = t.replace(/\)(?=[A-Za-z])/g, ") ");

  // Collapse repeated spaces
  t = t.replace(/[ \t]{2,}/g, " ");

  return t;
}

function fixNumbersOnly(s) {
  let t = String(s);

  // Keep newlines, collapse runs of spaces/tabs
  t = t.replace(/[ \t]{2,}/g, " ");

  // Join digit runs: "2 0 2 5" -> "2025"
  t = t.replace(/(\d)\s+(?=\d)/g, "$1");

  // Commas/decimals inside numbers: "1 , 271" -> "1,271"
  t = t.replace(/(\d)\s*,\s*(\d)/g, "$1,$2");
  t = t.replace(/(\d)\s*\.\s*(\d)/g, "$1.$2");

  // Ordinals: "11 th" -> "11th"
  t = t.replace(/(\d)\s+(st|nd|rd|th)\b/gi, "$1$2");

  return t;
}

// Join acronym splits like "N F T s" / "N FTs" -> "NFTs"
function fixAcronyms(s) {
  let t = String(s);

  // "N F T" -> "NFT"
  t = t.replace(/\b((?:[A-Z]\s+){1,12}[A-Z])\b/g, (m) => m.replace(/\s+/g, ""));

  // "NFT s" -> "NFTs"
  t = t.replace(/\b([A-Z]{2,16})\s+([a-z]{1,2})\b/g, (m, a, b) => a + b);

  // "N FTs" -> "NFTs"
  t = t.replace(/\b([A-Z])\s+([A-Z]{2,16}[a-z]{0,2})\b/g, "$1$2");

  return t;
}

// Detect whether text is actually tokenized (strong signals only).
function looksTokenized(s) {
  const t = String(s);

  let score = 0;

  if (/\s+[,.;:!?]/.test(t)) score += 3;
  if (/\(\s+\d/.test(t) || /\d\s+\)/.test(t)) score += 3;
  if (/\d\s+(?=\d)/.test(t)) score += 3;
  if (/\d\s+(st|nd|rd|th)\b/i.test(t)) score += 2;

  return score >= 5;
}

// Conservative join for "act ivity" style splits (no suffix tables / no wordlists):
function fixLowerMidwordSplits(s) {
  return String(s).replace(/\b([a-z]{3})\s+([a-z]{4,6})\b/g, (m, a, b) => {
    if (!isLowerAlpha(a) || !isLowerAlpha(b)) return m;
    if (!CONSONANT_END_RE.test(a)) return m;
    if (!VOWEL_START_RE.test(b)) return m;
    return a + b;
  });
}

// Tokenized-mode joiner (SAFE):
// - fixes "mi nt ed" by joining tiny fragments (1-2 letters)
// - fixes "deploye d" / "create d" (single-letter, non-vowel tail)
// - fixes "mint ed (" by joining a 2-letter fragment ONLY when it is
//   immediately followed by punctuation/paren/end (not another word / number).
function fixTokenizedWordSplitsOnlyWhenNeeded(s) {
  let t = String(s);
  if (!looksTokenized(t)) return t;

  // Hyphen spacing: "multi - assets" -> "multi-assets"
  t = t.replace(/\b(\w+)\s*-\s*(\w+)\b/g, "$1-$2");

  // Pass A: join very small fragments: "mi nt" -> "mint"
  for (let pass = 0; pass < 2; pass++) {
    const before = t;
    t = t.replace(/\b([A-Za-z]{1,2})\s+([A-Za-z]{1,2})\b/g, (m, a, b) => {
      if (!isAlpha(a) || !isAlpha(b)) return m;
      return a + b;
    });
    if (t === before) break;
  }

  // Pass B: join longish token + 1-letter tail: "deploye d" -> "deployed"
  // Guard: do NOT join if tail is a vowel (prevents "shows a" -> "showsa").
  t = t.replace(/\b([A-Za-z]{3,40})\s+([A-Za-z])\b/g, (m, a, b) => {
    if (!isAlpha(a) || !isAlpha(b)) return m;
    if (/^[aeiou]$/i.test(b)) return m;
    return a + b;
  });

  // Pass C (safe 2-letter join):
  // Join only when the next non-space char is punctuation / ')' / end-of-string.
  // This fixes "mint ed (1,271)" but will NOT turn "peak in activity" into "peakinactivity".
  t = t.replace(
    /\b([A-Za-z]{4,40})\s+([a-z]{2})(?=\s*[,.;:!?)]|\s*$)/g,
    (m, a, b) => {
      if (!isAlpha(a) || !isLowerAlpha(b)) return m;
      return a + b;
    }
  );

  // Mid-word lowercase splits like "act ivity" (only in tokenized mode)
  t = fixLowerMidwordSplits(t);

  return t;
}

function joinSoftWraps(s) {
  const lines = String(s).split("\n");
  const out = [];

  const isBlockStart = (ln) => {
    const t = (ln || "").trimStart();

    // headings, hr
    if (/^#{1,6}\s+/.test(t)) return true;
    if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(t)) return true;

    // lists (ul/ol/task)
    if (/^([-*+])\s+/.test(t)) return true;
    if (/^\d{1,3}\.\s+/.test(t)) return true;

    // blockquote
    if (/^>\s?/.test(t)) return true;

    // code fence / math fence
    if (/^```/.test(t)) return true;
    if (/^\$\$/.test(t)) return true;

    // tables (very common markdown table starts)
    if (/^\|/.test(t)) return true;

    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i] ?? "";
    const next = i + 1 < lines.length ? lines[i + 1] : null;

    out.push(cur);

    if (next == null) continue;

    // keep blank lines as paragraph breaks
    if (!cur.trim() || !next.trim()) continue;

    // if next line begins a markdown block, preserve newline
    if (isBlockStart(next)) continue;

    // if current line itself is a block marker line, preserve newline
    if (isBlockStart(cur)) continue;

    // otherwise, treat as soft wrap: replace newline with a space
    out[out.length - 1] = out[out.length - 1] + " ";
  }

  return out.join("\n").replace(/[ \t]+\n/g, "\n");
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
      if (/^```/.test(line)) {
        push();
        mode = "code";
        buf.push(line);
        continue;
      }
      if (/^\$\$/.test(line)) {
        push();
        mode = "math";
        buf.push(line);
        continue;
      }
      buf.push(line);
      continue;
    }
    if (mode === "code") {
      buf.push(line);
      if (/^```/.test(line)) {
        push();
        mode = "text";
      }
      continue;
    }
    if (mode === "math") {
      buf.push(line);
      if (/^\$\$/.test(line)) {
        push();
        mode = "text";
      }
      continue;
    }
  }
  push();
  return out;
}

// ----------- list & table recovery (text segments only) ---------------------

function normalizeLists(text) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;

  const bulletSameLine = /^\s*([*+\-])\s+(.*)$/;
  const bulletAlone = /^\s*([*+\-])\s*$/;

  const orderedSameLine = /^\s*(\d{1,3})\.\s+(.*)$/;
  const orderedAlone = /^\s*(\d{1,3})\.\s*$/;

  const consumeContinuation = (startIndex) => {
    let j = startIndex;
    let parts = [];

    while (j < lines.length) {
      const ln = lines[j];
      if (!ln.trim()) break;

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

    let m = line.match(bulletSameLine);
    if (m) {
      const marker = m[1];
      let item = m[2].trim();
      const cont = consumeContinuation(i + 1);
      if (cont.text) item += " " + cont.text;
      out.push(`${marker} ${item}`);
      i = cont.nextIndex;
      continue;
    }

    m = line.match(bulletAlone);
    if (m) {
      const marker = m[1];
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;

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

    m = line.match(orderedAlone);
    if (m) {
      const num = m[1];
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

    out.push(line);
    i++;
  }

  return out.join("\n");
}

function promoteInlineBullets(t) {
  return t
    .replace(/([:.)\]])\s*-\s+(?=\*\*[^*]+?\*\*:)/g, "$1\n- ")
    .replace(/(?<!^)\s-\s+(?=\*\*[^*]+?\*\*:)/gm, "\n- ");
}

function kvBlocksToTable(text) {
  const lines = text.split("\n");

  const kvLine = (s) => {
    const m = s.match(
      /^\s*(?:[-*]\s+|\d+\.\s+)?\**\*?([^:*]+?)\*?\**\s*:\s*(.+?)\s*$/
    );
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
    } else {
      if (sawKV) {
        if (Object.keys(cur).length) records.push(cur);
        cur = {};
        sawKV = false;
      }
    }
  }
  if (Object.keys(cur).length) records.push(cur);

  if (records.length < 2) return null;

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

function normalizeListsAndTablesInText(s) {
  let t = normalizeLists(s);
  const table = kvBlocksToTable(t);
  if (table) return table;
  return t;
}

// ----------- public API -----------------------------------------------------

export function sanitizeChunk(raw) {
  if (raw == null) return "";
  let text = String(raw);

  text = text.replace(/\r/g, "");

  // ignore pure whitespace keep-alive chunks
  if (!text.replace(/\n/g, "").trim()) return "";

  // do NOT trim leading whitespace; only trim trailing spaces/tabs.
  return text.replace(/[ \t]+$/g, "");
}

export function finalizeForRender(text) {
  if (!text) return "";
  let src = String(text).replace(/\s+$/g, "");
  src = src.replace(CONTROL_RE, "");

  src = ensureBalancedCodeFences(src);
  src = ensureBalancedDisplayMath(src);

  const parts = segmentByFences(src).map((p) => {
    if (p.kind !== "text") return p.content;

    let t = p.content;

    // IMPORTANT: do NOT glue newline-separated words together.
    // Convert single newlines into spaces instead.
    t = joinSoftWraps(t);
    t = collapseBlankLines(t);

    t = fixNumbersOnly(t);
    t = fixAcronyms(t);
    t = fixTokenizedWordSplitsOnlyWhenNeeded(t);
    t = fixPunctuationAndParens(t);

    t = promoteInlineBullets(t);
    t = normalizeListsAndTablesInText(t);

    return t;
  });

  return parts.join("\n").trimEnd();
}
