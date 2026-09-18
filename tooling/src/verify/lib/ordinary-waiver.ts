// Parser-backed acquisition and exact-occurrence reconciliation for final ordinary policy waivers. The
// CARRIER half — where a comment sits and what authored region it can bind to, in TypeScript and in resource
// text, and where a finding's token sits — is `ordinary-waiver-carrier.ts` (split out at the size cap
// 2026-09-18). The marker GRAMMAR, the binding verdicts and the engine stay HERE, in the module
// `policy-legacy-imports` fences gates from; the carrier module holds no parser and no outcome.
import type { SourceFile } from "ts-morph";
import { ts } from "ts-morph";
import type { CoordinatedGateFinding, OrdinaryAuthorityAlarm, SelectedGatePolicy } from "../contract/gate-authority.ts";
import type {
  OrdinaryWaiverEngine,
  OrdinaryWaiverEngineInput,
  OrdinaryWaiverMarkerMatch,
  OrdinaryWaiverMarkerOutcome,
  OrdinaryWaiverMatchResult,
} from "../contract/ordinary-waiver.ts";
import type { OrdinaryWaiverSource } from "../contract/ordinary-waiver-source.ts";
import { commentSpansInText, forEachCommentRange } from "./comment-spans.ts";
import type { LocatedFinding, ResourceComment } from "./ordinary-waiver-carrier.ts";
import {
  adjacentJsxChildren,
  carrierContains,
  followingResourceCarrier,
  HTML_COMMENT_CLOSE,
  HTML_COMMENT_OPEN,
  jsxExpressionOf,
  locateFinding,
  resourceComments,
  sourceTable,
  textPosition,
} from "./ordinary-waiver-carrier.ts";
import { isPolicySourceCandidate } from "./policy-source-candidate.ts";
// THE POSITION GRAMMAR LIVES IN `lib/waivable-coordinate.ts` (#2155, arm B) — this engine builds its marker
// regex from the SAME fragment every minting site reads, rather than respelling the class. The grammar moved
// OUT rather than the helper moving in beside it: §12.5 forbids a gate module importing a marker parser, and
// three gates need the coordinate helper, so the shared half had to land somewhere a gate may import.
import { POSITION } from "./waivable-coordinate.ts";

const MARKER = "@orb-waive";
const MARKER_FILE = "@orb-waive-file";
const KEBAB = String.raw`[a-z][a-z0-9]*(?:-[a-z0-9]+)*`;
const EXACT_MARKER_RE = new RegExp(String.raw`^${MARKER}\s+(${KEBAB})\((${POSITION})\):[\t ]*(\S[^\r\n]*)$`, "u");
const EXACT_FILE_MARKER_RE = new RegExp(String.raw`^${MARKER_FILE}\s+(${KEBAB})\((${POSITION})\):[\t ]*(\S[^\r\n]*)$`, "u");
const ATTEMPT_RE = new RegExp(String.raw`^(?:${MARKER_FILE}|${MARKER})(?:\s|$)`, "u");
const PARTIAL_POLICY_RE = new RegExp(String.raw`^(?:${MARKER_FILE}|${MARKER})(?:\s+([^\s(:]+))?`, "u");
const UNKNOWN_POLICY = "ordinary-waiver";

type MarkerScope = "line" | "file";

interface ParsedMarker {
  readonly policyId: string;
  readonly position?: string;
  readonly reason?: string;
  readonly malformed: boolean;
  /** `"line"` = standard carrier-adjacent binding; `"file"` = binds to ANY finding in the same file
   *  (the `@orb-waive-file` grammar for findings inside template literals and other unwaivable spans). */
  readonly scope: MarkerScope;
}

interface AcquiredMarker extends ParsedMarker {
  readonly id: string;
  readonly file: string;
  readonly pos: number;
  readonly end: number;
  readonly binding:
    | { readonly kind: "typescript"; readonly carriers: readonly ts.Node[]; readonly jsxExpressions: readonly ts.JsxExpression[] }
    | { readonly kind: "resource"; readonly start: number; readonly end: number }
    | { readonly kind: "file" };
  readonly initialOutcome: Extract<OrdinaryWaiverMarkerOutcome, "malformed" | "unknown-policy" | "wrong-authority" | "matched">;
}

