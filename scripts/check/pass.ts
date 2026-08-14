// The single-pass dispatcher: ONE forEachDescendant walk over the scoped fileset, dispatching each node
// only to the gates subscribed to its kind, then the whole-project `run` passes + `finalize` arms.
//
// Every visit/run/finalize call is wrapped per-gate: a throw becomes a ToolError attributed to the
// gate+phase and does NOT abort the sibling gates. Findings are canonical-sorted here so output is
// deterministic.
//
// It also tallies PER-GATE SCAN HEALTH (`GateScan`) from that same walk — the denominator behind every
// verdict, so a gate that read nothing can no longer render ✓ (`zeroScanGates`).
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { getWorkspace } from "../ts-workspace.ts";
import type { Finding, GateDescriptor, GateRunCtx, GateScanDeclaration, Scope } from "./contract.ts";

/** A gate's own count of units the shared walk cannot see (`ctx.scan({unit,…})`). Reachable to consumers
 *  as `GateScan["declared"]` — kept unexported so it isn't a nameless orphan export. */
type DeclaredScan = {
  readonly unit: string;
  readonly candidates: number;
  readonly scanned: number;
  readonly skipReasons: Readonly<Record<string, number>>;
};

/** PER-GATE SCAN HEALTH — the DENOMINATOR behind a gate's verdict, recorded by the harness for every
 *  gate from the one walk (no gate opts in). Without it a `scanRoot`/predicate regression is invisible:
 *  the gate runs, reads NOTHING, finds nothing, and renders ✓ — the zero-scan placebo. `scanned === 0`
 *  at real-tree scope is therefore a BROKEN CHECKER (report.ts exits 2), not a clean gate. */
export type GateScan = {
  /** Files this run offered to the walk (the whole scoped fileset) — the denominator. */
  readonly candidates: number;
  /** Files this gate's `scanRoot` ADMITTED. This is the number the zero-scan alarm reads. */
  readonly scanned: number;
  /** `candidates - scanned`. */
  readonly skipped: number;
  /** Why they were skipped. The harness knows exactly one reason; gates add their own via `ctx.scan`. */
  readonly skipReasons: Readonly<Record<string, number>>;
  /** Files a hook ACTUALLY ran on (`visitFile` called, or ≥1 subscribed node dispatched). Read it BESIDE
   *  `scanned`, never instead: a `run`-only gate walks the project itself, so 0 here is normal for it,
   *  while `visited === 0` with `scanned` large on a visit/visitFile gate means a dead kind subscription. */
  readonly visited: number;
  /** Findings a committed ratchet BUDGET absolved this run — declared debt, not violations. */
  readonly admitted: number;
  /** Present only when the gate declared units of its own. */
  readonly declared?: DeclaredScan;
};

export type GatePassResult = {
  readonly name: string;
  readonly ok: boolean;
  readonly findings: readonly Finding[];
  readonly scan: GateScan;
};

export type ToolError = {
  readonly gate: string;
  readonly phase: "begin" | "visit" | "visitFile" | "run" | "finalize";
  readonly message: string;
};

export type PassResult = {
  readonly gates: readonly GatePassResult[];
  readonly toolErrors: readonly ToolError[];
};

/** repo-relative posix path for a SourceFile. */
export function repoRel(root: string, absPath: string): string {
  const withRoot = absPath.startsWith(root) ? absPath.slice(root.length) : absPath;
  return withRoot.startsWith("/") ? withRoot.slice(1) : withRoot;
}

/** Is a repo-relative path actually loaded in this run's project? A ratchet stale-arm must only judge a
 *  file that is present — a synthetic conformance tree omits real allowlisted files, so an unloaded
 *  entry must not falsely flag stale. */
export function fileLoaded(ctx: Pick<GateRunCtx, "root" | "project">, repoRelPath: string): boolean {
  return ctx.project.getSourceFile(`${ctx.root}/${repoRelPath}`) !== undefined;
}

/** Line+column from the node, never a regex newline-guess. `getStart()` skips leading trivia so the
 *  caret lands on the token. */
function locate(node: Node): { readonly line: number; readonly column: number } {
  return node.getSourceFile().getLineAndColumnAtPos(node.getStart());
}

