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
import { blankTsComments, commentSpansInText, forEachTriviaCarrier } from "./comment-spans.ts";
import { isPolicySourceCandidate } from "./policy-source-candidate.ts";

const MARKER = "@orb-waive";
const KEBAB = String.raw`[a-z][a-z0-9]*(?:-[a-z0-9]+)*`;
const EXACT_MARKER_RE = new RegExp(String.raw`^${MARKER}\s+(${KEBAB})\(([^()\r\n]+)\):[\t ]*(\S[^\r\n]*)$`, "u");
const ATTEMPT_RE = new RegExp(String.raw`^${MARKER}(?:\s|$)`, "u");
const PARTIAL_POLICY_RE = new RegExp(String.raw`^${MARKER}(?:\s+([^\s(:]+))?`, "u");
const UNKNOWN_POLICY = "ordinary-waiver";

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
  readonly carriers: readonly ts.Node[];
  readonly jsxExpressions: readonly ts.JsxExpression[];
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
  forEachTriviaCarrier(sourceFile, (node) => {
    const ranges = [...(ts.getLeadingCommentRanges(text, node.pos) ?? []), ...(ts.getTrailingCommentRanges(text, node.end) ?? [])];
    for (const range of ranges) {
      const jsxExpression = jsxExpressionOf(node);
      record({
        pos: range.pos,
        end: range.end,
        comment: text.slice(range.pos, range.end),
        carrier: node,
        ...(jsxExpression !== undefined && jsxExpression.pos <= range.pos && jsxExpression.end >= range.end ? { jsxExpression } : {}),
      });
    }
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
  for (const [file, sourceFile] of [...input.sourceFiles].toSorted(([left], [right]) => left.localeCompare(right))) {
    if (!isPolicySourceCandidate(file)) {
      continue;
    }
    for (const marker of collectMarkers(sourceFile)) {
      const { line, column } = sourceFile.getLineAndColumnAtPos(marker.pos);
      markers.push({
        ...marker,
        id: `${file}:${line}:${column}`,
        file,
        carriers: [...marker.carriers],
        jsxExpressions: [...marker.jsxExpressions],
        initialOutcome: initialOutcome(marker, policies),
      });
    }
  }
  return markers;
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

function locateFinding(index: number, finding: CoordinatedGateFinding, sourceFiles: ReadonlyMap<string, SourceFile>): LocatedFinding {
  const sourceFile = sourceFiles.get(finding.file);
  const token = finding.token;
  const at = `${finding.file}:${finding.line}:${finding.column}`;
  if (sourceFile === undefined) {
    return { index, finding, failure: { policyId: finding.policyId, message: `ordinary finding ${at} has no TypeScript SourceFile for waiver binding` } };
  }
  if (token === undefined || token.trim() === "") {
    return { index, finding, failure: { policyId: finding.policyId, message: `ordinary finding ${at} has no nonempty position token for waiver binding` } };
  }
  const text = sourceFile.getFullText();
  const starts = lineStarts(text);
  const lineStart = starts[finding.line - 1];
  if (lineStart === undefined) {
    return {
      index,
      finding,
      failure: { policyId: finding.policyId, message: `ordinary finding ${at} falls outside its TypeScript SourceFile` },
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
  if (blankTsComments(sourceFile).slice(offset, offset + token.length) !== token) {
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

function markerBinds(marker: AcquiredMarker, offset: number, root: ts.SourceFile): boolean {
  if (marker.carriers.some((carrier) => carrierContains(carrier, offset, root))) {
    return true;
  }
  return marker.jsxExpressions.some((expression) =>
    adjacentJsxChildren(expression, root).some((child) => child.getStart(root) <= offset && offset < child.end),
  );
}

function hasAmbiguousTrivia(marker: AcquiredMarker, root: ts.SourceFile): boolean {
  return marker.jsxExpressions.some((expression) => adjacentJsxChildren(expression, root).length > 1);
}

function evaluateMarker(marker: AcquiredMarker, findings: readonly LocatedFinding[], sourceFiles: OrdinaryWaiverEngineInput["sourceFiles"]): EvaluatedMarker {
  if (marker.initialOutcome !== "matched") {
    return { marker, candidates: [], outcome: marker.initialOutcome };
  }
  const sourceFile = sourceFiles.get(marker.file);
  if (sourceFile === undefined) {
    return { marker, candidates: [], outcome: "unbound-trivia" };
  }
  if (hasAmbiguousTrivia(marker, sourceFile.compilerNode)) {
    return { marker, candidates: [], outcome: "ambiguous-trivia" };
  }
  const inFile = findings.filter(({ finding, offset }) => finding.file === marker.file && finding.policyId === marker.policyId && offset !== undefined);
  const inCarrier = inFile.filter(({ offset }) => markerBinds(marker, offset as number, sourceFile.compilerNode));
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
  sourceFiles: OrdinaryWaiverEngineInput["sourceFiles"],
  findings: readonly CoordinatedGateFinding[],
): OrdinaryWaiverMatchResult {
  const located = findings.map((finding, index) => locateFinding(index, finding, sourceFiles));
  const evaluated = markers.map((marker) => evaluateMarker(marker, located, sourceFiles));
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
  const markers = acquireMarkers(input, policies);
  return {
    match: (findings) => matchBatch(markers, input.sourceFiles, findings),
    reconcile: ({ completedPolicyIds, match }) => reconcileMatch(completedPolicyIds, match),
  };
}
