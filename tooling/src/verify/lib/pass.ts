// The single-pass dispatcher: ONE forEachDescendant walk over the scoped fileset, dispatching each node
// only to the gates subscribed to its kind, then the whole-project `run` passes + `finalize` arms.
//
// Every visit/run/finalize call is wrapped per-gate: a throw becomes a ToolError attributed to the
// gate+phase and does NOT abort the sibling gates. Findings are canonical-sorted here so output is
// deterministic.
//
// It also tallies PER-GATE SCAN HEALTH (`GateScan`) from that same walk — the denominator behind every
// verdict, so a gate that read nothing can no longer render ✓ (`zeroScanGates`) — and folds the optional
// SEMANTIC-MEMBER populations a coverage gate declares (#946: files visited is not the denominator a
// coverage gate's verdict rests on; the alarms that read them live in ./population.ts). The result shapes live in
// ../contract/pass.ts and the marker grammar in ./gate-ignore.ts (five-slot split, P6). BOTH report
// overloads are suppressible since #828 — the node arm block-scoped, the Finding arm line-adjacent — except
// for a `markerImmune` gate, which audits the vocabulary and must never be silenced by it.
import { getWorkspace } from "@orb/tooling/_shared/ts-workspace";
import type { Node, SourceFile, SyntaxKind } from "ts-morph";
import type { Finding, GateDescriptor, GateRunCtx, GateScanDeclaration, Scope } from "../contract/gate.ts";
import type { DeclaredScan, GatePassResult, GatePhase, GateScan, PassResult, PopulationScan, ToolError } from "../contract/pass.ts";
import type { PolicyPassResult } from "../contract/policy-pass.ts";
import { findGateIgnore, findGateIgnoreAtLine } from "./gate-ignore.ts";
import type { PhaseClock } from "./pass-timing.ts";
import { chargedPhase, inFinalizePhase, newPhaseClock, nowMs, passTiming } from "./pass-timing.ts";
import { beginReferencePass, endReferencePass } from "./reference-fact.ts";

/** repo-relative posix path for a SourceFile. */
export function repoRel(root: string, absPath: string): string {
  const withRoot = absPath.startsWith(root) ? absPath.slice(root.length) : absPath;
  return withRoot.startsWith("/") ? withRoot.slice(1) : withRoot;
}

/** The fileset index behind `fileLoaded`, keyed on the ctx's `files` ARRAY IDENTITY (stable for a run —
 *  `projectCtx` builds it once). A stale-arm sweep asks this once per exemption row, so the per-run O(n)
 *  build beats a linear scan per row. */
const filesetIndex = new WeakMap<readonly SourceFile[], ReadonlySet<string>>();

function filesetOf(ctx: Pick<GateRunCtx, "root" | "files">): ReadonlySet<string> {
  const cached = filesetIndex.get(ctx.files);
  if (cached !== undefined) {
    return cached;
  }
  const set = new Set(ctx.files.map((sf) => repoRel(ctx.root, sf.getFilePath())));
  filesetIndex.set(ctx.files, set);
  return set;
}

/** Is a repo-relative path in THIS RUN'S FILESET? The real-tree ANCHOR door every stale/ratchet arm
 *  guards on (GATE-AUTHORING.md §4.5): a row must only be judged stale on a run that actually LOOKED at
 *  the rows' files — a synthetic conformance tree omits the real allowlisted files, so an unloaded anchor
 *  must not license a stale claim.
 *
 *  IT READS `ctx.files`, NOT `ctx.project`, AND THAT IS THE WHOLE POINT (#505). A SCOPED run
 *  (`cli.ts scoped`) builds the FULL workspace Project and then narrows only the fileset — so a
 *  project-membership test answers TRUE for an anchor the run never visited, every anchor-guarded stale
 *  sweep fires, and every path-keyed exemption row in the tree reads "stale" while being demonstrably
 *  live. Measured 2026-08-22 on `--scope packages/ui/src/primitives/button` (3 files): six false stale
 *  findings across no-manual-memo (3), no-floorless-control-in-wrap (2) and tooling-front-door (1) — the
 *  last of them from a gate whose own line said `scanned 0/3 files`. Issue #505 was filed to DELETE those
 *  six rows; all six cover live violations on the same tree.
 *
 *  At project scope and in conformance `files === project.getSourceFiles()`, so this is a no-op there. */