/** Locate a TOKEN inside a node: `offset` is its 0-based index into `node.getText()`, so the caret
 *  lands on the offending lexeme, not the enclosing string. */
function locateToken(node: Node, offset: number): { readonly line: number; readonly column: number } {
  return node.getSourceFile().getLineAndColumnAtPos(node.getStart() + offset);
}

function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/** Canonical order: sort by (file, line, column, token, message) so output is deterministic. */
export function canonicalSort(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    if (a.file !== b.file) {
      return compareStrings(a.file, b.file);
    }
    if (a.line !== b.line) {
      return a.line - b.line;
    }
    if (a.column !== b.column) {
      return a.column - b.column;
    }
    if (a.token !== b.token) {
      return compareStrings(a.token ?? "", b.token ?? "");
    }
    return compareStrings(a.message ?? "", b.message ?? "");
  });
}

/** The mutable scan tally one gate accumulates during a pass — the harness-observed half (`scanned`,
 *  `visited`) plus whatever the gate declared through `ctx.scan`. Folded into the immutable `GateScan`
 *  at the end of `runPass`. */
type ScanState = {
  scanned: number;
  visited: number;
  /** The last file a hook ran on, so `visited` counts FILES and not dispatched nodes (the walk hands one
   *  gate thousands of nodes from the same file). */
  lastVisited: string;
  admitted: number;
  unit: string | undefined;
  declaredCandidates: number;
  declaredScanned: number;
  declaredSkip: Record<string, number>;
};

/** Per-gate run state: the descriptor, its private finding sink, its scan tally, and the context whose
 *  `report`/`scan` drain into them. Carried together so no phase has to re-look-up either (avoids
 *  non-null assertions). */
type GateRun = {
  readonly gate: GateDescriptor;
  readonly sink: Finding[];
  readonly scan: ScanState;
  readonly ctx: GateRunCtx;
};

/** Fold one `ctx.scan(...)` declaration into the gate's tally. Numerics ACCUMULATE (a gate may declare
 *  per batch); `unit` is last-wins. Nothing here can lower a harness-observed count. */
function acceptDeclaration(state: ScanState, counts: GateScanDeclaration): void {
  state.admitted += counts.admitted ?? 0;
  state.declaredScanned += counts.scanned ?? 0;
  state.declaredCandidates += counts.candidates ?? counts.scanned ?? 0;
  if (counts.unit !== undefined) {
    state.unit = counts.unit;
  }
  for (const [reason, n] of Object.entries(counts.skipped ?? {})) {
    state.declaredSkip[reason] = (state.declaredSkip[reason] ?? 0) + n;
  }
}

const DEFAULT_DECLARED_UNIT = "unit";

/** The gate's finished scan record: the harness's own file counts, plus a `declared` block only when the
 *  gate actually declared units of its own. */
function finishScan(state: ScanState, candidates: number): GateScan {
  const skipped = candidates - state.scanned;
  const declaresUnits = state.declaredScanned > 0 || state.declaredCandidates > 0 || state.unit !== undefined;
  const declared: DeclaredScan = {
    unit: state.unit ?? DEFAULT_DECLARED_UNIT,
    candidates: Math.max(state.declaredCandidates, state.declaredScanned),
    scanned: state.declaredScanned,
    skipReasons: state.declaredSkip,
  };
  return {
    candidates,
    scanned: state.scanned,
    skipped,
    skipReasons: skipped > 0 ? { "out-of-scanRoot": skipped } : {},
    visited: state.visited,
    admitted: state.admitted,
    // exactOptionalPropertyTypes: the key exists only when the gate declared something.
    ...(declaresUnits ? { declared } : {}),
  };
}

/** Is this a ts-morph Node (vs an explicit Finding literal)? Nodes expose `getSourceFile`; a Finding
 *  is a plain object without it. */
function isNode(v: Node | Finding): v is Node {
  return typeof (v as Node).getSourceFile === "function";
}

