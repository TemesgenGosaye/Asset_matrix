/**
 * One-shot codemod: `sonner` → `notify`.
 *
 * Mechanical by design. It rewrites the CALL and the IMPORT and deliberately
 * preserves each call site's existing wording, because the alternative —
 * inventing an i18n key per literal — would produce 674 untranslated keys that
 * render as `feedback.x.y` in front of a user. What this buys is the part that
 * actually had no consistency: one anatomy, one dedupe rule, one duration
 * policy, one accessibility story.
 *
 * Sonner options that have no counterpart are dropped and reported so they can
 * be handled by hand rather than silently lost.
 *
 * Usage: node scripts/codemod-feedback.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry");
const ROOT = path.resolve(process.cwd());

const METHODS = {
  success: "success",
  error: "error",
  warning: "warning",
  info: "info",
};

/** Sonner option keys that map onto `FeedbackInput` unchanged. */
const KEPT_OPTIONS = new Set(["description", "duration", "action", "id"]);
/** Sonner option keys with no counterpart. */
const DROPPED_OPTIONS = new Set([
  "icon",
  "closeButton",
  "cancel",
  "onAutoClose",
  "onDismiss",
  "position",
  "className",
  "style",
]);

const files = globSync("src/**/*.{ts,tsx}", { cwd: ROOT }).filter(
  (f) => !f.includes(`${path.sep}__tests__${path.sep}`) && !f.endsWith(".d.ts"),
);

const dropped = [];
const unbalanced = [];
let touchedFiles = 0;
let touchedCalls = 0;

/**
 * If `src[i]` begins a string, comment or REGEX literal, return the index just
 * past it. Otherwise null.
 *
 * Regex literals are the awkward case: `/foo(bar)/` is not balanced bracket
 * syntax, so a scanner that treats its parens as code loses its place in the
 * file and runs to the end. They are told apart from division by what precedes
 * them — a regex can only follow an operator, an opening bracket or the start of
 * an expression, and division can only follow a value.
 */
function skipNonCode(src, i) {
  const ch = src[i];
  if (ch === '"' || ch === "'" || ch === "`") {
    const quote = ch;
    let j = i + 1;
    while (j < src.length) {
      if (src[j] === "\\") {
        j += 2;
        continue;
      }
      if (quote === "`" && src[j] === "$" && src[j + 1] === "{") {
        const close = findMatching(src, j + 2, "{", "}");
        // An unterminated `${` would otherwise send the cursor to 0 and spin.
        if (close === -1) return src.length;
        j = close + 1;
        continue;
      }
      if (src[j] === quote) return j + 1;
      j += 1;
    }
    return src.length;
  }
  if (ch === "/" && src[i + 1] === "/") {
    const nl = src.indexOf("\n", i);
    return nl === -1 ? src.length : nl;
  }
  if (ch === "/" && src[i + 1] === "*") {
    const end = src.indexOf("*/", i);
    return end === -1 ? src.length : end + 2;
  }
  if (ch === "/") {
    let k = i - 1;
    while (k >= 0 && /\s/.test(src[k])) k -= 1;
    if (k === -1) return null;
    // After a value → division. After anything else → regex.
    if (/[)\]\w"'`]/.test(src[k])) return null;
    let j = i + 1;
    let inClass = false;
    while (j < src.length) {
      const c = src[j];
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) {
        // Consume trailing flags.
        let f = j + 1;
        while (f < src.length && /[dgimsuvy]/.test(src[f])) f += 1;
                return f;
      } else if (c === "\n") return null;
      j += 1;
    }
    return null;
  }
  return null;
}

/**
 * Scan from `start` to the delimiter that closes the one already opened.
 *
 * `start` is always the index just AFTER an opening delimiter, so the nesting is
 * already at depth 1 on entry. Starting at 0 would decrement past zero on the
 * first closer and never match, which reads as "unbalanced" for every simple
 * call and silently pairs it with a paren much further down the file.
 */