export function fileLoaded(ctx: Pick<GateRunCtx, "root" | "files">, repoRelPath: string): boolean {
  return filesetOf(ctx).has(repoRelPath);
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
interface ScanState {
  scanned: number;
  visited: number;
  /** The last file a hook ran on, so `visited` counts FILES and not dispatched nodes (the walk hands one
   *  gate thousands of nodes from the same file). */
  lastVisited: string;
  admitted: number;
  admittedRatified: number;
  /** Declared semantic populations, folded by source name (#946). */
  readonly populations: Map<string, { members: number; unresolved: number }>;
  unit: string | undefined;
  declaredCandidates: number;
  declaredScanned: number;
  declaredSkip: Record<string, number>;
}

/** Per-gate run state: the descriptor, its finding sink, its scan tally, its cost clock (charged through
 *  `guard` — #1107), and the context whose `report`/`scan` drain into them. Carried together so no phase
 *  has to re-look-up either (avoids non-null assertions). */
interface GateRun {
  readonly gate: GateDescriptor;
  readonly sink: Finding[];
  readonly scan: ScanState;
  readonly clock: PhaseClock;
  readonly ctx: GateRunCtx;
}

/** Fold one `ctx.scan(...)` declaration into the gate's tally. Numerics ACCUMULATE (a gate may declare
 *  per batch); `unit` is last-wins. Nothing here can lower a harness-observed count. */
function acceptDeclaration(state: ScanState, counts: GateScanDeclaration): void {
  state.admitted += counts.admitted ?? 0;
  state.admittedRatified += counts.admittedRatified ?? 0;
  state.declaredScanned += counts.scanned ?? 0;
  state.declaredCandidates += counts.candidates ?? counts.scanned ?? 0;
  for (const p of counts.population ?? []) {
    const prior = state.populations.get(p.source) ?? { members: 0, unresolved: 0 };
    state.populations.set(p.source, { members: prior.members + p.members, unresolved: prior.unresolved + (p.unresolved ?? 0) });
  }
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
  const populations: readonly PopulationScan[] = [...state.populations]
    .map(([source, p]) => ({ source, members: p.members, unresolved: p.unresolved }))
    .sort((a, b) => compareStrings(a.source, b.source));
  return {
    candidates,
    scanned: state.scanned,
    skipped,
    skipReasons: skipped > 0 ? { "out-of-scanRoot": skipped } : {},
    visited: state.visited,
    admitted: state.admitted,
    admittedRatified: state.admittedRatified,
    populations,
    // exactOptionalPropertyTypes: the key exists only when the gate declared something.
    ...(declaresUnits ? { declared } : {}),
  };
}

/** Is this a ts-morph Node (vs an explicit Finding literal)? Nodes expose `getSourceFile`; a Finding
 *  is a plain object without it. */
function isNode(v: Node | Finding): v is Node {
  return typeof (v as Node).getSourceFile === "function";
}

/** How many findings each marker actually SUPPRESSED in this run, keyed `<repo-rel file>:<1-based line>`.
 *  §4.4's two-sidedness needs the ZERO case: a marker nobody consumed guards no live violation and is a
 *  loaded gun, so `gate-ignore-inventory` reds it. §4.3a needs the \>1 case: an UNPOSITIONED marker that
 *  absolved two guarded things is the over-exemption the `(<position>)` grammar exists to prevent, so the
 *  count — not a boolean — is what the inventory gate must read. Module state, reset per `runPass`
 *  (conformance runs many passes). */
const gateIgnoreUses = new Map<string, number>();
/** Did a suppression happen during the `finalize` phase? The inventory gate's stale sweep runs in
 *  `finalize`, so a marker consumed after the sweep read its count would be reported stale by mistake. It
 *  covers BOTH arms since #828 — the Finding overload is suppressible too now, and finalize is exactly
 *  where the stale/ratchet arms that use it live. No gate trips it today; this is the tripwire for the day
 *  one does. */
let gateIgnoreLateUse = false;

/** How many findings the marker at `<file>:<line>` suppressed this run. `0` = stale (§4.4); `>1` from an
 *  UNPOSITIONED marker = over-exemption (§4.3a). */
export function gateIgnoreUseCount(file: string, line: number): number {
  return gateIgnoreUses.get(`${file}:${line}`) ?? 0;
}

/** True when a suppression landed after the stale sweep's phase — the sweep's soundness premise broke. */
export function gateIgnoreSuppressedInFinalize(): boolean {
  return gateIgnoreLateUse;
}

function makeGateRun(gate: GateDescriptor, ctxBase: Omit<GateRunCtx, "report" | "scan">, passIdentity: object): GateRun {
  const sink: Finding[] = [];
  const scan: ScanState = {
    scanned: 0,
    visited: 0,
    lastVisited: "",
    admitted: 0,
    admittedRatified: 0,
    populations: new Map(),
    unit: undefined,
    declaredCandidates: 0,
    declaredScanned: 0,
    declaredSkip: {},
  };
  /** Record what a marker absolved: the COUNT (§4.4 stale = 0, §4.3a over-exempt = more than one) plus the
   *  suppressed-in-finalize soundness tripwire. Shared by both suppression arms. */
  const consume = (file: string, markerLine: number): void => {
    const key = `${file}:${markerLine}`;
    gateIgnoreUses.set(key, (gateIgnoreUses.get(key) ?? 0) + 1);
    gateIgnoreLateUse ||= inFinalizePhase();
  };
  /** The FINDING overload's suppression (#828): no node, so the marker binds to the line IMMEDIATELY above
   *  `finding.line`. A `markerImmune` gate AUDITS the vocabulary and is never reachable by it. */
  const findingSuppressedAt = (finding: Finding): number | undefined => {
    if (gate.markerImmune === true) {
      return;
    }
    const sf = ctxBase.project.getSourceFile(`${ctxBase.root}/${finding.file}`);
    return sf === undefined ? undefined : findGateIgnoreAtLine(sf, finding.line, gate.name, finding.token);
  };
  const report = (nodeOrFinding: Node | Finding, atToken?: { readonly token: string; readonly offset: number }): void => {
    if (!isNode(nodeOrFinding)) {
      const finding = nodeOrFinding;
      const at = findingSuppressedAt(finding);
      if (at === undefined) {
        sink.push(finding);
      } else {
        consume(finding.file, at);
      }
      return;
    }
    const node = nodeOrFinding;
    const file = repoRel(ctxBase.root, node.getSourceFile().getFilePath());
    const suppressedAt = gate.markerImmune === true ? undefined : findGateIgnore(node, gate.name, atToken?.token);
    if (suppressedAt !== undefined) {
      consume(file, suppressedAt);
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
  return { gate, sink, scan, clock: newPhaseClock(), ctx: { ...ctxBase, passIdentity, report: report as GateRunCtx["report"], scan: declare } };
}

/** Every hook call takes this door, so throw-isolation and cost attribution can never disagree (#1107). */
function guard(run: GateRun, phase: GatePhase, errors: ToolError[], fn: () => void): void {
  chargedPhase(run.clock, phase, () => {
    // @orb-waive caught-failure-ownership(err): pushed into the errors array as a ToolError — the exit-contract's tool-error class, never a silent pass. Ends if the errors array stops being read into the run's exit code.
    try {
      fn();
    } catch (err) {
      errors.push({ gate: run.gate.name, phase, message: err instanceof Error ? err.message : String(err) });
    }
  });
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
        guard(run, "visit", errors, () => run.gate.visit?.(node, sf, run.ctx));
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
        guard(run, "visitFile", errors, () => run.gate.visitFile?.(sf, run.ctx));
      }
    }
    if (byKind.size > 0) {
      walkFile(sf, byKind, errors, inScope);
    }
  }
}

