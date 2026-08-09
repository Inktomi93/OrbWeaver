// kit/macro/parser — the hand-rolled `{{…}}` scanner (parity-plus §12A.parser: LINEAR extensions of a
// depth-aware scan, never a parser framework). The MG grammar (§12A.1 + §12A.4, FINAL at launch):
//   • flags sit BETWEEN `{{` and the identifier as a flag RUN (`{{<flags><name>::args}}`), parsed into a
//     `flags` object on the node from the ONE `MACRO_FLAG_DEFS` vocabulary (types.ts);
//   • ANY macro may take a body — `{{name::args}}content{{/name}}` opens a scoped block for any name; the
//     close is the `/` CLOSING_BLOCK flag on a name-matching tag. There is no dedicated block-open marker:
//     a tag is a block IFF a matching close arrives in scope, else it stays an inline call (the old
//     `{{#name}}` block-open syntax is REPLACED; `#` now reads as the PRESERVE_WHITESPACE flag).
// Degrade-don't-throw posture throughout: unclosed/invalid tags re-emit their literal bytes, an unmatched
// close re-emits verbatim, and every re-emit uses the ORIGINAL source span (`raw`) for byte-identity.

import type { MacroAST, MacroBlockNode, MacroCallNode, MacroFlagKey, MacroNode, MacroSpan } from "./types.ts";
import { MACRO_FLAG_DEFS } from "./types.ts";

// A `/`-flagged tag — consumed structurally by buildBlocks (it closes a block, or re-emits verbatim).
interface FlatClose {
  type: "blockClose";
  name: string;
  raw: string;
}
type FlatNode = MacroNode | FlatClose;

// char → flag key, derived from the ONE flag vocabulary (types.ts) so the parser can never drift from it.
const FLAG_KEY_BY_CHAR: ReadonlyMap<string, MacroFlagKey> = new Map(MACRO_FLAG_DEFS.map((def) => [def.char, def.key]));

// Amortized-O(1) line/col derivation. The OLD `spanAt(text, offset)` re-scanned from index 0 on EVERY
// recognized tag (once per `{{…}}`), making the parser O(tags·length) = O(L²) over a macro-dense input:
// a 100 KB card field of `{{a}}` macros blocked the shared event loop ~4.4 s (2026-08-09 DoS audit) — a
// full-instance denial-of-service on any input that reaches assembly's `renderMacros` (card fields,
// greetings, world-info `content` — all capped at 100 KB, all attacker-influenceable via an imported ST
// card / shared lorebook / member persona). Because the scanner only ever requests spans at
// MONOTONICALLY INCREASING offsets (tags parse left-to-right, and the main loop's `pos` never rewinds),
// a running cursor advances only over the bytes SINCE the previous span, so the whole parse counts each
// byte at most once → O(L). Byte output is UNCHANGED and every emitted span (offset/line/col/length) is
// IDENTICAL to the old full re-scan — only the cost of deriving it moves.
interface SpanCursor {
  index: number;
  line: number;
  col: number;
}

function createSpanCursor(): SpanCursor {
  return { index: 0, line: 1, col: 1 };
}