function findMatching(src, start, open, close) {
  let depth = 1;
  let i = start;
  while (i < src.length) {
    const skipped = skipNonCode(src, i);
    if (skipped !== null) {
      i = skipped;
      continue;
    }
    const ch = src[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

/** Split an argument list on top-level commas. */
function splitArgs(src) {
  const parts = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < src.length) {
    const skipped = skipNonCode(src, i);
    if (skipped !== null) {
      i = skipped;
      continue;
    }
    const ch = src[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    else if (ch === "," && depth === 0) {
      parts.push(src.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  const tail = src.slice(start);
  if (tail.trim()) parts.push(tail);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Rewrite one `toast.x(...)` / `toast(...)` call site. */
function rewriteCall(src, callStart, method, argStart, closeParen) {
  const argsSrc = src.slice(argStart, closeParen);
  const args = splitArgs(argsSrc);
  if (args.length === 0) return null;

  const first = args[0];
  // A second argument is sonner's options bag only when it is an object
  // literal; anything else is left alone rather than guessed at.
  let options = null;
  if (args.length > 1 && args[1].startsWith("{")) options = args[1];

  let title = first;
  if (options) {
    // Lift the recognised keys out of the options bag.
    for (const key of DROPPED_OPTIONS) {
      if (new RegExp(`(^|[{,\\s])${key}\\s*:`).test(options)) {
        dropped.push({ method, option: key });
      }
    }
    const kept = [];
    for (const key of ["description", "duration", "action", "id"]) {
      const re = new RegExp(`(^|[{,\\s])${key}\\s*:`, "m");
      if (!re.test(options)) continue;
      const keyIndex = options.indexOf(`${key}:`);
      const valueStart = options.indexOf(":", keyIndex) + 1;
      // Walk to the end of this property's value.
      let depth = 0;
      let j = valueStart;
      while (j < options.length) {
        const ch = options[j];
        if (ch === '"' || ch === "'" || ch === "`") {
          const q = ch;
          j += 1;
          while (j < options.length) {
            if (options[j] === "\\") {
              j += 2;
              continue;
            }
            if (options[j] === q) break;
            j += 1;
          }
        } else if (ch === "{" || ch === "[" || ch === "(") depth += 1;
        else if (ch === "}" || ch === "]" || ch === ")") {
          if (depth === 0) break;
          depth -= 1;
        } else if (ch === "," && depth === 0) break;
        j += 1;
      }
      let value = options.slice(valueStart, j).trim();
      // `id` is sonner's own handle; ours is returned by notify, so a literal
      // here would be a name collision rather than a behaviour.
      if (key === "id") continue;
      kept.push(`${key}: ${value}`);
    }
    if (kept.length === 0) {
      title = first;
    } else {
      // Preserve multi-line shape of the original options bag.
      const multiline = args[1].includes("\n");
      title = `{\n      title: ${first},\n      ${kept.join(",\n      ")},\n    }`;
      if (!multiline) title = `{ title: ${first}, ${kept.join(", ")} }`;
    }
  }

  const verb = METHODS[method] ?? "info";
  const end = closeParen + 1;
  return { text: `notify.${verb}(${title})`, end };
}

let total = 0;
for (const rel of files) {
  const abs = path.join(ROOT, rel);
  let src = readFileSync(abs, "utf8");
  if (!src.includes("toast") || !src.includes("sonner")) continue;

  const original = src;
  let out = "";
  let cursor = 0;
  let calls = 0;

  const re = /\btoast\s*(?:\.\s*(success|error|warning|info)\s*)?\(/g;
  let match;
  const debug = process.env.CODEMOD_TRACE === rel;
  while ((match = re.exec(src)) !== null) {
    if (match.index < cursor) continue;
    const method = match[1] ?? "info";
    const open = match.index + match[0].length - 1;
    const close = findMatching(src, open + 1, "(", ")");
    if (debug) {
      console.log(
        `    @${match.index} ${match[0].trim()} close=${close} line=${src.slice(0, match.index).split("\n").length}`,
      );
    }
    if (close === -1) {
      // Never skip silently: a call left as `toast.*` after this script has run
      // means the migration is incomplete, and the only way to know is to be
      // told.
      unbalanced.push(`${rel}:${src.slice(0, match.index).split("\n").length}`);
      continue;
    }

    const rewritten = rewriteCall(src, match.index, method, open + 1, close);
    if (!rewritten) {
      if (debug) console.log("    -> skipped (no args)");
      continue;
    }
    if (debug) console.log(`    -> ${rewritten.text.slice(0, 60)}`);

    out += src.slice(cursor, match.index) + rewritten.text;
    cursor = rewritten.end;
    re.lastIndex = rewritten.end;
    calls += 1;
  }
  out += src.slice(cursor);

  if (calls === 0) continue;

  // Swap the import. `Toaster` was only ever imported in the layout, which no
  // longer uses sonner at all.
  out = out.replace(
    /import\s*\{\s*toast\s*\}\s*from\s*"sonner";/g,
    'import { notify } from "@/lib/feedback/notify";',
  );
  out = out.replace(
    /import\s*\{\s*toast\s*,\s*Toaster\s*\}\s*from\s*"sonner";/g,
    'import { notify } from "@/lib/feedback/notify";',
  );

  touchedFiles += 1;
  touchedCalls += calls;
  total += calls;
  if (process.env.CODEMOD_DEBUG) console.log(`  ${rel}: ${calls}`);
  if (!DRY) writeFileSync(abs, out, "utf8");
  else if (original === out) touchedFiles -= 1;
}

console.log(
  `${DRY ? "[dry] " : ""}rewrote ${total} call(s) across ${touchedFiles} file(s)`,
);
if (dropped.length) {
  const counts = new Map();
  for (const d of dropped) {
    const key = `${d.method}.${d.option}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  console.log("dropped sonner options (review by hand):");
  for (const [key, n] of [...counts].sort()) console.log(`  ${key} x${n}`);
}
if (unbalanced.length) {
  console.log("could not parse these calls — migrate by hand:");
  for (const where of unbalanced) console.log(`  ${where}`);
}