/** The pass over a given descriptor set and fileset. Each node is touched once; only subscribed gates
 *  see it. Whole-project `run` gates get their declared pass over the SAME project. */
export function runPass(gates: readonly GateDescriptor[], ctxBase: Omit<GateRunCtx, "report" | "scan">): PassResult {
  // Both dispatchers share the readers' invocation boundary. Without it every reference query repeats
  // its source-wide write analysis, even when the checker and parsed workspace are already warm.
  beginReferencePass();
  try {
    return runWithReferenceCache(gates, ctxBase);
  } finally {
    endReferencePass();
  }
}

/** A GATE'S `ok` IS A TWO-TERM VERDICT: nothing to report AND nothing broken (#2234, cb-v-wave-5).
 *
 *  It used to be `findings.length === 0` alone, so a gate whose `run` phase THREW came back
 *  `{ ok: true, findings: [] }` with the failure visible only in the SIBLING `result.toolErrors` array — and
 *  a consumer reading `ok`/`findings`, which is the obvious read, could not tell "nothing to report" from
 *  "could not report". Measured 2026-09-12 driving `css-length-tokens` over 1,685 real files:
 *  `{ name: "css-length-tokens", ok: true, n: 0 }` beside
 *  `toolErrors: [{ gate: "css-length-tokens", phase: "run", message: "Maximum call stack size exceeded" }]`.
 *  It silently converted two of that verifier's own runs into false cleans.
 *
 *  THE FRONT-DOOR HALF WAS CORRECTED 2026-09-13 (#2285), and the original claim is kept verbatim because a
 *  corrected ruling must stay legible as a correction: *"THE PRODUCTION FRONT DOOR IS UNCHANGED BY THIS,
 *  DELIBERATELY. `ops/structure.ts:83` recomputes its own per-gate row as `violations.length === 0` and reads
 *  brokenness from `pass.toolErrors` at `:344`, so the run verdict and the exit code are byte-identical before
 *  and after."* The ruling survives; its INPUT changed. That recomputation kept the exit code stable and
 *  published `ok: true` for a THROWING gate into `reports/check-structure.json` — so the false clean simply
 *  moved from the console into the artifact every reader is sent to instead of a re-run.
 *  `ops/structure.ts#toLegacyRows` now carries `g.ok` through, and the protected property holds
 *  UNCONDITIONALLY rather than incidentally; that function records the re-derivation, its method and its
 *  scanned count. What changed is what the ARTIFACT says, not any verdict or exit code.
 *
 *  What #2234 changed on its own day was every OTHER reader —
 *  `lib/render.ts:106` now prints `✗` rather than `✓` for a gate that could not run, and
 *  `lib/population.ts:33`'s unresolved alarm (deliberately raised only BEHIND a green verdict) stops firing
 *  for a gate whose verdict is no longer green, which is the same rule it already states.
 *
 *  It retires with Phase F: the final side has no equivalent hole (`gate-authority.ts` partitions a
 *  non-success owner before any verdict is computed). */
