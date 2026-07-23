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

/** Walk from the reported node up to its statement/file boundary, looking for a
 *  `// @orb-gate-ignore <gate-name>` suppression comment. Stops at the statement boundary so a comment
 *  above an unrelated sibling doesn't leak a suppression onto this node. */
function hasGateIgnore(node: Node, gateName: string): boolean {
  const ignoreRe = new RegExp(`//\\s*@orb-gate-ignore\\s+${gateName}\\b`);
  // biome-ignore lint/suspicious/noExplicitAny: AST traversal
  let scanNode: any = node;
  while (scanNode) {
    if (typeof scanNode.getLeadingCommentRanges === "function") {
      const comments = scanNode.getLeadingCommentRanges();
      // biome-ignore lint/suspicious/noExplicitAny: AST traversal
      if (comments.some((c: any) => ignoreRe.test(c.getText()))) {
        return true;
      }
    }
    const kindName = typeof scanNode.getKindName === "function" ? scanNode.getKindName() : "";
    if (kindName === "SourceFile" || kindName.includes("Statement")) {
      break;
    }
    scanNode = typeof scanNode.getParent === "function" ? scanNode.getParent() : undefined;
  }
  return false;
}

function makeGateRun(gate: GateDescriptor, ctxBase: Omit<GateRunCtx, "report">): GateRun {
  const sink: Finding[] = [];
  const report = (nodeOrFinding: Node | Finding, atToken?: { readonly token: string; readonly offset: number }): void => {
    if (!isNode(nodeOrFinding)) {
      sink.push(nodeOrFinding);
      return;
    }
    const node = nodeOrFinding;
    if (hasGateIgnore(node, gate.name)) {
      return;
    }

    const file = repoRel(ctxBase.root, node.getSourceFile().getFilePath());
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
