// The single-pass dispatcher: ONE forEachDescendant walk over the scoped fileset, dispatching each node
// only to the gates subscribed to its kind, then the whole-project `run` passes + `finalize` arms.
//
// Every visit/run/finalize call is wrapped per-gate: a throw becomes a ToolError attributed to the
// gate+phase and does NOT abort the sibling gates. Findings are canonical-sorted here so output is
// deterministic.
import type { Node, SourceFile, SyntaxKind } from "ts-morph";
import { getWorkspace } from "../ts-workspace.ts";
import type { Finding, GateDescriptor, GateRunCtx, Scope } from "./contract.ts";

export type GatePassResult = {
  readonly name: string;
  readonly ok: boolean;
  readonly findings: readonly Finding[];
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

/** Per-gate run state: the descriptor, its private finding sink, and the context whose `report` drains
 *  into that sink. Carried together so no phase has to re-look-up either (avoids non-null assertions). */
type GateRun = {
  readonly gate: GateDescriptor;
  readonly sink: Finding[];
  readonly ctx: GateRunCtx;
};

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
  const positionEmpty = rawPosition !== undefined && rawPosition.length === 0;
  return { gate, position: rawPosition === undefined || positionEmpty ? undefined : rawPosition, reason, malformed: reason.length === 0 || positionEmpty };
}

/** Parse ONE comment's text. `undefined` = the comment is not a gate-ignore marker at all. */
export function parseGateIgnoreMarker(commentText: string): GateIgnoreMarker | undefined {
  const m = new RegExp(GATE_IGNORE_SOURCE, "u").exec(commentText);
  return m === null ? undefined : judgeGateIgnore(m[1] ?? "", m[2], m[3] ?? "");
}

/** Every marker in a source text, with its 0-based text offset — the inventory gate's scanner. Kept HERE
 *  beside the suppressor so the grammar has exactly ONE spelling: a gate that re-spelled it would drift
 *  out of agreement with the thing it is auditing. */
export function findGateIgnoreMarkers(text: string): readonly { readonly index: number; readonly marker: GateIgnoreMarker }[] {
  const out: { index: number; marker: GateIgnoreMarker }[] = [];
  for (const m of text.matchAll(new RegExp(GATE_IGNORE_SOURCE, "gu"))) {
    out.push({ index: m.index, marker: judgeGateIgnore(m[1] ?? "", m[2], m[3] ?? "") });
  }
  return out;
}

/** Which markers actually SUPPRESSED something in this run, keyed `<repo-rel file>:<1-based line>`.
 *  §4.4's two-sidedness: a marker nobody consumed guards no live violation and is a loaded gun, so
 *  `gate-ignore-inventory` reds it. Module state, reset per `runPass` (conformance runs many passes). */
const gateIgnoreUses = new Set<string>();
/** Did a node-anchored suppression happen during the `finalize` phase? The inventory gate's stale sweep
 *  runs in `finalize`, so a gate that first reports there would be judged before it ever spoke. No gate
 *  does today (finalize arms use the Finding overload, which bypasses suppression entirely) — this is the
 *  tripwire for the day one does. */
let gateIgnoreLateUse = false;
let currentPhase: ToolError["phase"] = "begin";

export function gateIgnoreUsed(file: string, line: number): boolean {
  return gateIgnoreUses.has(`${file}:${line}`);
}

/** True when a suppression landed after the stale sweep's phase — the sweep's soundness premise broke. */
export function gateIgnoreSuppressedInFinalize(): boolean {
  return gateIgnoreLateUse;
}

/** Walk from the reported node up to its statement/file boundary, looking for a well-formed
 *  `// @orb-gate-ignore <gate-name>[(<token>)]: <reason>` suppression comment. Stops at the statement
 *  boundary so a comment above an unrelated sibling doesn't leak a suppression onto this node (§4.3b —
 *  the resolver is BLOCK-SCOPED, never file-scoped). Returns the marker's 1-based line so the caller can
 *  record the consumption; `undefined` = not suppressed. */