// Advance `cursor` from its current index to `offset` (which is >= cursor.index by construction — spans
// are requested in document order), accumulating the 1-based line/col over the newly-scanned bytes, and
// return the tag's diagnostic span. Mutates the cursor so the next (later) tag resumes from here rather
// than re-scanning from 0.
function spanFrom(cursor: SpanCursor, text: string, offset: number, length: number): MacroSpan {
  let { line, col } = cursor;
  for (let i = cursor.index; i < offset; i += 1) {
    if (text.startsWith("\n", i)) {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  cursor.index = offset;
  cursor.line = line;
  cursor.col = col;
  return { offset, line, col, length };
}

// Length of the `{{` opener / `}}` closer / `//` comment marker. The scanner advances by this whole
// token rather than a bare literal so the intent ("skip the delimiter") reads at each site.
const BRACE_LEN = 2;
const COMMENT_MARKER_LEN = 2;
// Length of the legacy `::` arg prefix stripped before `::`-splitting.
const DOUBLE_COLON_PREFIX_LEN = 2;
// `indexOf` / "no closing delimiter" sentinel.
const NOT_FOUND = -1;
// Leading char of an identifier, then word-chars or `-` (`\w` already covers `_`/digits/letters).
// STICKY (`y`), not anchored (`^`): the scanner matches the identifier at an OFFSET into the full string
// (`readTag`), and a sticky match at `lastIndex` avoids allocating a fresh `text.slice(pos)` tail on every
// tag — that slice was the SECOND O(n²) parse source (alongside the old spanAt), together ~4.4 s on a
// 100 KB macro-dense field (2026-08-09 DoS audit). Sticky exec is used with an explicit `lastIndex` set on
// every call, so its statefulness is deterministic (parse is synchronous and non-reentrant).
const MACRO_IDENT = /[a-zA-Z][\w-]*/y;

/** The fully-anchored form of {@link MACRO_IDENT} — "is this whole string a parseable macro name?".
 *  ONE vocabulary home: `registerUserMacros` (user-macros.ts) and the contracts-side authoring schema
 *  both validate against THIS, so a stored name the parser can't tokenize is impossible by construction. */
export const MACRO_NAME_RE = /^[a-zA-Z][\w-]*$/;

// {{// … }} comment — depth-aware scan (mirroring the arg reader) so a nested {{…}} inside the
// comment doesn't close it early. `from` is the index just past the `//`. Returns the index just
// AFTER the closing `}}`, or NOT_FOUND when the comment is unclosed.
function scanCommentEnd(text: string, from: number): number {
  let depth = 1;
  let j = from;
  while (j < text.length) {
    if (text.startsWith("{{", j)) {
      depth += 1;
      j += BRACE_LEN;
    } else if (text.startsWith("}}", j)) {
      depth -= 1;
      if (depth === 0) {
        return j + BRACE_LEN;
      }
      j += BRACE_LEN;
    } else {
      j += 1;
    }
  }
  return NOT_FOUND;
}

interface MacroBody {
  argStr: string;
  endMacroPos: number;
}

// Read a macro's argument span tracking `{{`/`}}` nesting depth from `from` (just past the name).
// `endMacroPos` is the index of the matching top-level `}}` (NOT_FOUND ⇒ unclosed); `argStr` is the
// raw between the name and that close.
function scanMacroBody(text: string, from: number): MacroBody {
  let depth = 1;
  let argStr = "";
  let i = from;
  while (i < text.length) {
    if (text.startsWith("{{", i)) {
      depth += 1;
      argStr += "{{";
      i += BRACE_LEN;
    } else if (text.startsWith("}}", i)) {
      depth -= 1;
      if (depth === 0) {
        return { argStr, endMacroPos: i };
      }
      argStr += "}}";
      i += BRACE_LEN;
    } else {
      argStr += text.charAt(i);
      i += 1;
    }
  }
  return { argStr, endMacroPos: NOT_FOUND };
}

interface TagResult {
  nodes: FlatNode[];
  // Position the main scanner should resume from.
  pos: number;
  // Stop the whole scan (unclosed comment/macro rescued the remainder as literal text).
  stop: boolean;
}

// The parsed flag run — `run` is the original chars (for byte-exact literal re-emit of an invalid tag).
interface FlagRun {
  flags: { [K in MacroFlagKey]?: true } | undefined;
  run: string;
  pos: number;
}

// Consume the flag run between `{{` and the identifier (§12A.4). A repeated char just re-sets its key
// (idempotent — `{{##name}}` carries one preserveWhitespace, its raw stays byte-exact regardless).
function readFlagRun(text: string, from: number): FlagRun {
  let flags: FlagRun["flags"];
  let run = "";
  let pos = from;
  while (pos < text.length) {
    const key = FLAG_KEY_BY_CHAR.get(text.charAt(pos));
    if (key === undefined) {
      break;
    }
    flags = flags ?? {};
    flags[key] = true;
    run += text.charAt(pos);
    pos += 1;
  }
  return { flags, run, pos };
}

// Parse one tag whose `{{` begins at `tagStart`; `bodyPos` = tagStart + BRACE_LEN points just past the
// opener. Handles comments, the flag run, the identifier, and the arg span. The comment check PRECEDES
// the flag run so `{{//…}}` is always a comment, never a doubled `/` closing flag.
function readTag(text: string, tagStart: number, bodyPos: number, cursor: SpanCursor): TagResult {
  // Comment macro: {{// … }} — consumed whole, emits nothing.
  if (text.startsWith("//", bodyPos)) {
    const commentEnd = scanCommentEnd(text, bodyPos + COMMENT_MARKER_LEN);
    if (commentEnd === NOT_FOUND) {
      // Unclosed comment → preserve from the `{{` as literal text (matches unclosed-macro handling).
      return {
        nodes: [{ type: "text", value: text.slice(tagStart) }],
        pos: text.length,
        stop: true,
      };
    }
    return { nodes: [], pos: commentEnd, stop: false };
  }

  const { flags, run, pos: afterFlags } = readFlagRun(text, bodyPos);
  let pos = afterFlags;

  MACRO_IDENT.lastIndex = pos;
  const idMatch = MACRO_IDENT.exec(text);
  if (!idMatch) {
    // No identifier after the flags — the opener + flag chars are literal text; scanning resumes right
    // after them so a later valid `{{` still parses.
    return { nodes: [{ type: "text", value: `{{${run}` }], pos, stop: false };
  }
  const name = idMatch[0];
  pos += name.length;

  const { argStr, endMacroPos } = scanMacroBody(text, pos);
  if (endMacroPos === NOT_FOUND) {
    // Unclosed macro → re-emit verbatim (flags included) and stop.
    return { nodes: [{ type: "text", value: `{{${run}${name}${argStr}` }], pos: text.length, stop: true };
  }

  pos = endMacroPos + BRACE_LEN;
  // Original source span of this tag (`{{name:one,two}}` exactly as typed) — carried on the node so
  // unrecognized macros re-emit byte-identical text, flags verbatim.
  const raw = text.slice(tagStart, endMacroPos + BRACE_LEN);
  if (flags?.closing === true) {
    // The `/` CLOSING_BLOCK flag — a structural close, never an evaluable node. Args on a close are
    // ignored (only the name matches); `raw` keeps its exact bytes for the unmatched-close re-emit.
    return { nodes: [{ type: "blockClose", name, raw }], pos, stop: false };
  }
  const args = parseArgs(argStr);
  const span = spanFrom(cursor, text, tagStart, raw.length);
  const node: MacroCallNode = { type: "macro", name, args, raw, span, ...(flags !== undefined ? { flags } : {}) };
  return { nodes: [node], pos, stop: false };
}

/** One flat display run of a template string: literal prose, or a `{{macro}}` reference. Distinct from the
 *  full {@link MacroAST} — a lighter text/macro projection for display surfaces (assembly-preview chips)
 *  that need the escape rule the engine honors but not block structure. */
export interface MacroRun {
  readonly kind: "text" | "macro";
  /** For `text` — the literal run; for `macro` — the inner reference, inner whitespace trimmed. */
  readonly value: string;
}

// Inner of a display macro run: any non-brace content (the grammar the preview chips), inner-trimmed by
// scanMacroRuns. `[^{}]` (not the parser's strict identifier) keeps display parity with what authors see.
const DISPLAY_MACRO_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Split a template string into flat text / `{{macro}}` runs for DISPLAY, honoring the ONE escape rule the
 *  real parser honors: a `\{{` opener is LITERAL, never a macro (`\{{char}}` yields the text `{{char}}`, not
 *  a chip). Empty text runs are dropped, so a string that is exactly one macro yields a single macro run.
 *  Pure display projection — no resolution, no env, no registry. */
export function scanMacroRuns(text: string): readonly MacroRun[] {
  const runs: MacroRun[] = [];
  let pendingText = "";
  let lastIndex = 0;
  const pushText = (value: string): void => {
    if (value.length > 0) {
      pendingText += value;
    }
  };
  const flushText = (): void => {
    if (pendingText.length > 0) {
      runs.push({ kind: "text", value: pendingText });
      pendingText = "";
    }
  };
  DISPLAY_MACRO_RE.lastIndex = 0;
  for (let match = DISPLAY_MACRO_RE.exec(text); match !== null; match = DISPLAY_MACRO_RE.exec(text)) {
    const start = match.index;
    pushText(text.slice(lastIndex, start));
    // Escaped opener (`\{{…}}`) — the backslash makes it literal: drop the backslash, keep the braces as
    // text, and do NOT emit a macro run (matching the parser's `\{{` escape).
    if (start > 0 && text.charAt(start - 1) === "\\") {
      pendingText = pendingText.slice(0, -1);
      pushText(match[0]);
    } else {
      flushText();
      runs.push({ kind: "macro", value: (match[1] ?? "").trim() });
    }
    lastIndex = start + match[0].length;
  }
  pushText(text.slice(lastIndex));
  flushText();
  return runs;
}

export function parseMacros(text: string): MacroAST {
  const flatAst: FlatNode[] = [];
  // One monotonic line/col cursor for the whole parse — see spanFrom. Fresh per call, so nested
  // evaluate-time re-parses (ctx.evaluateString) never share a cursor with their parent.
  const cursor = createSpanCursor();
  let pos = 0;

  while (pos < text.length) {
    const tagStart = text.indexOf("{{", pos);
    if (tagStart === NOT_FOUND) {
      flatAst.push({ type: "text", value: text.slice(pos) });
      break;
    }

    // Literal-brace escape: a backslash immediately before `{{` makes the opener literal —
    // `\{{char}}` renders as the text `{{char}}` (backslash consumed, macro not parsed).
    // This is the ONLY way to author a literal `{{registeredName}}`. `\\{{` is NOT treated as an
    // escaped backslash — the char before `{{` decides, keeping the rule one-character simple.
    //
    // RESIDUAL: the escape is consumed on the FIRST render — the emitted text is bare `{{char}}`. A
    // consumer that pipes one render's OUTPUT through a SECOND processMacros pass will then expand
    // that now-unescaped token. The fix is to NOT re-render resolved output (assemble render-once
    // memoization) rather than re-escape on emit, which would change passthrough bytes.
    if (tagStart > 0 && text.charAt(tagStart - 1) === "\\") {
      flatAst.push({ type: "text", value: `${text.slice(pos, tagStart - 1)}{{` });
      pos = tagStart + BRACE_LEN;
      continue;
    }

    if (tagStart > pos) {
      flatAst.push({ type: "text", value: text.slice(pos, tagStart) });
    }

    const result = readTag(text, tagStart, tagStart + BRACE_LEN, cursor);
    for (const node of result.nodes) {
      flatAst.push(node);
    }
    pos = result.pos;
    if (result.stop) {
      break;
    }
  }

  return buildBlocks(flatAst);
}

function splitArgs(argStr: string, separator: string): string[] {
  const args: string[] = [];
  let currentArg = "";
  let depth = 0;

  for (let i = 0; i < argStr.length; i += 1) {
    if (argStr.startsWith("{{", i)) {
      depth += 1;
      currentArg += "{{";
      i += 1;
    } else if (argStr.startsWith("}}", i)) {
      // Clamp at 0 — a stray `}}` inside an arg string (e.g. a literal close in user text) just
      // appends without dipping the depth below zero. The main scanner does this too, so the
      // behavior matches even though the shape looks asymmetric at first glance.
      if (depth > 0) {
        depth -= 1;
      }
      currentArg += "}}";
      i += 1;
    } else if (depth === 0 && argStr.startsWith(separator, i)) {
      args.push(currentArg.trim());
      currentArg = "";
      i += separator.length - 1;
    } else {
      currentArg += argStr.charAt(i);
    }
  }

  if (currentArg.trim().length > 0) {
    args.push(currentArg.trim());
  }

  return args;
}

function parseArgs(argStr: string): string[] {
  const trimmedArgStr = argStr.trim();
  if (trimmedArgStr.length === 0) {
    return [];
  }

  // Legacy card-format supports :: and :
  if (trimmedArgStr.startsWith("::")) {
    return splitArgs(trimmedArgStr.slice(DOUBLE_COLON_PREFIX_LEN), "::");
  }
  if (trimmedArgStr.startsWith(":")) {
    return splitArgs(trimmedArgStr.slice(1), ",");
  }
  // Legacy whitespace-separated form (`{{macro foo=bar baz=qux}}`). Split on whitespace so each
  // `key=value` pair is its own arg rather than a single un-split blob. splitArgs respects {{...}}
  // nesting depth so a macro inside an arg doesn't get torn. Filter empties — consecutive spaces
  // shouldn't manifest as "" args.
  return splitArgs(trimmedArgStr, " ").filter((s) => s.length > 0);
}

// One structuring frame: `open` is the candidate tag that MAY become a block open (null = the root
// sentinel); `children` accumulates everything parsed while the candidate is pending.
interface StackFrame {
  open: MacroCallNode | null;
  children: MacroAST;
}

// Flush a run of never-closed candidate frames into `target`, in document order — each was an INLINE call
// all along (its tag + its accumulated children splice back where they were parsed; under the universal
// grammar this is the common case: every `{{setvar::k::v}}` is a candidate until proven inline).
//
// LINEAR, not a per-tip cascade. The old `revertTip` popped ONE tip and did
// `parent.children.push(open, ...children)`, called in a loop; because each revert re-copied the
// accumulating tail one frame up, unwinding K frames was O(K²). For a flat run of inline macros
// (`{{a}}{{a}}…` — the DoS shape, or a wide crossing like `{{a}}{{b}}…{{b}}{{/a}}`) K = the tag count, so
// the unwind alone was ~2 s on a 100 KB field (2026-08-09 audit; the OTHER half was `spanAt`). A full
// unwind is just each frame's `open` followed by its own children, concatenated in order after the target's
// existing prefix — one pass, O(total nodes). Byte-identical AST to the cascade.
function flushFrames(target: StackFrame, frames: readonly StackFrame[]): void {
  for (const frame of frames) {
    if (frame.open === null) {
      continue;
    }
    target.children.push(frame.open);
    for (const child of frame.children) {
      target.children.push(child);
    }
  }
}

// A `/`-flagged close: pair it with the NEAREST same-name candidate (innermost-first, so nested
// same-name blocks pair correctly). Candidates stacked ABOVE the match close OUTSIDE their scope —
// they revert to inline calls (a crossing pair degrades, never throws). No candidate matches → the
// close re-emits its literal bytes (the raw posture).
function closeBlock(stack: StackFrame[], close: FlatClose): void {
  let openIdx = NOT_FOUND;
  for (let i = stack.length - 1; i >= 1; i -= 1) {
    if (stack[i]?.open?.name === close.name) {
      openIdx = i;
      break;
    }
  }
  if (openIdx === NOT_FOUND) {
    stack.at(-1)?.children.push({ type: "text", value: close.raw });
    return;
  }
  const frame = stack[openIdx];
  if (frame === undefined || frame.open === null) {
    return;
  }
  // Every candidate stacked ABOVE the match crossed its scope — revert them to inline calls, in ONE linear
  // pass (the old `while (…) revertTip` cascade was O(K²) for a wide crossing). `splice` removes them from
  // the stack and hands them to flushFrames in document order; the matched frame is then popped + blocked.
  flushFrames(frame, stack.splice(openIdx + 1));
  stack.pop();
  const parent = stack.at(-1);
  if (parent === undefined) {
    return;
  }
  const { name, args, raw, span, flags } = frame.open;
  const blockNode: MacroBlockNode = {
    type: "block",
    name,
    args,
    children: frame.children,
    ...(raw !== undefined ? { raw } : {}),
    ...(span !== undefined ? { span } : {}),
    ...(flags !== undefined ? { flags } : {}),
    closeRaw: close.raw,
  };
  parent.children.push(blockNode);
}

// Universal block pairing (§12A.1): EVERY macro tag is a candidate open; a matching `{{/name}}` in scope
// makes it a MacroBlockNode, EOF (or an enclosing close) makes it the inline call it always was.
function buildBlocks(flatAst: FlatNode[]): MacroAST {
  const root: MacroAST = [];
  const stack: StackFrame[] = [{ open: null, children: root }];

  for (const node of flatAst) {
    if (node.type === "blockClose") {
      closeBlock(stack, node);
    } else if (node.type === "macro") {
      stack.push({ open: node, children: [] });
    } else {
      stack.at(-1)?.children.push(node);
    }
  }

  // EOF: every still-open candidate was inline all along — flush them all into root in ONE linear pass.
  const rootFrame = stack[0];
  if (rootFrame !== undefined) {
    flushFrames(rootFrame, stack.splice(1));
  }
  return root;
}