function gateOk(name: string, findingCount: number, errors: readonly ToolError[]): boolean {
  return findingCount === 0 && !errors.some((error) => error.gate === name);
}

function runWithReferenceCache(gates: readonly GateDescriptor[], ctxBase: Omit<GateRunCtx, "report" | "scan">): PassResult {
  gateIgnoreUses.clear();
  gateIgnoreLateUse = false;
  const passStartedAt = nowMs();
  const passIdentity = {};
  const runs: readonly GateRun[] = gates.filter((g) => g.status === "active").map((g) => makeGateRun(g, ctxBase, passIdentity));
  const errors: ToolError[] = [];

  for (const run of runs) {
    guard(run, "begin", errors, () => run.gate.begin?.(run.ctx));
  }

  runFilePhase(runs, ctxBase, errors);

  for (const run of runs) {
    if (run.gate.run !== undefined) {
      guard(run, "run", errors, () => run.gate.run?.(run.ctx));
    }
  }
  for (const run of runs) {
    guard(run, "finalize", errors, () => run.gate.finalize?.(run.ctx));
  }

  const results: GatePassResult[] = runs.map((run) => {
    const findings = canonicalSort(run.sink);
    return {
      name: run.gate.name,
      ok: gateOk(run.gate.name, findings.length, errors),
      findings,
      scan: finishScan(run.scan, ctxBase.files.length),
      timing: run.clock.finish(),
    };
  });
  return { gates: results, toolErrors: errors, timing: passTiming(passStartedAt, results) };
}

