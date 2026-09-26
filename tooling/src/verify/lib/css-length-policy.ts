import { Scanner } from "@tailwindcss/oxide";
import type { Node } from "ts-morph";
import type { CssFacts } from "../contract/resource-css.ts";
import type { StaticClassFactResult, StaticClassSegment } from "../contract/static-class-expression.ts";
import { blankCssComments } from "./comment-spans.ts";

export const SHELL_STYLESHEET = "packages/client/src/features/app-shell/surfaces/shell.css";
export const STRUCTURAL_LENGTH_OPERATION = "structural-css-length";
const LENGTH_RE = /(?<![\w-])-?(?:\d*\.)?\d+(?:dvh|dvw|cqh|px|rem|em|ch|vh|vw)(?![\w-])/iu;
const RAW_NUMBER_RE = /^-?(?:\d*\.)?\d+$/u;

function structuralDeclaration(selector: string, property: string): boolean {
  return (
    (selector === ".shell-grid" && (property.startsWith("--") || property === "height")) ||
    (selector === ".shell-content-primacy-sentinel" && property === "block-size") ||
    (selector.includes(".shell-panel[") && property === "width")
  );
}

function structuralClass(token: string): boolean {
  return (
    token.startsWith("@max-[") ||
    token.startsWith("@[") ||
    token.startsWith("@min-[") ||
    token.startsWith("@md:grid-cols-[") ||
    token.startsWith("grid-cols-[repeat(") ||
    /cqh\]$/u.test(token)
  );
}

export interface CssLengthCandidate {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly token: string;
  readonly subject: string;
  readonly structural: boolean;
  readonly node?: Node;
  readonly offset?: number;
}

function sourceToken(segments: readonly StaticClassSegment[], valueOffset: number): { readonly node: Node; readonly offset: number } | undefined {
  const segment = segments.find((part) => valueOffset >= part.valueStart && valueOffset < part.valueEnd) ?? segments[0];
  return segment === undefined
    ? undefined
    : { node: segment.node, offset: segment.sourceStart + Math.max(0, valueOffset - segment.valueStart) - segment.node.getStart() };
}

function declarationCandidates(css: CssFacts): CssLengthCandidate[] {
  const out: CssLengthCandidate[] = [];
  for (const declaration of css.declarations) {
    if (declaration.file !== SHELL_STYLESHEET) {
      continue;
    }
    const raw = LENGTH_RE.test(declaration.value) || (declaration.property === "line-height" && RAW_NUMBER_RE.test(declaration.value));
    if (!raw) {
      continue;
    }
    const selector = declaration.owner.kind === "style-rule" ? declaration.owner.selectorList : declaration.owner.prelude;
    const subject = `${selector} { ${declaration.property}: ${declaration.value} }`;
    out.push({
      file: declaration.file,
      line: declaration.line,
      column: declaration.column,
      token: declaration.property,
      subject,
      structural: structuralDeclaration(selector, declaration.property),
    });
  }
  return out;
}

function queryCandidates(css: CssFacts): CssLengthCandidate[] {
  const out: CssLengthCandidate[] = [];
  const shell = css.files.find(({ path }) => path === SHELL_STYLESHEET);
  if (shell !== undefined) {
    for (const [index, line] of blankCssComments(shell.text).split(/\r?\n/u).entries()) {
      const token = line.trim();
      if (!(token.startsWith("@") && LENGTH_RE.test(token))) {
        continue;
      }
      out.push({ file: SHELL_STYLESHEET, line: index + 1, column: line.indexOf(token) + 1, token, subject: token, structural: true });
    }
  }
  return out;
}

function classCandidates(classes: StaticClassFactResult, relativePath: (node: Node) => string): CssLengthCandidate[] {
  const out: CssLengthCandidate[] = [];
  const scanner = new Scanner({ sources: [] });
  for (const candidate of classes.tokens) {
    for (const result of scanner.getCandidatesWithPositions({ content: candidate.value, extension: "html" })) {
      const token = result.candidate;
      const match = LENGTH_RE.exec(token);
      if (match === null) {
        continue;
      }
      const anchor = sourceToken(candidate.segments, Number(result.position) + match.index);
      if (anchor === undefined) {
        continue;
      }
      const file = relativePath(anchor.node);
      const position = anchor.node.getSourceFile().getLineAndColumnAtPos(anchor.node.getStart() + anchor.offset);
      const subject = `${file} :: ${token}`;
      out.push({ file, ...position, token: match[0], subject, structural: structuralClass(token), node: anchor.node, offset: anchor.offset });
    }
  }
  return out;
}

export function cssLengthCandidates(css: CssFacts, classes: StaticClassFactResult, relativePath: (node: Node) => string): readonly CssLengthCandidate[] {
  const out = [...declarationCandidates(css), ...queryCandidates(css), ...classCandidates(classes, relativePath)];
  return [...new Map(out.map((candidate) => [`${candidate.file}:${candidate.line}:${candidate.column}:${candidate.subject}`, candidate])).values()];
}
