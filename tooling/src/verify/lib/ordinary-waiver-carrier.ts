// THE CARRIER HALF of the ordinary-waiver engine — WHERE things sit, never WHAT they mean: the comment
// scanners for resource text (css/markdown/jsonc/sql), the TypeScript carrier geometry (which authored node
// a comment binds to, stopping at declaration boundaries; which JSX children are adjacent), and the exact
// location of a finding's position token in comment-blanked source. Split out of `ordinary-waiver.ts` at
// the size cap (2026-09-18). It knows no marker grammar, no policy and no outcome — those stay in the engine
// `policy-legacy-imports` fences gates from — and it imports nothing from `ordinary-waiver.ts`.
import { SyntaxKind, ts } from "ts-morph";
import type { CoordinatedGateFinding } from "../contract/gate-authority.ts";
import type { OrdinaryWaiverBindingFailure } from "../contract/ordinary-waiver.ts";
import type { OrdinaryWaiverResourceFormat, OrdinaryWaiverSource } from "../contract/ordinary-waiver-source.ts";
import { blankTsComments } from "./comment-spans.ts";

/** The HTML comment delimiters — a markdown carrier's only comment syntax, and the spelling the engine's
 *  `commentBody` strips as well, so both halves read one pair. */
export const HTML_COMMENT_OPEN = "<!--";
export const HTML_COMMENT_CLOSE = "-->";

export interface LocatedFinding {
  readonly index: number;
  readonly finding: CoordinatedGateFinding;
  readonly offset?: number;
  readonly failure?: OrdinaryWaiverBindingFailure;
}

export function jsxExpressionOf(node: ts.Node): ts.JsxExpression | undefined {
  let current = node;
  let expression: ts.JsxExpression | undefined;
  while (current.kind !== SyntaxKind.SourceFile && expression === undefined) {
    if (ts.isJsxExpression(current)) {
      expression = current;
    } else {
      current = current.parent;
    }
  }
  return expression;
}

export interface ResourceComment {
  readonly pos: number;
  readonly end: number;
  readonly text: string;
}

interface ResourceQuoteState {
  quote: string;
  escaped: boolean;
}

function consumesResourceQuote(state: ResourceQuoteState, char: string): boolean {
  if (state.escaped) {
    state.escaped = false;
    return true;
  }
  if (state.quote !== "") {
    if (char === "\\") {
      state.escaped = true;
    } else if (char === state.quote) {
      state.quote = "";
    }
    return true;
  }
  if (char === '"' || char === "'" || char === "`") {
    state.quote = char;
    return true;
  }
  return false;
}

function lineCommentAt(text: string, index: number, prefix: "//" | "--"): ResourceComment {
  const newline = text.indexOf("\n", index + prefix.length);
  const end = newline === -1 ? text.length : newline;
  return { pos: index, end, text: text.slice(index, end) };
}

function blockCommentAt(text: string, index: number): ResourceComment {
  const close = text.indexOf("*/", index + "/*".length);
  const end = close === -1 ? text.length : close + "*/".length;
  return { pos: index, end, text: text.slice(index, end) };
}

function codeComments(text: string, options: { readonly linePrefix?: "//" | "--"; readonly block: boolean }): readonly ResourceComment[] {
  const comments: ResourceComment[] = [];
  const quote: ResourceQuoteState = { quote: "", escaped: false };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";
    if (consumesResourceQuote(quote, char)) {
      continue;
    }
    const linePrefix = options.linePrefix;
    if (linePrefix !== undefined && text.startsWith(linePrefix, index)) {
      const comment = lineCommentAt(text, index, linePrefix);
      comments.push(comment);
      index = comment.end - 1;
      continue;
    }
    if (options.block && text.startsWith("/*", index)) {
      const comment = blockCommentAt(text, index);
      comments.push(comment);
      index = comment.end - 1;
    }
  }
  return comments;
}