function findGateIgnore(node: Node, gateName: string, token: string | undefined): number | undefined {
  // biome-ignore lint/suspicious/noExplicitAny: AST traversal
  let scanNode: any = node;
  while (scanNode) {
    if (typeof scanNode.getLeadingCommentRanges === "function") {
      // biome-ignore lint/suspicious/noExplicitAny: AST traversal
      for (const c of scanNode.getLeadingCommentRanges() as any[]) {
        const marker = parseGateIgnoreMarker(c.getText());
        if (marker === undefined || marker.malformed || marker.gate !== gateName) {
          continue;
        }
        if (marker.position !== undefined && marker.position !== token) {
          continue;
        }
        return node.getSourceFile().getLineAndColumnAtPos(c.getPos()).line;
      }
    }
    const kindName = typeof scanNode.getKindName === "function" ? scanNode.getKindName() : "";
    if (kindName === "SourceFile" || kindName.includes("Statement")) {
      break;
    }
    scanNode = typeof scanNode.getParent === "function" ? scanNode.getParent() : undefined;
  }
  return undefined;
}

function makeGateRun(gate: GateDescriptor, ctxBase: Omit<GateRunCtx, "report">): GateRun {
  const sink: Finding[] = [];
  const report = (nodeOrFinding: Node | Finding, atToken?: { readonly token: string; readonly offset: number }): void => {
    if (!isNode(nodeOrFinding)) {
      sink.push(nodeOrFinding);
      return;
    }
    const node = nodeOrFinding;
    const file = repoRel(ctxBase.root, node.getSourceFile().getFilePath());
    const suppressedAt = findGateIgnore(node, gate.name, atToken?.token);
    if (suppressedAt !== undefined) {
      gateIgnoreUses.add(`${file}:${suppressedAt}`);
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
  return { gate, sink, ctx: { ...ctxBase, report: report as GateRunCtx["report"] } };
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

/** One file's node walk — dispatch each descendant to the in-scanRoot subscribers of its kind. */
function walkFile(sf: SourceFile, rel: string, byKind: ReadonlyMap<SyntaxKind, readonly GateRun[]>, errors: ToolError[]): void {
  sf.forEachDescendant((node) => {
    const subs = byKind.get(node.getKind());
    if (subs === undefined) {
      return;
    }
    for (const run of subs) {
      if (inRoot(run.gate, rel)) {
        guard(run.gate.name, "visit", errors, () => runVisit(run, node, sf));
      }
    }
  });
}

function runVisit(run: GateRun, node: Node, sf: SourceFile): void {
  run.gate.visit?.(node, sf, run.ctx);
}

/** The pass over a given descriptor set and fileset. Each node is touched once; only subscribed gates
 *  see it. Whole-project `run` gates get their declared pass over the SAME project. */
export function runPass(gates: readonly GateDescriptor[], ctxBase: Omit<GateRunCtx, "report">): PassResult {
  gateIgnoreUses.clear();
  gateIgnoreLateUse = false;
  const runs: readonly GateRun[] = gates.filter((g) => g.status === "active").map((g) => makeGateRun(g, ctxBase));
  const errors: ToolError[] = [];

  for (const run of runs) {
    guard(run.gate.name, "begin", errors, () => run.gate.begin?.(run.ctx));
  }

  const byKind = indexByKind(runs);
  const fileRuns = runs.filter((run) => run.gate.visitFile !== undefined);

  for (const sf of ctxBase.files) {
    const rel = repoRel(ctxBase.root, sf.getFilePath());
    for (const run of fileRuns) {
      if (inRoot(run.gate, rel)) {
        guard(run.gate.name, "visitFile", errors, () => run.gate.visitFile?.(sf, run.ctx));
      }
    }
    if (byKind.size > 0) {
      walkFile(sf, rel, byKind, errors);
    }
  }

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
    return { name: run.gate.name, ok: findings.length === 0, findings };
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
    return findings.length === g.findings.length ? g : { name: g.name, ok: findings.length === 0, findings };
  });
  return { gates, toolErrors: pass.toolErrors };
}

/** Build a full-project run context over the shared workspace (the default `pnpm check:structure` run). */
export function projectCtx(root: string): Omit<GateRunCtx, "report"> {
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