/** The house exemption-marker grammar (GATE-AUTHORING.md §4.3):
 *  `// @orb-gate-ignore <gate-name>[(<position>)]: <reason>`.
 *
 *  The pattern is deliberately PERMISSIVE about the tail so a malformed marker is still RECOGNISED as an
 *  attempted marker — `parseGateIgnoreMarker` then judges it. A marker that only the suppressor knew
 *  about would be invisible to `gate-ignore-inventory`, which is the gate that reds bare/stale ones.
 *
 *  THE MENTION FENCE (docs/design/gate-ignore-mention-fence.md): a marker IS a `//` comment whose own
 *  text begins with the vocabulary. Marker-shaped text anywhere else — inside a string/template/JSX/regex
 *  literal, or embedded LATER in a comment's text (a backtick quotation in prose, a JSDoc example) — is a
 *  MENTION of the grammar, never a use of it. Both readers enforce the same fence: the suppressor anchors
 *  the parse at the comment's start (a quotation above a reported node must never absolve it — that was a
 *  live bypass), and the inventory's scanner counts only comment-OPENER matches (so gate doc-prose can
 *  document the grammar without self-flagging, which is what let scanRoot include the gate corpus).
 *  Groups: 1 = gate name · 2 = the optional position name · 3 = everything after it. */
const GATE_IGNORE_SOURCE = String.raw`//\s*@orb-gate-ignore\s+([a-zA-Z0-9-]+)(?:\(\s*([^)\n]*?)\s*\))?(.*)`;

/** One parsed `@orb-gate-ignore` marker. `malformed` is the §4.3 verdict: a marker missing its
 *  `: <reason>` (or carrying an empty `()` position) suppresses NOTHING — a bare-marker-exempts rule is a
 *  rubber stamp — and is itself reported by `gate-ignore-inventory` so it cannot sit there LOOKING like
 *  protection. */
export type GateIgnoreMarker = {
  readonly gate: string;
  /** §4.3a: the guarded POSITION (a finding's `token`), when the marker names one. `undefined` = the
   *  marker covers every finding of its gate on the guarded node. */
  readonly position: string | undefined;
  readonly reason: string;
  readonly malformed: boolean;
};

/** Judge one recognised marker against the §4.3 grammar. */
function judgeGateIgnore(gate: string, rawPosition: string | undefined, tail: string): GateIgnoreMarker {
  const afterName = tail.trimStart();
  const reason = afterName.startsWith(":") ? afterName.slice(1).trim() : "";
  const positionEmpty = rawPosition?.length === 0;
  return { gate, position: positionEmpty ? undefined : rawPosition, reason, malformed: reason.length === 0 || positionEmpty };
}

/** Parse ONE comment's text. `undefined` = the comment is not a gate-ignore marker at all. ANCHORED at
 *  the comment's start (the mention fence): the comment must BE the marker — a marker-shaped quotation
 *  embedded later in a prose comment's text must never parse, or a doc-comment sitting above a reported
 *  node would silently absolve it (a live bypass until 2026-08-08: a planted backtick quotation naming a
 *  live position suppressed a real `no-color-literals` finding). */
export function parseGateIgnoreMarker(commentText: string): GateIgnoreMarker | undefined {
  // Biome's type lens believes `exec` is non-nullable; tsc types it `RegExpExecArray | null` and REDS the
  // destructure without this guard. tsc wins — and a non-matching comment is the COMMON case here, so the
  // null arm is the hot path, not a theoretical one.
  // biome-ignore lint/suspicious/noUnnecessaryConditions: exec IS nullable per tsc — see above
  const m = new RegExp(`^${GATE_IGNORE_SOURCE}`, "u").exec(commentText) ?? [];
  const [, gate, position, tail] = m;
  return gate === undefined ? undefined : judgeGateIgnore(gate, position, tail ?? "");
}

/** Node kinds whose spans can legally CONTAIN a marker spelling without it being a marker (gate
 *  fixtures, doc strings, regex sources). A match inside one of these spans is prose about the
 *  vocabulary, not a use of it. */
const MENTION_SPAN_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateExpression,
  SyntaxKind.JsxText,
  SyntaxKind.RegularExpressionLiteral,
]);

function literalSpans(sf: SourceFile): readonly (readonly [number, number])[] {
  const spans: [number, number][] = [];
  sf.forEachDescendant((node) => {
    if (MENTION_SPAN_KINDS.has(node.getKind())) {
      spans.push([node.getStart(), node.getEnd()]);
    }
  });
  return spans;
}

type CommentScanMode = "code" | "line" | "block";