function markdownFence(line: string, current: "```" | "~~~" | undefined): "```" | "~~~" | undefined {
  const trimmed = line.trimStart();
  if (current !== undefined) {
    return trimmed.startsWith(current) ? undefined : current;
  }
  if (trimmed.startsWith("```")) {
    return "```";
  }
  return trimmed.startsWith("~~~") ? "~~~" : undefined;
}

function markdownCommentsInLine(text: string, line: string, offset: number): readonly ResourceComment[] {
  const comments: ResourceComment[] = [];
  let from = 0;
  while (from < line.length) {
    const open = line.indexOf(HTML_COMMENT_OPEN, from);
    if (open === -1) {
      break;
    }
    const pos = offset + open;
    const close = text.indexOf(HTML_COMMENT_CLOSE, pos + HTML_COMMENT_OPEN.length);
    const end = close === -1 ? text.length : close + HTML_COMMENT_CLOSE.length;
    comments.push({ pos, end, text: text.slice(pos, end) });
    if (end >= offset + line.length) {
      break;
    }
    from = end - offset;
  }
  return comments;
}

function markdownComments(text: string): readonly ResourceComment[] {
  const comments: ResourceComment[] = [];
  let fence: "```" | "~~~" | undefined;
  let offset = 0;
  for (const line of text.split(/(?<=\n)/u)) {
    const nextFence = markdownFence(line, fence);
    if (fence === undefined && nextFence === undefined) {
      comments.push(...markdownCommentsInLine(text, line, offset));
    }
    fence = nextFence;
    offset += line.length;
  }
  return comments;
}

export function resourceComments(text: string, format: OrdinaryWaiverResourceFormat): readonly ResourceComment[] {
  switch (format) {
    case "css":
      return codeComments(text, { block: true });
    case "markdown":
      return markdownComments(text);
    case "jsonc":
      return codeComments(text, { linePrefix: "//", block: true });
    case "json":
      return [];
    case "sql":
      return codeComments(text, { linePrefix: "--", block: true });
  }
}

function blankResourceComments(text: string, format: OrdinaryWaiverResourceFormat): string {
  const chars = [...text];
  for (const comment of resourceComments(text, format)) {
    for (let index = comment.pos; index < comment.end; index += 1) {
      if (chars[index] !== "\n" && chars[index] !== "\r") {
        chars[index] = " ";
      }
    }
  }
  return chars.join("");
}

export function textPosition(text: string, offset: number): { readonly line: number; readonly column: number } {
  const starts = lineStarts(text);
  const lineIndex = starts.findLastIndex((candidate) => candidate <= offset);
  const lineStart = starts[lineIndex] ?? 0;
  return { line: lineIndex + 1, column: offset - lineStart + 1 };
}

export function followingResourceCarrier(text: string, marker: ResourceComment): { readonly start: number; readonly end: number } {
  const markerLineEnd = text.indexOf("\n", marker.end);
  if (markerLineEnd === -1) {
    return { start: text.length, end: text.length };
  }
  const start = markerLineEnd + 1;
  const newline = text.indexOf("\n", start);
  return { start, end: newline === -1 ? text.length : newline };
}

function lineStarts(text: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.startsWith("\n", index)) {
      starts.push(index + 1);
    }
  }
  return starts;
}

export function sourceTable(sources: readonly OrdinaryWaiverSource[]): ReadonlyMap<string, OrdinaryWaiverSource> {
  const table = new Map<string, OrdinaryWaiverSource>();
  for (const source of sources) {
    if (table.has(source.path)) {
      throw new Error(`ordinary waiver engine received duplicate source ${source.path}`);
    }
    table.set(source.path, source);
  }
  return table;
}