interface MutableMarker extends ParsedMarker {
  readonly pos: number;
  readonly end: number;
  readonly carriers: Set<ts.Node>;
  readonly jsxExpressions: Set<ts.JsxExpression>;
}

interface EvaluatedMarker {
  readonly marker: AcquiredMarker;
  readonly candidates: readonly number[];
  /** For an UNBOUND marker only: the same-token findings elsewhere in its file — the set a relocation could
   *  reach. Empty for every other outcome. Read once, by `downgradeUnreachableUnbound`. */
  readonly reachable: readonly number[];
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
  // Try file-scoped grammar first (longer prefix), then line-scoped.
  const fileExact = [...body.matchAll(new RegExp(EXACT_FILE_MARKER_RE.source, "gu"))][0];
  if (fileExact !== undefined) {
    const policyId = fileExact[1] ?? UNKNOWN_POLICY;
    const position = fileExact[2]?.trim() ?? "";
    const reason = fileExact[3]?.trim() ?? "";
    return position === "" || reason === "" ? { policyId, malformed: true, scope: "file" } : { policyId, position, reason, malformed: false, scope: "file" };
  }
  const exact = [...body.matchAll(new RegExp(EXACT_MARKER_RE.source, "gu"))][0];
  if (exact === undefined) {
    const partial = [...body.matchAll(new RegExp(PARTIAL_POLICY_RE.source, "gu"))][0];
    return { policyId: partial?.[1] ?? UNKNOWN_POLICY, malformed: true, scope: "line" };
  }
  const policyId = exact[1] ?? UNKNOWN_POLICY;
  const position = exact[2]?.trim() ?? "";
  const reason = exact[3]?.trim() ?? "";
  return position === "" || reason === "" ? { policyId, malformed: true, scope: "line" } : { policyId, position, reason, malformed: false, scope: "line" };
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

function tsBinding(marker: MutableMarker): AcquiredMarker["binding"] {
  if (marker.scope === "file") {
    return { kind: "file" };
  }
  return { kind: "typescript", carriers: [...marker.carriers], jsxExpressions: [...marker.jsxExpressions] };
}

function resourceBinding(parsed: ParsedMarker, source: string, comment: ResourceComment): AcquiredMarker["binding"] {
  if (parsed.scope === "file") {
    return { kind: "file" };
  }
  return { kind: "resource", ...followingResourceCarrier(source, comment) };
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
          binding: tsBinding(marker),
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
      markers.push({
        ...parsed,
        id: `${source.path}:${line}:${column}`,
        file: source.path,
        pos: comment.pos,
        end: comment.end,
        binding: resourceBinding(parsed, source.text, comment),
        initialOutcome: initialOutcome(parsed, policies),
      });
    }
  }
  return markers;
}

function markerBinds(marker: AcquiredMarker, offset: number, root?: ts.SourceFile): boolean {
  if (marker.binding.kind === "file") {
    return true;
  }
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
  if (marker.binding.kind !== "typescript") {
    return false;
  }
  return marker.binding.jsxExpressions.some((expression) => adjacentJsxChildren(expression, root).length > 1);
}

