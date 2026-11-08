// The edge table: built from the audit's case records and CodeGraph, stored in its own SQLite file, and
// judged against the working tree at query time, so a stored edge never claims to be current.
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type { SQLOutputValue } from "node:sqlite";
import { DatabaseSync } from "node:sqlite";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { UsageError } from "../../floor/cli/run-tool.ts";
import { execGit } from "../../floor/git/git.ts";
import type { ChangedLines, Edge, EdgeSource, JudgedEdge, ProductionRef } from "../contract/types.ts";
import { EDGE_SOURCES } from "../contract/types.ts";
import { changedLines, rangeChanged } from "../lib/diff.ts";
import { productionRefs } from "../lib/trace.ts";

refuseDirectInvocation(import.meta.url, "pnpm test-audit <verb>");

/** A diff from the audit revision spans the whole tree; git's output outgrows the spawn default. */
const GIT_MAX_BUFFER = 536_870_912;
const CURRENT = "current";
const TEST_ROOT = "tests/";
/** The CodeGraph relations and target kinds that name production a test runs, not a type it mentions. */
const CODEGRAPH_EDGE_KINDS = ["calls", "instantiates", "references"] as const;
const CODEGRAPH_TARGET_KINDS = ["function", "method", "class", "constant", "variable"] as const;

/** What each missing input needs, named so a query run before `build` says the step it skipped. */
const MISSING_EDGES = "no edge table here — build it first: pnpm test-audit build --audit=<index.sqlite>";
const MISSING_AUDIT = "no audit index here — --audit takes the audit's index.sqlite";
const MISSING_CODEGRAPH = "no CodeGraph database here — index the checkout with CodeGraph, or pass --codegraph=<db>";

type Row = Record<string, SQLOutputValue>;

/** Open an input read-only. A path that holds nothing is misuse, so it refuses by name instead of dying in SQLite. */
function openRead(path: string, missing: string): DatabaseSync {
  if (!existsSync(path)) {
    throw new UsageError(`${path}: ${missing}`);
  }
  return new DatabaseSync(path, { readOnly: true });
}

function text(row: Row, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : String(value ?? "");
}

function line(row: Row, key: string): number | null {
  const value = row[key];
  return typeof value === "number" ? value : null;
}

function isEdgeSource(value: string): value is EdgeSource {
  return (EDGE_SOURCES as readonly string[]).includes(value);
}

export interface BuildInputs {
  readonly repoRoot: string;
  readonly auditPath: string;
  readonly codegraphPath: string;
  readonly outPath: string;
}

export interface BuildSummary {
  readonly cases: number;
  readonly traceEdges: number;
  readonly codegraphEdges: number;
  /** Cases neither the trace nor CodeGraph ties to a production file. */
  readonly unreached: number;
  /** Trace citations of a path the case's revision does not hold: a typo or a path the auditor guessed. */
  readonly droppedRefs: number;
}

interface AuditCase {
  readonly recordId: string;
  readonly testPath: string;
  readonly caseName: string;
  readonly revision: string;
  readonly trace: string;
}

function readCases(auditPath: string): readonly AuditCase[] {
  using audit = openRead(auditPath, MISSING_AUDIT);
  return audit
    .prepare("SELECT record_id, test_path, case_name, effective_revision, production_trace FROM cases WHERE currency = ? ORDER BY record_id")
    .all(CURRENT)
    .map((row) => ({
      recordId: text(row, "record_id"),
      testPath: text(row, "test_path"),
      caseName: text(row, "case_name"),
      revision: text(row, "effective_revision"),
      trace: text(row, "production_trace"),
    }));
}

/** Every production range CodeGraph says `testPath` reaches, at the indexed tree. */
function codegraphRefs(codegraph: DatabaseSync, testPath: string): readonly ProductionRef[] {
  const kinds = (values: readonly string[]): string => values.map(() => "?").join(", ");
  return codegraph
    .prepare(
      `SELECT DISTINCT t.file_path, t.start_line, t.end_line FROM edges e
       JOIN nodes s ON s.id = e.source JOIN nodes t ON t.id = e.target
       WHERE s.file_path = ? AND e.kind IN (${kinds(CODEGRAPH_EDGE_KINDS)}) AND t.kind IN (${kinds(CODEGRAPH_TARGET_KINDS)})
         AND t.file_path NOT LIKE ? ORDER BY t.file_path, t.start_line`,
    )
    .all(testPath, ...CODEGRAPH_EDGE_KINDS, ...CODEGRAPH_TARGET_KINDS, `${TEST_ROOT}%`)
    .map((row) => ({ path: text(row, "file_path"), startLine: line(row, "start_line"), endLine: line(row, "end_line") }));
}