export function locateFinding(index: number, finding: CoordinatedGateFinding, sources: ReadonlyMap<string, OrdinaryWaiverSource>): LocatedFinding {
  const source = sources.get(finding.file);
  const token = finding.token;
  const at = `${finding.file}:${finding.line}:${finding.column}`;
  if (source === undefined) {
    return {
      index,
      finding,
      failure: { policyId: finding.policyId, message: `ordinary finding ${at} has no declared source or resource carrier for waiver binding` },
    };
  }
  if (token === undefined || token.trim() === "") {
    return { index, finding, failure: { policyId: finding.policyId, message: `ordinary finding ${at} has no nonempty position token for waiver binding` } };
  }
  const text = source.kind === "typescript" ? source.sourceFile.getFullText() : source.text;
  const starts = lineStarts(text);
  const lineStart = starts[finding.line - 1];
  if (lineStart === undefined) {
    return {
      index,
      finding,
      failure: { policyId: finding.policyId, message: `ordinary finding ${at} falls outside its waiver carrier` },
    };
  }
  const lineEnd = starts[finding.line] === undefined ? text.length : (starts[finding.line] ?? text.length) - 1;
  const offset = lineStart + finding.column - 1;
  if (offset < lineStart || offset + token.length > lineEnd || text.slice(offset, offset + token.length) !== token) {
    return {
      index,
      finding,
      failure: { policyId: finding.policyId, message: `ordinary finding ${at} does not point at its exact position token ${JSON.stringify(token)}` },
    };
  }
  const authored = source.kind === "typescript" ? blankTsComments(source.sourceFile) : blankResourceComments(source.text, source.format);
  if (authored.slice(offset, offset + token.length) !== token) {
    return {
      index,
      finding,
      failure: { policyId: finding.policyId, message: `ordinary finding ${at} points into comment trivia rather than authored code` },
    };
  }
  return { index, finding, offset };
}

const DECLARATION_BOUNDARY_KINDS: ReadonlySet<ts.SyntaxKind> = new Set([
  SyntaxKind.BindingElement,
  SyntaxKind.EnumMember,
  SyntaxKind.GetAccessor,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.MethodSignature,
  SyntaxKind.Parameter,
  SyntaxKind.PropertyAssignment,
  SyntaxKind.PropertyDeclaration,
  SyntaxKind.PropertySignature,
  SyntaxKind.SetAccessor,
  SyntaxKind.ShorthandPropertyAssignment,
  SyntaxKind.TypeParameter,
  SyntaxKind.VariableDeclaration,
]);

function isBoundary(node: ts.Node): boolean {
  return ts.isStatement(node) || ts.isJsxExpression(node) || DECLARATION_BOUNDARY_KINDS.has(node.kind);
}

export function carrierContains(carrier: ts.Node, offset: number, root: ts.SourceFile): boolean {
  let node = carrier;
  while (node.kind !== SyntaxKind.SourceFile && node.kind !== SyntaxKind.SyntaxList) {
    if (node.getStart(root) <= offset && offset < node.end) {
      return true;
    }
    if (isBoundary(node)) {
      return false;
    }
    node = node.parent;
  }
  return false;
}

function significantJsxChild(child: ts.JsxChild, root: ts.SourceFile): boolean {
  if (ts.isJsxText(child)) {
    return child.getText(root).trim() !== "";
  }
  return !(ts.isJsxExpression(child) && child.expression === undefined);
}

export function adjacentJsxChildren(expression: ts.JsxExpression, root: ts.SourceFile): readonly ts.JsxChild[] {
  const parent = expression.parent;
  if (!(ts.isJsxElement(parent) || ts.isJsxFragment(parent))) {
    return [];
  }
  const children = [...parent.children];
  const markerIndex = children.indexOf(expression);
  const adjacent: ts.JsxChild[] = [];
  for (let index = markerIndex - 1; index >= 0; index -= 1) {
    const child = children[index];
    if (child !== undefined && significantJsxChild(child, root)) {
      adjacent.push(child);
      break;
    }
  }
  for (let index = markerIndex + 1; index < children.length; index += 1) {
    const child = children[index];
    if (child !== undefined && significantJsxChild(child, root)) {
      adjacent.push(child);
      break;
    }
  }
  return adjacent;
}