/** One comment-scanner step at `i` (already outside literal spans): the next mode, the index AFTER the
 *  step, and the opener position when a `//` line comment opens here. */
function stepCommentScan(text: string, i: number, mode: CommentScanMode): { readonly mode: CommentScanMode; readonly next: number; readonly opener?: number } {
  const c = text[i];
  if (mode === "line") {
    return { mode: c === "\n" ? "code" : "line", next: i + 1 };
  }
  if (mode === "block") {
    return c === "*" && text[i + 1] === "/" ? { mode: "code", next: i + 2 } : { mode: "block", next: i + 1 };
  }
  if (c === "/" && text[i + 1] === "/") {
    return { mode: "line", next: i + 2, opener: i };
  }
  return c === "/" && text[i + 1] === "*" ? { mode: "block", next: i + 2 } : { mode: "code", next: i + 1 };
}

/** Positions where a `//` LINE COMMENT opens, outside the literal spans. Outside literals, a bare `//`
 *  in TS is always a comment opener (division needs an operand after the slash), so tracking
 *  line-comment state (to the newline) and block-comment state (to the closing star-slash) is exact:
 *  a `//` INSIDE an earlier comment (a quotation) or a block comment is not an opener. */
function lineCommentOpeners(text: string, spans: readonly (readonly [number, number])[]): ReadonlySet<number> {
  const openers = new Set<number>();
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let spanIdx = 0;
  let mode: CommentScanMode = "code";
  let i = 0;
  while (i < text.length) {
    while (spanIdx < sorted.length && (sorted[spanIdx]?.[1] ?? 0) <= i) {
      spanIdx += 1;
    }
    const span = sorted[spanIdx];
    if (mode === "code" && span !== undefined && i >= span[0]) {
      i = span[1]; // resume after the literal
      spanIdx += 1;
      continue;
    }
    const step = stepCommentScan(text, i, mode);
    if (step.opener !== undefined) {
      openers.add(step.opener);
    }
    mode = step.mode;
    i = step.next;
  }
  return openers;
}

/** Every REAL marker in a source file, with its 0-based text offset — the inventory gate's scanner. Kept
 *  HERE beside the suppressor so the grammar AND its mention fence have exactly ONE spelling: a gate that
 *  re-spelled either would drift out of agreement with the thing it is auditing. Returns only matches at
 *  comment-OPENER positions outside literal spans — the same "a marker IS the comment" law the anchored
 *  `parseGateIgnoreMarker` applies on the suppression side, so everything this reports as a marker is
 *  exactly what the suppressor could honour (plus inert ATTEMPTS — e.g. a trailing marker after code,
 *  which opens a real comment but sits in no node's leading trivia, stays visible here so the STALE arm
 *  can red it rather than let it sit there looking like protection). */
export function findGateIgnoreMarkers(sf: SourceFile): readonly { readonly index: number; readonly marker: GateIgnoreMarker }[] {
  const text = sf.getFullText();
  const openers = lineCommentOpeners(text, literalSpans(sf));
  const out: { index: number; marker: GateIgnoreMarker }[] = [];
  for (const m of text.matchAll(new RegExp(GATE_IGNORE_SOURCE, "gu"))) {
    if (openers.has(m.index)) {
      out.push({ index: m.index, marker: judgeGateIgnore(m[1] ?? "", m[2], m[3] ?? "") });
    }
  }
  return out;
}

/** How many findings each marker actually SUPPRESSED in this run, keyed `<repo-rel file>:<1-based line>`.
 *  §4.4's two-sidedness needs the ZERO case: a marker nobody consumed guards no live violation and is a
 *  loaded gun, so `gate-ignore-inventory` reds it. §4.3a needs the >1 case: an UNPOSITIONED marker that
 *  absolved two guarded things is the over-exemption the `(<position>)` grammar exists to prevent, so the
 *  count — not a boolean — is what the inventory gate must read. Module state, reset per `runPass`
 *  (conformance runs many passes). */
const gateIgnoreUses = new Map<string, number>();
/** Did a node-anchored suppression happen during the `finalize` phase? The inventory gate's stale sweep
 *  runs in `finalize`, so a gate that first reports there would be judged before it ever spoke. No gate
 *  does today (finalize arms use the Finding overload, which bypasses suppression entirely) — this is the
 *  tripwire for the day one does. */
