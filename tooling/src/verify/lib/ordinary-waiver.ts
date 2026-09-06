// Parser-backed acquisition and exact-occurrence reconciliation for final ordinary policy waivers.
import type { SourceFile } from "ts-morph";
import { SyntaxKind, ts } from "ts-morph";
import type { CoordinatedGateFinding, OrdinaryAuthorityAlarm, SelectedGatePolicy } from "../contract/gate-authority.ts";
import type {
  OrdinaryWaiverBindingFailure,
  OrdinaryWaiverEngine,
  OrdinaryWaiverEngineInput,
  OrdinaryWaiverMarkerMatch,
  OrdinaryWaiverMarkerOutcome,
  OrdinaryWaiverMatchResult,
} from "../contract/ordinary-waiver.ts";
import type { OrdinaryWaiverResourceFormat, OrdinaryWaiverSource } from "../contract/ordinary-waiver-source.ts";
import { blankTsComments, commentSpansInText, forEachCommentRange } from "./comment-spans.ts";
import { isPolicySourceCandidate } from "./policy-source-candidate.ts";

const MARKER = "@orb-waive";
const KEBAB = String.raw`[a-z][a-z0-9]*(?:-[a-z0-9]+)*`;
const EXACT_MARKER_RE = new RegExp(String.raw`^${MARKER}\s+(${KEBAB})\(([^()\r\n]+)\):[\t ]*(\S[^\r\n]*)$`, "u");
const ATTEMPT_RE = new RegExp(String.raw`^${MARKER}(?:\s|$)`, "u");
const PARTIAL_POLICY_RE = new RegExp(String.raw`^${MARKER}(?:\s+([^\s(:]+))?`, "u");
const UNKNOWN_POLICY = "ordinary-waiver";
const HTML_COMMENT_OPEN = "<!--";
const HTML_COMMENT_CLOSE = "-->";

interface ParsedMarker {
  readonly policyId: string;
  readonly position?: string;
  readonly reason?: string;
  readonly malformed: boolean;
}

interface AcquiredMarker extends ParsedMarker {
  readonly id: string;
  readonly file: string;
  readonly pos: number;
  readonly end: number;
  readonly binding:
    | { readonly kind: "typescript"; readonly carriers: readonly ts.Node[]; readonly jsxExpressions: readonly ts.JsxExpression[] }
    | { readonly kind: "resource"; readonly start: number; readonly end: number };
  readonly initialOutcome: Extract<OrdinaryWaiverMarkerOutcome, "malformed" | "unknown-policy" | "wrong-authority" | "matched">;
}

interface MutableMarker extends ParsedMarker {
  readonly pos: number;
  readonly end: number;
  readonly carriers: Set<ts.Node>;
  readonly jsxExpressions: Set<ts.JsxExpression>;
}

interface LocatedFinding {
  readonly index: number;
  readonly finding: CoordinatedGateFinding;
  readonly offset?: number;
  readonly failure?: OrdinaryWaiverBindingFailure;
}

interface EvaluatedMarker {
  readonly marker: AcquiredMarker;
  readonly candidates: readonly number[];
  outcome: OrdinaryWaiverMarkerOutcome;
}

function commentBody(comment: string): string {
  if (comment.startsWith("//")) {
    return comment.slice(2).trim();
  }
  if (comment.startsWith("--")) {
    return comment.slice(2).trim();
  }
  if (comment.startsWith(HTML_COMMENT_OPEN)) {
    return comment.endsWith(HTML_COMMENT_CLOSE)
      ? comment.slice(HTML_COMMENT_OPEN.length, -HTML_COMMENT_CLOSE.length).trim()
      : comment.slice(HTML_COMMENT_OPEN.length).trim();
  }
  return comment.endsWith("*/") ? comment.slice(2, -2).trim() : comment.slice(2).trim();
}

function parseMarker(comment: string): ParsedMarker | undefined {
  const body = commentBody(comment);
  if (!ATTEMPT_RE.test(body)) {
    return;
  }
  const exact = [...body.matchAll(new RegExp(EXACT_MARKER_RE.source, "gu"))][0];
  if (exact === undefined) {
    const partial = [...body.matchAll(new RegExp(PARTIAL_POLICY_RE.source, "gu"))][0];
    return { policyId: partial?.[1] ?? UNKNOWN_POLICY, malformed: true };
  }
  const policyId = exact[1] ?? UNKNOWN_POLICY;
  const position = exact[2]?.trim() ?? "";
  const reason = exact[3]?.trim() ?? "";
  return position === "" || reason === "" ? { policyId, malformed: true } : { policyId, position, reason, malformed: false };
}

