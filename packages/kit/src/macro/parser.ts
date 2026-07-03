import type { MacroAST, MacroBlockNode, MacroNode } from "./types";

interface FlatBlockOpen {
  type: "blockOpen";
  name: string;
  args: string[];
  raw?: string;
}
type FlatNode = MacroNode | FlatBlockOpen | { type: "blockClose"; name: string };

interface StackFrame {
  node: MacroNode | null;
  children: MacroAST;
}

// What kind of tag a `{{…}}` opened — drives the re-emitted prefix and the built node.
const TAG_KINDS = ["macro", "blockOpen", "blockClose"] as const;
type TagKind = (typeof TAG_KINDS)[number];

// Length of the `{{` opener / `}}` closer / `//` comment marker. The scanner advances by this whole
// token rather than a bare literal so the intent ("skip the delimiter") reads at each site.
const BRACE_LEN = 2;
const COMMENT_MARKER_LEN = 2;
// Length of the legacy `::` arg prefix stripped before `::`-splitting.
const DOUBLE_COLON_PREFIX_LEN = 2;
// `indexOf` / "no closing delimiter" sentinel.
const NOT_FOUND = -1;
// Leading char of an identifier, then word-chars or `-` (`\w` already covers `_`/digits/letters).
const MACRO_IDENT = /^[a-zA-Z][\w-]*/;

// The literal text re-emitted for an invalid/unclosed inline-or-block tag, by which prefix it had.
function prefixFor(kind: TagKind): "{{#" | "{{/" | "{{" {
  if (kind === "blockOpen") {
    return "{{#";
  }
  if (kind === "blockClose") {
    return "{{/";
  }
  return "{{";
}

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

function makeFlatNode(kind: TagKind, name: string, args: string[], raw: string): FlatNode {
  if (kind === "blockClose") {
    return { type: "blockClose", name };
  }
  if (kind === "blockOpen") {
    return { type: "blockOpen", name, args, raw };
  }
  return { type: "macro", name, args, raw };
}

interface TagResult {
  nodes: FlatNode[];
  // Position the main scanner should resume from.
  pos: number;
  // Stop the whole scan (unclosed comment/macro rescued the remainder as literal text).
  stop: boolean;
}

// Parse one tag whose `{{` begins at `tagStart`; `bodyPos` = tagStart + BRACE_LEN points just past
// the opener. Handles comments, the `#`/`/` block prefixes, the identifier, and the arg span.
function readTag(text: string, tagStart: number, bodyPos: number): TagResult {
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

  let pos = bodyPos;
  let kind: TagKind = "macro";
  if (text.charAt(pos) === "#") {
    kind = "blockOpen";
    pos += 1;
  } else if (text.charAt(pos) === "/") {
    kind = "blockClose";
    pos += 1;
  }

  const idMatch = text.slice(pos).match(MACRO_IDENT);
  if (!idMatch) {
    // Invalid macro, treat the prefix as text
    return { nodes: [{ type: "text", value: prefixFor(kind) }], pos, stop: false };
  }
  const name = idMatch[0];
  pos += name.length;

  const { argStr, endMacroPos } = scanMacroBody(text, pos);
  if (endMacroPos === NOT_FOUND) {
    // Unclosed macro → re-emit verbatim and stop.
    const value = prefixFor(kind) + name + argStr;
    return { nodes: [{ type: "text", value }], pos: text.length, stop: true };
  }

  pos = endMacroPos + BRACE_LEN;
  const args = parseArgs(argStr);
  // Original source span of this tag (`{{name:one,two}}` exactly as typed) — carried on the node so
  // unrecognized macros re-emit byte-identical text (review V10-10).
  const raw = text.slice(tagStart, endMacroPos + BRACE_LEN);
  return { nodes: [makeFlatNode(kind, name, args, raw)], pos, stop: false };
}

export function parseMacros(text: string): MacroAST {
  const flatAst: FlatNode[] = [];
  let pos = 0;

  while (pos < text.length) {
    const tagStart = text.indexOf("{{", pos);
    if (tagStart === NOT_FOUND) {
      flatAst.push({ type: "text", value: text.slice(pos) });
      break;
    }

    // Literal-brace escape (review V10-11): a backslash immediately before `{{` makes the opener
    // literal — `\{{char}}` renders as the text `{{char}}` (backslash consumed, macro not parsed).
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

    const result = readTag(text, tagStart, tagStart + BRACE_LEN);
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

function openBlock(stack: StackFrame[], node: FlatBlockOpen): void {
  const blockNode: MacroBlockNode = {
    type: "block",
    name: node.name,
    args: node.args,
    children: [],
    ...(node.raw !== undefined ? { raw: node.raw } : {}),
  };
  stack.at(-1)?.children.push(blockNode);
  stack.push({ node: blockNode, children: blockNode.children });
}

// Close down to the matching open block; an unmatched close is emitted as literal text.
function closeBlock(stack: StackFrame[], name: string): void {
  for (let i = stack.length - 1; i >= 1; i -= 1) {
    const stackNode = stack[i]?.node;
    if (stackNode?.type === "block" && stackNode.name === name) {
      stack.length = i;
      return;
    }
  }
  stack.at(-1)?.children.push({ type: "text", value: `{{/${name}}}` });
}

// Unclosed blocks: any frame still open at EOF (stack deeper than the root sentinel) never saw its
// matching `{{/name}}`. Rather than DROP the open tag + its children (a recognized handler like `if`
// would silently evaluate the trailing text as a complete body), rescue them as literal text —
// mirroring the inline "Unclosed macro" path which re-emits `{{name…}}` verbatim. Unwind tip → root
// so an inner unclosed block is flattened before its (also unclosed) parent.
function rescueUnclosed(stack: StackFrame[]): void {
  for (let i = stack.length - 1; i >= 1; i -= 1) {
    const frame = stack[i];
    if (frame?.node?.type !== "block") {
      continue;
    }
    const blockNode = frame.node;
    const parentChildren = stack[i - 1]?.children;
    if (!parentChildren) {
      continue;
    }
    const idx = parentChildren.lastIndexOf(blockNode);
    if (idx === NOT_FOUND) {
      continue;
    }
    const argSuffix = blockNode.args.length > 0 ? `::${blockNode.args.join("::")}` : "";
    const openTag: MacroNode = {
      type: "text",
      value: blockNode.raw ?? `{{#${blockNode.name}${argSuffix}}}`,
    };
    parentChildren.splice(idx, 1, openTag, ...blockNode.children);
  }
}

function buildBlocks(flatAst: FlatNode[]): MacroAST {
  const root: MacroAST = [];
  const stack: StackFrame[] = [{ node: null, children: root }];

  for (const node of flatAst) {
    if (node.type === "blockOpen") {
      openBlock(stack, node);
    } else if (node.type === "blockClose") {
      closeBlock(stack, node.name);
    } else {
      stack.at(-1)?.children.push(node);
    }
  }

  rescueUnclosed(stack);
  return root;
}