let gateIgnoreLateUse = false;
let currentPhase: ToolError["phase"] = "begin";

/** How many findings the marker at `<file>:<line>` suppressed this run. `0` = stale (§4.4); `>1` from an
 *  UNPOSITIONED marker = over-exemption (§4.3a). */
export function gateIgnoreUseCount(file: string, line: number): number {
  return gateIgnoreUses.get(`${file}:${line}`) ?? 0;
}

/** True when a suppression landed after the stale sweep's phase — the sweep's soundness premise broke. */
export function gateIgnoreSuppressedInFinalize(): boolean {
  return gateIgnoreLateUse;
}

/** One node's LEADING comments: the position of the first WELL-FORMED marker that guards `gateName` at
 *  `token`, or undefined. Extracted from the walk so the traversal stays under the complexity cap — a
 *  malformed marker is skipped here (it suppresses nothing, §4.3) and reported by `gate-ignore-inventory`. */
// biome-ignore lint/suspicious/noExplicitAny: AST traversal
function suppressingCommentPos(scanNode: any, gateName: string, token: string | undefined): number | undefined {
  // ONE return path: tsc's noImplicitReturns wants every path to return, biome calls a trailing
  // `return;` unnecessary — an accumulator satisfies both without suppressing either.
  let found: number | undefined;
  if (typeof scanNode.getLeadingCommentRanges === "function") {
    // biome-ignore lint/suspicious/noExplicitAny: AST traversal
    for (const c of scanNode.getLeadingCommentRanges() as any[]) {
      const marker = parseGateIgnoreMarker(c.getText());
      const guardsThis = marker !== undefined && !marker.malformed && marker.gate === gateName;
      if (guardsThis && (marker.position === undefined || marker.position === token)) {
        found = c.getPos();
        break;
      }
    }
  }
  return found;
}

/** Walk from the reported node up to its statement/file boundary, looking for a well-formed
 *  `// @orb-gate-ignore <gate-name>[(<token>)]: <reason>` suppression comment. Stops at the statement
 *  boundary so a comment above an unrelated sibling doesn't leak a suppression onto this node (§4.3b —
 *  the resolver is BLOCK-SCOPED, never file-scoped). Returns the marker's 1-based line so the caller can
 *  record the consumption; `undefined` = not suppressed. */
function findGateIgnore(node: Node, gateName: string, token: string | undefined): number | undefined {
  // Single return path — see suppressingCommentPos.
  let line: number | undefined;
  // biome-ignore lint/suspicious/noExplicitAny: AST traversal
  let scanNode: any = node;
  while (scanNode !== undefined && line === undefined) {
    const hit = suppressingCommentPos(scanNode, gateName, token);
    if (hit !== undefined) {
      line = node.getSourceFile().getLineAndColumnAtPos(hit).line;
      break;
    }
    const kindName = typeof scanNode.getKindName === "function" ? scanNode.getKindName() : "";
    if (kindName === "SourceFile" || kindName.includes("Statement")) {
      break;
    }
    scanNode = typeof scanNode.getParent === "function" ? scanNode.getParent() : undefined;
  }
  return line;
}

function makeGateRun(gate: GateDescriptor, ctxBase: Omit<GateRunCtx, "report" | "scan">): GateRun {
  const sink: Finding[] = [];
  const scan: ScanState = {
    scanned: 0,
    visited: 0,
    lastVisited: "",
    admitted: 0,
    unit: undefined,
    declaredCandidates: 0,
    declaredScanned: 0,
    declaredSkip: {},
  };
  const report = (nodeOrFinding: Node | Finding, atToken?: { readonly token: string; readonly offset: number }): void => {
    if (!isNode(nodeOrFinding)) {
      sink.push(nodeOrFinding);
      return;
    }
    const node = nodeOrFinding;
    const file = repoRel(ctxBase.root, node.getSourceFile().getFilePath());
    const suppressedAt = findGateIgnore(node, gate.name, atToken?.token);
    if (suppressedAt !== undefined) {
      const key = `${file}:${suppressedAt}`;
      gateIgnoreUses.set(key, (gateIgnoreUses.get(key) ?? 0) + 1);
      gateIgnoreLateUse ||= currentPhase === "finalize";
      return;
    }

    if (atToken === undefined) {
      const { line, column } = locate(node);
      sink.push({ file, line, column });
      return;
    }
    const { line, column } = locateToken(node, atToken.offset);
    sink.push({ file, line, column, token: atToken.token });
  };
  const declare = (counts: GateScanDeclaration): void => {
    acceptDeclaration(scan, counts);
  };
  return { gate, sink, scan, ctx: { ...ctxBase, report: report as GateRunCtx["report"], scan: declare } };
}