function jsxExpressionOf(node: ts.Node): ts.JsxExpression | undefined {
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

function collectMarkers(sourceFile: SourceFile): MutableMarker[] {
  const text = sourceFile.getFullText();
  const byPosition = new Map<number, MutableMarker>();
  const record = (input: {
    readonly pos: number;
    readonly end: number;
    readonly comment: string;
    readonly carrier: ts.Node;
    readonly jsxExpression?: ts.JsxExpression;
  }): void => {
    const { pos, end, comment, carrier, jsxExpression } = input;
    const parsed = parseMarker(comment);
    if (parsed === undefined) {
      return;
    }
    let marker = byPosition.get(pos);
    if (marker === undefined) {
      marker = { ...parsed, pos, end, carriers: new Set(), jsxExpressions: new Set() };
      byPosition.set(pos, marker);
    }
    marker.carriers.add(carrier);
    if (jsxExpression !== undefined) {
      marker.jsxExpressions.add(jsxExpression);
    }
  };
  forEachCommentRange(sourceFile, (range, node) => {
    const jsxExpression = jsxExpressionOf(node);
    record({
      pos: range.pos,
      end: range.end,
      comment: text.slice(range.pos, range.end),
      carrier: node,
      ...(jsxExpression !== undefined && jsxExpression.pos <= range.pos && jsxExpression.end >= range.end ? { jsxExpression } : {}),
    });
    if (ts.isJsxExpression(node) && node.expression === undefined) {
      const nodeStart = node.getStart(sourceFile.compilerNode);
      const nodeText = text.slice(nodeStart, node.end);
      for (const span of commentSpansInText(nodeText, { lineComments: false })) {
        record({ pos: nodeStart + span.pos, end: nodeStart + span.end, comment: span.text, carrier: node, jsxExpression: node });
      }
    }
  });
  return [...byPosition.values()].toSorted((left, right) => left.pos - right.pos);
}

function policyTable(knownPolicies: readonly SelectedGatePolicy[]): ReadonlyMap<string, SelectedGatePolicy> {
  const table = new Map<string, SelectedGatePolicy>();
  for (const policy of knownPolicies) {
    if (table.has(policy.id)) {
      throw new Error(`ordinary waiver engine received duplicate known policy ${policy.id}`);
    }
    table.set(policy.id, policy);
  }
  return table;
}

function initialOutcome(marker: ParsedMarker, policies: ReadonlyMap<string, SelectedGatePolicy>): AcquiredMarker["initialOutcome"] {
  if (marker.malformed) {
    return "malformed";
  }
  const policy = policies.get(marker.policyId);
  if (policy === undefined) {
    return "unknown-policy";
  }
  return policy.authority === "ordinary" ? "matched" : "wrong-authority";
}

function acquireMarkers(input: OrdinaryWaiverEngineInput, policies: ReadonlyMap<string, SelectedGatePolicy>): readonly AcquiredMarker[] {
  const markers: AcquiredMarker[] = [];
  for (const source of [...input.sources].toSorted((left, right) => left.path.localeCompare(right.path))) {
    if (source.kind === "typescript") {
      if (!isPolicySourceCandidate(source.path)) {
        continue;
      }
      for (const marker of collectMarkers(source.sourceFile)) {
        const { line, column } = source.sourceFile.getLineAndColumnAtPos(marker.pos);
        markers.push({
          ...marker,
          id: `${source.path}:${line}:${column}`,
          file: source.path,
          binding: { kind: "typescript", carriers: [...marker.carriers], jsxExpressions: [...marker.jsxExpressions] },
          initialOutcome: initialOutcome(marker, policies),
        });
      }
      continue;
    }
    const comments = resourceComments(source.text, source.format);
    for (const comment of comments) {
      const parsed = parseMarker(comment.text);
      if (parsed === undefined) {
        continue;
      }
      const { line, column } = textPosition(source.text, comment.pos);
      const binding = followingResourceCarrier(source.text, comment);
      markers.push({
        ...parsed,
        id: `${source.path}:${line}:${column}`,
        file: source.path,
        pos: comment.pos,
        end: comment.end,
        binding: { kind: "resource", ...binding },
        initialOutcome: initialOutcome(parsed, policies),
      });
    }
  }
  return markers;
}

interface ResourceComment {
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

function resourceComments(text: string, format: OrdinaryWaiverResourceFormat): readonly ResourceComment[] {
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

function textPosition(text: string, offset: number): { readonly line: number; readonly column: number } {
  const starts = lineStarts(text);
  const lineIndex = starts.findLastIndex((candidate) => candidate <= offset);
  const lineStart = starts[lineIndex] ?? 0;
  return { line: lineIndex + 1, column: offset - lineStart + 1 };
}

function followingResourceCarrier(text: string, marker: ResourceComment): { readonly start: number; readonly end: number } {
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

function sourceTable(sources: readonly OrdinaryWaiverSource[]): ReadonlyMap<string, OrdinaryWaiverSource> {
  const table = new Map<string, OrdinaryWaiverSource>();
  for (const source of sources) {
    if (table.has(source.path)) {
      throw new Error(`ordinary waiver engine received duplicate source ${source.path}`);
    }
    table.set(source.path, source);
  }
  return table;
}

function locateFinding(index: number, finding: CoordinatedGateFinding, sources: ReadonlyMap<string, OrdinaryWaiverSource>): LocatedFinding {
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

function carrierContains(carrier: ts.Node, offset: number, root: ts.SourceFile): boolean {
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

function adjacentJsxChildren(expression: ts.JsxExpression, root: ts.SourceFile): readonly ts.JsxChild[] {
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

function markerBinds(marker: AcquiredMarker, offset: number, root?: ts.SourceFile): boolean {
  if (marker.binding.kind === "resource") {
    return marker.binding.start <= offset && offset < marker.binding.end;
  }
  if (root === undefined) {
    throw new Error(`TypeScript ordinary waiver marker has no syntax root: ${marker.id}`);
  }
  if (marker.binding.carriers.some((carrier) => carrierContains(carrier, offset, root))) {
    return true;
  }
  return marker.binding.jsxExpressions.some((expression) =>
    adjacentJsxChildren(expression, root).some((child) => child.getStart(root) <= offset && offset < child.end),
  );
}

function hasAmbiguousTrivia(marker: AcquiredMarker, root: ts.SourceFile): boolean {
  return marker.binding.kind === "typescript" && marker.binding.jsxExpressions.some((expression) => adjacentJsxChildren(expression, root).length > 1);
}

function evaluateMarker(marker: AcquiredMarker, findings: readonly LocatedFinding[], sources: ReadonlyMap<string, OrdinaryWaiverSource>): EvaluatedMarker {
  if (marker.initialOutcome !== "matched") {
    return { marker, candidates: [], outcome: marker.initialOutcome };
  }
  const source = sources.get(marker.file);
  if (source === undefined) {
    return { marker, candidates: [], outcome: "unbound-trivia" };
  }
  if (source.kind === "typescript" && hasAmbiguousTrivia(marker, source.sourceFile.compilerNode)) {
    return { marker, candidates: [], outcome: "ambiguous-trivia" };
  }
  const inFile = findings.filter(({ finding, offset }) => finding.file === marker.file && finding.policyId === marker.policyId && offset !== undefined);
  const root = source.kind === "typescript" ? source.sourceFile.compilerNode : undefined;
  const inCarrier = inFile.filter(({ offset }) => markerBinds(marker, offset as number, root));
  const candidates = inCarrier.filter(({ finding }) => finding.token === marker.position).map(({ index }) => index);
  if (candidates.length > 1) {
    return { marker, candidates, outcome: "over-broad" };
  }
  if (candidates.length === 1) {
    return { marker, candidates, outcome: "matched" };
  }
  if (inCarrier.length > 0) {
    return { marker, candidates, outcome: "dead-position" };
  }
  return {
    marker,
    candidates,
    outcome: inFile.some(({ finding }) => finding.token === marker.position) ? "unbound-trivia" : "stale",
  };
}

function matchBatch(
  markers: readonly AcquiredMarker[],
  sources: ReadonlyMap<string, OrdinaryWaiverSource>,
  findings: readonly CoordinatedGateFinding[],
): OrdinaryWaiverMatchResult {
  const located = findings.map((finding, index) => locateFinding(index, finding, sources));
  const evaluated = markers.map((marker) => evaluateMarker(marker, located, sources));
  const byFinding = Map.groupBy(
    evaluated.filter(({ outcome, candidates }) => outcome === "matched" && candidates.length === 1),
    ({ candidates }) => candidates[0] as number,
  );
  const waiverIds: (string | null)[] = Array.from({ length: findings.length }, () => null);
  for (const [findingIndex, matches] of byFinding) {
    if (matches.length === 1) {
      waiverIds[findingIndex] = matches[0]?.marker.id ?? null;
    } else {
      for (const match of matches) {
        match.outcome = "duplicate-target";
      }
    }
  }
  const markerMatches: OrdinaryWaiverMarkerMatch[] = evaluated.map(({ marker, outcome, candidates }) => ({
    id: marker.id,
    policyId: marker.policyId,
    outcome,
    candidateCount: candidates.length,
  }));
  return {
    waiverIds,
    consumption: new Map(markerMatches.map(({ id, candidateCount }) => [id, candidateCount])),
    markers: markerMatches,
    bindingFailures: located.flatMap(({ failure }) => (failure === undefined ? [] : [failure])),
  };
}

function markerMessage(marker: OrdinaryWaiverMarkerMatch): string | undefined {
  const at = marker.id;
  if (marker.outcome === "matched") {
    return;
  }
  const messages: Record<Exclude<OrdinaryWaiverMarkerOutcome, "matched">, string> = {
    malformed: `malformed ordinary waiver at ${at}; expected ${MARKER} <policy-id>(<position>): <reason>`,
    "unknown-policy": `ordinary waiver at ${at} targets unknown policy ${marker.policyId}`,
    "wrong-authority": `ordinary waiver at ${at} targets non-ordinary policy ${marker.policyId}`,
    stale: `stale ordinary waiver at ${at}; no live ${marker.policyId} finding is bound to its comment carrier`,
    "dead-position": `ordinary waiver at ${at} names a dead position for ${marker.policyId}`,
    "unbound-trivia": `ordinary waiver at ${at} cannot bind through comment trivia to the matching ${marker.policyId} occurrence`,
    "ambiguous-trivia": `ordinary waiver at ${at} has ambiguous comment trivia spanning disjoint authored regions and suppressed none`,
    "over-broad": `over-broad ordinary waiver at ${at} matched ${marker.candidateCount} findings and suppressed none`,
    "duplicate-target": `duplicate ordinary waivers target one ${marker.policyId} finding at ${at}; all suppressed none`,
  };
  return messages[marker.outcome];
}

function reconcileMatch(completedPolicyIds: readonly string[], match: OrdinaryWaiverMatchResult): readonly OrdinaryAuthorityAlarm[] {
  const completed = new Set(completedPolicyIds);
  const alarms: OrdinaryAuthorityAlarm[] = [];
  for (const marker of match.markers) {
    const completionBound = ["stale", "dead-position", "unbound-trivia", "ambiguous-trivia", "over-broad", "duplicate-target"].includes(marker.outcome);
    if (completionBound && !completed.has(marker.policyId)) {
      continue;
    }
    const message = markerMessage(marker);
    if (message !== undefined) {
      alarms.push({ kind: "ordinary-waiver", policyId: marker.policyId, waiverId: marker.id, message });
    }
  }
  for (const failure of match.bindingFailures) {
    if (completed.has(failure.policyId)) {
      alarms.push({ kind: "ordinary-waiver", policyId: failure.policyId, message: failure.message });
    }
  }
  return alarms.toSorted(
    (left, right) =>
      left.policyId.localeCompare(right.policyId) || (left.waiverId ?? "").localeCompare(right.waiverId ?? "") || left.message.localeCompare(right.message),
  );
}

export function createOrdinaryWaiverEngine(input: OrdinaryWaiverEngineInput): OrdinaryWaiverEngine {
  const policies = policyTable(input.knownPolicies);
  const sources = sourceTable(input.sources);
  const markers = acquireMarkers(input, policies);
  return {
    match: (findings) => matchBatch(markers, sources, findings),
    reconcile: ({ completedPolicyIds, match }) => reconcileMatch(completedPolicyIds, match),
  };
}