function evaluateMarker(marker: AcquiredMarker, findings: readonly LocatedFinding[], sources: ReadonlyMap<string, OrdinaryWaiverSource>): EvaluatedMarker {
  if (marker.initialOutcome !== "matched") {
    return { marker, candidates: [], reachable: [], outcome: marker.initialOutcome };
  }
  const source = sources.get(marker.file);
  if (source === undefined) {
    return { marker, candidates: [], reachable: [], outcome: "unbound-trivia" };
  }
  if (source.kind === "typescript" && hasAmbiguousTrivia(marker, source.sourceFile.compilerNode)) {
    return { marker, candidates: [], reachable: [], outcome: "ambiguous-trivia" };
  }
  const inFile = findings.filter(({ finding, offset }) => finding.file === marker.file && finding.policyId === marker.policyId && offset !== undefined);
  const root = source.kind === "typescript" ? source.sourceFile.compilerNode : undefined;
  const inCarrier = inFile.filter(({ offset }) => markerBinds(marker, offset as number, root));
  const candidates = inCarrier.filter(({ finding }) => finding.token === marker.position).map(({ index }) => index);
  if (candidates.length > 1) {
    return { marker, candidates, reachable: [], outcome: "over-broad" };
  }
  if (candidates.length === 1) {
    return { marker, candidates, reachable: [], outcome: "matched" };
  }
  if (inCarrier.length > 0) {
    return { marker, candidates, reachable: [], outcome: "dead-position" };
  }
  // NOTHING IN THE CARRIER. Two different authoring errors land here and position data alone cannot tell
  // them apart, which is why `reachable` is carried forward rather than collapsed to a boolean:
  //   (A) the marker sits on the WRONG STATEMENT and the finding it meant is one statement over — remedy
  //       RELOCATE, which is what `unbound-trivia` tells its reader to do;
  //   (B) the marker sits on something that is not a site at all, and the same-token finding elsewhere is
  //       not its business — remedy DELETE.
  // `downgradeUnreachableUnbound` separates them one pass later, once it is known which findings other
  // markers have already claimed.
  const reachable = inFile.filter(({ finding }) => finding.token === marker.position).map(({ index }) => index);
  return { marker, candidates, reachable, outcome: reachable.length > 0 ? "unbound-trivia" : "stale" };
}

/** RELOCATION MUST BE AN AVAILABLE REMEDY FOR `unbound-trivia` TO BE THE HONEST LABEL (#2205).
 *
 *  `unbound-trivia` tells its reader to move the marker onto the occurrence it names. That advice is only
 *  true while some reachable finding is still UNCLAIMED. If every same-token finding in the file already
 *  has its own matched marker, relocating this one cannot bind it — the pair would report
 *  `duplicate-target` instead — so the marker is not mis-aimed: it waives nothing and belongs deleted.
 *  That is `stale`, whose message ("no live finding is bound to its comment carrier") is the true one.
 *
 *  MEASURED, and it is why this exists: `lib/biome-rule-liveness.ts:303` carried a waiver over a `catch`
 *  that `{ cause }` chaining already owns, so the site was never in the policy's population at all. Its
 *  `error` position collided with the genuinely-waived EPERM absorb 140 lines up, the engine reported
 *  `unbound-trivia`, and the repair it advertised would have produced a duplicate.
 *
 *  THE NARROW SUBSET IS THE POINT. "Reserve `unbound-trivia` for the case it actually names" was the first
 *  proposal and it over-fixes: the wrong-statement case is REAL, is pinned
 *  (`tests/tooling/verify/lib/ordinary-waiver.test.ts`, the unbound marker whose target is unclaimed), and
 *  its remedy really is relocation. Only "relocation is impossible" moves.
 *
 *  DECLARED LIMIT, seen and priced rather than missed: a marker on a non-site whose same-token sibling
 *  elsewhere in the file is UNCLAIMED still reports `unbound-trivia`, and for that author the true remedy
 *  is delete. It is left alone on purpose. No position-data discriminator separates it from a genuine
 *  wrong-statement marker — both are "carrier empty, unclaimed same-token finding present" — and unlike
 *  the claimed case, "relocate onto it" stays a coherent suggestion, because that finding needs a waiver
 *  or a fix either way. Narrowing further would need author intent, which this engine does not have. */
function downgradeUnreachableUnbound(evaluated: readonly EvaluatedMarker[], claimed: ReadonlySet<number>): void {
  for (const entry of evaluated) {
    if (entry.outcome === "unbound-trivia" && entry.reachable.length > 0 && entry.reachable.every((index) => claimed.has(index))) {
      entry.outcome = "stale";
    }
  }
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
  downgradeUnreachableUnbound(evaluated, new Set(waiverIds.flatMap((waiverId, index) => (waiverId === null ? [] : [index]))));
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
    malformed: `malformed ordinary waiver at ${at}; expected ${MARKER} (or ${MARKER_FILE}) <policy-id>(<position>): <reason>`,
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