function guard(gate: string, phase: ToolError["phase"], errors: ToolError[], fn: () => void): void {
  currentPhase = phase;
  try {
    fn();
  } catch (err) {
    errors.push({ gate, phase, message: err instanceof Error ? err.message : String(err) });
  }
}

function inRoot(gate: GateDescriptor, rel: string): boolean {
  return gate.scanRoot === undefined || gate.scanRoot(rel);
}

/** Build the kind-indexed dispatch: SyntaxKind → the gate-runs subscribed to it. */
function indexByKind(runs: readonly GateRun[]): Map<SyntaxKind, GateRun[]> {
  const byKind = new Map<SyntaxKind, GateRun[]>();
  for (const run of runs) {
    if (run.gate.visit === undefined || run.gate.kinds === undefined) {
      continue;
    }
    for (const k of run.gate.kinds) {
      const list = byKind.get(k);
      if (list === undefined) {
        byKind.set(k, [run]);
      } else {
        list.push(run);
      }
    }
  }
  return byKind;
}

/** Record that a hook actually ran on this file. Files are processed one at a time, so a gate's
 *  dispatches for one file are contiguous — comparing against the last one counts FILES, not nodes. */
function markVisited(run: GateRun, sf: SourceFile): void {
  const path = sf.getFilePath();
  if (run.scan.lastVisited !== path) {
    run.scan.lastVisited = path;
    run.scan.visited += 1;
  }
}

/** One file's node walk — dispatch each descendant to the in-scanRoot subscribers of its kind. The
 *  in-scope membership is resolved ONCE per file by the caller (it is also the scan-health tally), so the
 *  hot loop does a Set hit instead of re-running every gate's scanRoot predicate per node. */
function walkFile(sf: SourceFile, byKind: ReadonlyMap<SyntaxKind, readonly GateRun[]>, errors: ToolError[], inScope: ReadonlySet<GateRun>): void {
  sf.forEachDescendant((node) => {
    const subs = byKind.get(node.getKind());
    if (subs === undefined) {
      return;
    }
    for (const run of subs) {
      if (inScope.has(run)) {
        markVisited(run, sf);
        guard(run.gate.name, "visit", errors, () => runVisit(run, node, sf));
      }
    }
  });
}

/** The per-FILE phase: for each file resolve which gates its path is in scanRoot for (ONE predicate
 *  evaluation per gate/file — the scan tally and the dispatch membership are the same question), then run
 *  the `visitFile` hooks and the node walk for exactly those gates. */
function runFilePhase(runs: readonly GateRun[], ctxBase: Omit<GateRunCtx, "report" | "scan">, errors: ToolError[]): void {
  const byKind = indexByKind(runs);
  const fileRuns = runs.filter((run) => run.gate.visitFile !== undefined);
  for (const sf of ctxBase.files) {
    const rel = repoRel(ctxBase.root, sf.getFilePath());
    const inScope = new Set<GateRun>();
    for (const run of runs) {
      if (inRoot(run.gate, rel)) {
        inScope.add(run);
        run.scan.scanned += 1;
      }
    }
    for (const run of fileRuns) {
      if (inScope.has(run)) {
        markVisited(run, sf);
        guard(run.gate.name, "visitFile", errors, () => run.gate.visitFile?.(sf, run.ctx));
      }
    }
    if (byKind.size > 0) {
      walkFile(sf, byKind, errors, inScope);
    }
  }
}

function runVisit(run: GateRun, node: Node, sf: SourceFile): void {
  run.gate.visit?.(node, sf, run.ctx);
}

/** The pass over a given descriptor set and fileset. Each node is touched once; only subscribed gates
 *  see it. Whole-project `run` gates get their declared pass over the SAME project. */