/** Gate-conformance PROBE artifacts (`__g_*` / `__dc_*`): transient fixtures the conformance tests
 *  write while proving gates bite. A REAL-TREE run racing a concurrent battery (or finding a
 *  crash-orphaned probe) must not red on them — they are the self-test's props, not code. Applied ONLY
 *  at the real-tree entrypoints (ops/structure.ts / ops/scoped.ts), NEVER inside runPass: conformance's
 *  own fixture runs assert findings ON probe-named files, and a runPass-level filter would blind them. */
const PROBE_ARTIFACT_RE = /(^|\/)__(?:g|dc)_/u;

/** The FINAL side of the same rule: drop probe-artifact EFFECTIVE findings from a real-tree `runPolicyPass` result
 *  and recompute the authority verdict over what remains, so `policyPassExitCode` keeps ONE spelling of the exit
 *  rule. Waived/granted findings and the alarms are untouched (they are not findings on the report), and a result
 *  with no probe finding is returned as-is. */
export function stripProbePolicyFindings(result: PolicyPassResult): PolicyPassResult {
  const effectiveFindings = result.authority.effectiveFindings.filter((finding) => !PROBE_ARTIFACT_RE.test(finding.file));
  if (effectiveFindings.length === result.authority.effectiveFindings.length) {
    return result;
  }
  const errors = effectiveFindings.filter(({ severity }) => severity === "error").length;
  const warnings = effectiveFindings.length - errors;
  const alarmErrors = result.authority.authorityAlarms.length;
  const { failOnWarnings } = result.authority.verdict;
  return {
    ...result,
    authority: {
      ...result.authority,
      effectiveFindings,
      verdict: { errors: errors + alarmErrors, warnings, blocking: errors + alarmErrors + (failOnWarnings ? warnings : 0), failOnWarnings },
    },
  };
}

/** Drop probe-artifact findings from a real-tree pass (see PROBE_ARTIFACT_RE). */
export function stripProbeFindings(pass: PassResult): PassResult {
  const gates = pass.gates.map((g) => {
    const findings = g.findings.filter((f) => !PROBE_ARTIFACT_RE.test(f.file));
    // ONE SPELLING of the two-term verdict (#2234): recomputing `findings.length === 0` here would have
    // laundered a BROKEN gate back to green the moment a probe finding was stripped from it.
    return findings.length === g.findings.length
      ? g
      : { name: g.name, ok: gateOk(g.name, findings.length, pass.toolErrors), findings, scan: g.scan, timing: g.timing };
  });
  return { gates, toolErrors: pass.toolErrors, timing: pass.timing };
}

/** THE ZERO-SCAN PLACEBO (Codex GA-H-01): a gate that ran, read NOTHING, and rendered ✓. Its verdict is
 *  vacuous, and every failure mode that produces it — a `scanRoot` predicate that stopped matching after a
 *  rename, an absolute path compared against a repo-relative one (GATE-AUTHORING.md §3), a fileset the run
 *  never loaded — is SILENT by construction. A gate reading non-file units escapes by declaring them
 *  (`ctx.scan({unit,scanned})`); nothing else does.
 *
 *  Judged ONLY at the real-tree entrypoint (ops/structure.ts), never inside runPass: a SCOPED run
 *  legitimately offers a gate zero in-scope files, and conformance's synthetic mini-projects are
 *  `scope.kind:"project"` too (§4.5) — so the scope field cannot tell them apart and the entrypoint has to. */
export function zeroScanGates(pass: PassResult): readonly string[] {
  return pass.gates.filter((g) => isBlindScan(g.scan)).map((g) => g.name);
}

/** Did this gate read NOTHING — no in-scanRoot file and no unit of its own? ONE spelling, shared by the
 *  alarm (`zeroScanGates`) and the renderer, so the loud line and the refused exit can never disagree. */
export function isBlindScan(scan: GateScan): boolean {
  const declared = scan.declared === undefined ? 0 : scan.declared.scanned;
  return scan.scanned === 0 && declared === 0;
}

/** Build a full-project run context over the shared workspace (the default structure run). */
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