function headRevision(repoRoot: string): string {
  return execGit(repoRoot, ["rev-parse", "HEAD"]).trim();
}

function pathsAt(repoRoot: string, revision: string): ReadonlySet<string> {
  return new Set(execGit(repoRoot, ["ls-tree", "-r", "--name-only", revision], { maxBuffer: GIT_MAX_BUFFER }).split("\n"));
}

const SCHEMA = `CREATE TABLE edges (
  record_id TEXT NOT NULL, test_path TEXT NOT NULL, case_name TEXT NOT NULL, test_revision TEXT NOT NULL,
  production_path TEXT NOT NULL, start_line INTEGER, end_line INTEGER, edge_revision TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN (${EDGE_SOURCES.map((source) => `'${source}'`).join(", ")}))
);
CREATE INDEX edges_production ON edges (production_path);
CREATE INDEX edges_test ON edges (test_path);`;

function writeEdges(outPath: string, edges: readonly Edge[]): void {
  mkdirSync(dirname(outPath), { recursive: true });
  rmSync(outPath, { force: true });
  using out = new DatabaseSync(outPath);
  out.exec(SCHEMA);
  const insert = out.prepare("INSERT INTO edges VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  out.exec("BEGIN");
  for (const edge of edges) {
    insert.run(edge.recordId, edge.testPath, edge.caseName, edge.testRevision, edge.path, edge.startLine, edge.endLine, edge.edgeRevision, edge.source);
  }
  out.exec("COMMIT");
}

/** Build the edge table from the audit's current case records. A case whose trace cites no production file
 *  takes CodeGraph's direct callees of its test file. CodeGraph indexes the files on disk, so those edges are
 *  stamped HEAD; build on a clean tree, or a dirty file's ranges are off by its edits. */
export function buildEdges(inputs: BuildInputs): BuildSummary {
  const cases = readCases(inputs.auditPath);
  const head = headRevision(inputs.repoRoot);
  const trees = new Map<string, ReadonlySet<string>>();
  const treeAt = (revision: string): ReadonlySet<string> => {
    const known = trees.get(revision);
    if (known !== undefined) {
      return known;
    }
    const paths = pathsAt(inputs.repoRoot, revision);
    trees.set(revision, paths);
    return paths;
  };
  using codegraph = openRead(inputs.codegraphPath, MISSING_CODEGRAPH);
  const reached = new Map<string, readonly ProductionRef[]>();
  const edges: Edge[] = [];
  let droppedRefs = 0;
  let unreached = 0;
  for (const auditCase of cases) {
    const cited = productionRefs(auditCase.trace);
    const tree = treeAt(auditCase.revision);
    const held = cited.filter((ref) => tree.has(ref.path));
    droppedRefs += cited.length - held.length;
    const base = { recordId: auditCase.recordId, testPath: auditCase.testPath, caseName: auditCase.caseName, testRevision: auditCase.revision };
    if (held.length > 0) {
      edges.push(...held.map((ref): Edge => ({ ...base, ...ref, edgeRevision: auditCase.revision, source: "trace" })));
      continue;
    }
    const filled = reached.get(auditCase.testPath) ?? codegraphRefs(codegraph, auditCase.testPath);
    reached.set(auditCase.testPath, filled);
    if (filled.length === 0) {
      unreached += 1;
    }
    edges.push(...filled.map((ref): Edge => ({ ...base, ...ref, edgeRevision: head, source: "codegraph" })));
  }
  writeEdges(inputs.outPath, edges);
  return {
    cases: cases.length,
    traceEdges: edges.filter((edge) => edge.source === "trace").length,
    codegraphEdges: edges.filter((edge) => edge.source === "codegraph").length,
    unreached,
    droppedRefs,
  };
}

function toEdge(row: Row): Edge {
  const source = text(row, "source");
  if (!isEdgeSource(source)) {
    throw new Error(`edge table holds an unknown source ${JSON.stringify(source)} — rebuild it with pnpm test-audit build`);
  }
  return {
    recordId: text(row, "record_id"),
    testPath: text(row, "test_path"),
    caseName: text(row, "case_name"),
    testRevision: text(row, "test_revision"),
    path: text(row, "production_path"),
    startLine: line(row, "start_line"),
    endLine: line(row, "end_line"),
    edgeRevision: text(row, "edge_revision"),
    source,
  };
}

function readEdges(edgesPath: string, where: string, value: string): readonly Edge[] {
  using table = openRead(edgesPath, MISSING_EDGES);
  return table.prepare(`SELECT * FROM edges WHERE ${where} = ? ORDER BY test_path, record_id, production_path, start_line`).all(value).map(toEdge);
}

/** Judge each edge against the working tree: its test end against the test's revision, its production end
 *  against its own. One diff per revision. */
export function judgeEdges(repoRoot: string, edges: readonly Edge[]): readonly JudgedEdge[] {
  const diffs = new Map<string, ChangedLines>();
  const changedSince = (revision: string): ChangedLines => {
    const known = diffs.get(revision);
    if (known !== undefined) {
      return known;
    }
    const changed = changedLines(
      execGit(repoRoot, ["diff", "-U0", "--no-color", "--no-renames", "--no-ext-diff", revision, "--"], { maxBuffer: GIT_MAX_BUFFER }),
    );
    diffs.set(revision, changed);
    return changed;
  };
  return edges.map((edge) => {
    const testChanged = changedSince(edge.testRevision).has(edge.testPath);
    const productionChanged = rangeChanged(changedSince(edge.edgeRevision), edge.path, edge.startLine, edge.endLine);
    return { ...edge, stale: [...(testChanged ? (["test"] as const) : []), ...(productionChanged ? (["production"] as const) : [])] };
  });
}

/** What proves `path`: every edge into it, or into `line` of it when given. A range is read at the edge's own
 *  revision, so a stale edge's lines may have moved. */
export function provesFile(repoRoot: string, edgesPath: string, path: string, at: number | null): readonly JudgedEdge[] {
  const into = readEdges(edgesPath, "production_path", path).filter(
    (edge) => at === null || edge.startLine === null || edge.endLine === null || (edge.startLine <= at && at <= edge.endLine),
  );
  return judgeEdges(repoRoot, into);
}

/** What the cases in `testPath` touch, every edge out of them. */
export function touchedBy(repoRoot: string, edgesPath: string, testPath: string): readonly JudgedEdge[] {
  return judgeEdges(repoRoot, readEdges(edgesPath, "test_path", testPath));
}

export interface ReaderAgreement {
  readonly reader: string;
  /** Test files whose cases carry trace edges: the audit's reading is the reference. */
  readonly testFiles: number;
  /** Of the production files the trace cites, the share the reader also names. */
  readonly recall: number;
  /** Of the production files the reader names, the share the trace also cites. */
  readonly precision: number;
}

/** CodeGraph's agreement with the audit, per test file and production file: how far its callees stand in for
 *  the auditor's trace where both exist. */
export function codegraphAgreement(edgesPath: string, codegraphPath: string): ReaderAgreement {
  using table = openRead(edgesPath, MISSING_EDGES);
  const cited = new Map<string, Set<string>>();
  for (const row of table.prepare("SELECT DISTINCT test_path, production_path FROM edges WHERE source = ?").all("trace")) {
    const testPath = text(row, "test_path");
    const files = cited.get(testPath) ?? new Set<string>();
    files.add(text(row, "production_path"));
    cited.set(testPath, files);
  }
  using codegraph = openRead(codegraphPath, MISSING_CODEGRAPH);
  let shared = 0;
  let citedTotal = 0;
  let namedTotal = 0;
  for (const [testPath, files] of cited) {
    const named = new Set(codegraphRefs(codegraph, testPath).map((ref) => ref.path));
    shared += [...files].filter((file) => named.has(file)).length;
    citedTotal += files.size;
    namedTotal += named.size;
  }
  return {
    reader: "codegraph",
    testFiles: cited.size,
    recall: citedTotal === 0 ? 0 : shared / citedTotal,
    precision: namedTotal === 0 ? 0 : shared / namedTotal,
  };
}