export function runPass(gates: readonly GateDescriptor[], ctxBase: Omit<GateRunCtx, "report" | "scan">): PassResult {
  gateIgnoreUses.clear();
  gateIgnoreLateUse = false;
  const runs: readonly GateRun[] = gates.filter((g) => g.status === "active").map((g) => makeGateRun(g, ctxBase));
  const errors: ToolError[] = [];

  for (const run of runs) {
    guard(run.gate.name, "begin", errors, () => run.gate.begin?.(run.ctx));
  }

  runFilePhase(runs, ctxBase, errors);

  for (const run of runs) {
    if (run.gate.run !== undefined) {
      guard(run.gate.name, "run", errors, () => run.gate.run?.(run.ctx));
    }
  }
  for (const run of runs) {
    guard(run.gate.name, "finalize", errors, () => run.gate.finalize?.(run.ctx));
  }

  const results: GatePassResult[] = runs.map((run) => {
    const findings = canonicalSort(run.sink);
    return { name: run.gate.name, ok: findings.length === 0, findings, scan: finishScan(run.scan, ctxBase.files.length) };
  });
  return { gates: results, toolErrors: errors };
}

/** Gate-conformance PROBE artifacts (`__g_*` / `__dc_*`): transient fixtures the conformance tests
 *  write while proving gates bite. A REAL-TREE run racing a concurrent battery (or finding a
 *  crash-orphaned probe) must not red on them — they are the self-test's props, not code. Applied ONLY
 *  at the real-tree entrypoints (report.ts / scoped.ts), NEVER inside runPass: conformance's own
 *  fixture runs assert findings ON probe-named files, and a runPass-level filter would blind them. */
export const PROBE_ARTIFACT_RE = /(^|\/)__(?:g|dc)_/u;

/** Drop probe-artifact findings from a real-tree pass (see PROBE_ARTIFACT_RE). */
export function stripProbeFindings(pass: PassResult): PassResult {
  const gates = pass.gates.map((g) => {
    const findings = g.findings.filter((f) => !PROBE_ARTIFACT_RE.test(f.file));
    return findings.length === g.findings.length ? g : { name: g.name, ok: findings.length === 0, findings, scan: g.scan };
  });
  return { gates, toolErrors: pass.toolErrors };
}

/** THE ZERO-SCAN PLACEBO (Codex GA-H-01): a gate that ran, read NOTHING, and rendered ✓. Its verdict is
 *  vacuous, and every failure mode that produces it — a `scanRoot` predicate that stopped matching after a
 *  rename, an absolute path compared against a repo-relative one (GATE-AUTHORING.md §3), a fileset the run
 *  never loaded — is SILENT by construction. A gate reading non-file units escapes by declaring them
 *  (`ctx.scan({unit,scanned})`); nothing else does.
 *
 *  Judged ONLY at the real-tree entrypoint (report.ts), never inside runPass: a SCOPED run legitimately
 *  offers a gate zero in-scope files, and conformance's synthetic mini-projects are `scope.kind:"project"`
 *  too (§4.5) — so the scope field cannot tell them apart and the entrypoint has to. */
export function zeroScanGates(pass: PassResult): readonly string[] {
  return pass.gates.filter((g) => isBlindScan(g.scan)).map((g) => g.name);
}

/** Did this gate read NOTHING — no in-scanRoot file and no unit of its own? ONE spelling, shared by the
 *  alarm (`zeroScanGates`) and the renderer, so the loud line and the refused exit can never disagree. */
export function isBlindScan(scan: GateScan): boolean {
  const declared = scan.declared === undefined ? 0 : scan.declared.scanned;
  return scan.scanned === 0 && declared === 0;
}

/** Build a full-project run context over the shared workspace (the default `pnpm check:structure` run). */
export function projectCtx(root: string): Omit<GateRunCtx, "report" | "scan"> {
  const project = getWorkspace({ root });
  const scope: Scope = { kind: "project" };
  let checker: ReturnType<GateRunCtx["checker"]> | undefined;
  return {
    root,
    project,
    scope,
    files: project.getSourceFiles(),
    checker: (): ReturnType<GateRunCtx["checker"]> => {
      checker ??= project.getTypeChecker();
      return checker;
    },
  };
}
