// The edge table end to end on a planted repository: built from a planted audit index and CodeGraph database, queried both
// ways, and judged stale when either end changes in the working tree.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@orb/testkit/tooling";
import { UsageError } from "../../../../tooling/src/floor/cli/run-tool.ts";
import { configureFixtureGitIdentity, execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { buildEdges, codegraphAgreement, provesFile, touchedBy } from "../../../../tooling/src/test-audit/index.ts";

const LINES = Array.from({ length: 20 }, (_, index) => `export const line${String(index + 1)} = ${String(index + 1)};`).join("\n");
const A = "packages/kit/src/a.ts";
const B = "packages/kit/src/b.ts";
const A_TEST = "tests/kit/a.test.ts";
const B_TEST = "tests/kit/b.test.ts";

function git(root: string, ...args: readonly string[]): string {
  return execFixtureGit(root, args).trim();
}

function plantAudit(path: string, revision: string): void {
  using audit = new DatabaseSync(path);
  audit.exec("CREATE TABLE cases (record_id, effective_revision, currency, test_path, case_name, production_trace)");
  const insert = audit.prepare("INSERT INTO cases VALUES (?, ?, ?, ?, ?, ?)");
  insert.run("A1", revision, "current", A_TEST, "reads the head", `${A}:3-5 owner; packages/kit/src/gone.ts:1 a guess`);
  insert.run("A2", revision, "current", A_TEST, "reads the tail", `${A}:15 predicate`);
  insert.run("B1", revision, "current", B_TEST, "runs b", "AF3-B001-file-1 full read, no citation");
  insert.run("H1", revision, "historical", A_TEST, "a superseded record", `${B}:1`);
}

/** The CodeGraph tables the gap fill reads. `B_TEST` calls into production, into a test helper, and names a type;
 *  `A_TEST` calls one file its trace cites and one it does not. */
function plantCodegraph(path: string): void {
  using codegraph = new DatabaseSync(path);
  codegraph.exec("CREATE TABLE nodes (id, kind, file_path, start_line, end_line); CREATE TABLE edges (source, target, kind)");
  const node = codegraph.prepare("INSERT INTO nodes VALUES (?, ?, ?, ?, ?)");
  node.run("case", "function", B_TEST, 1, 3);
  node.run("prod", "function", B, 2, 4);
  node.run("helper", "function", "tests/support/node/db.ts", 1, 9);
  node.run("type", "type_alias", A, 1, 1);
  node.run("aCase", "function", A_TEST, 1, 2);
  node.run("aProd", "constant", A, 3, 3);
  const edge = codegraph.prepare("INSERT INTO edges VALUES (?, ?, ?)");
  edge.run("case", "prod", "calls");
  edge.run("case", "helper", "calls");
  edge.run("case", "type", "references");
  edge.run("aCase", "aProd", "calls");
  edge.run("aCase", "prod", "calls");
}

async function plantedRepo(plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>): Promise<{ root: string; revision: string }> {
  const root = await plantedTree({ [A]: `${LINES}\n`, [B]: `${LINES}\n`, [A_TEST]: "a\n", [B_TEST]: "b\n" });
  git(root, "init", "-q", "-b", "main");
  configureFixtureGitIdentity(root);
  git(root, "add", "-A");
  git(root, "commit", "-qm", "chore: base");
  return { root, revision: git(root, "rev-parse", "HEAD") };
}

test("the edge table answers both directions and marks a case stale when its production range or its test file changes", async ({ plantedTree, scratch }) => {
  const { root, revision } = await plantedRepo(plantedTree);
  const inputs = {
    repoRoot: root,
    auditPath: join(scratch, "audit.sqlite"),
    codegraphPath: join(scratch, "codegraph.db"),
    outPath: join(scratch, "out", "edges.sqlite"),
  };
  plantAudit(inputs.auditPath, revision);
  plantCodegraph(inputs.codegraphPath);

  expect(buildEdges(inputs)).toEqual({ cases: 3, traceEdges: 2, codegraphEdges: 1, unreached: 0, droppedRefs: 1 });
  const stale = (edges: ReturnType<typeof provesFile>): readonly (readonly [string, readonly string[]])[] =>
    edges.map((edge) => [edge.recordId, edge.stale] as const);

  expect(stale(provesFile(root, inputs.outPath, A, null))).toEqual([
    ["A1", []],
    ["A2", []],
  ]);
  expect(provesFile(root, inputs.outPath, A, 4).map((edge) => edge.recordId)).toEqual(["A1"]);
  expect(
    touchedBy(root, inputs.outPath, B_TEST).map(({ recordId, path, startLine, endLine, source, edgeRevision }) => ({
      recordId,
      path,
      startLine,
      endLine,
      source,
      edgeRevision,
    })),
  ).toEqual([{ recordId: "B1", path: B, startLine: 2, endLine: 4, source: "codegraph", edgeRevision: revision }]);

  writeFileSync(join(root, A), `${LINES.replace("line15 = 15", "line15 = 150")}\n`);
  writeFileSync(join(root, B_TEST), "b changed\n");
  expect(stale(provesFile(root, inputs.outPath, A, null))).toEqual([
    ["A1", []],
    ["A2", ["production"]],
  ]);
  expect(stale(touchedBy(root, inputs.outPath, B_TEST))).toEqual([["B1", ["test"]]]);
});

test("a query run before build is misuse that names the build step, and each missing input is named", async ({ plantedTree, scratch }) => {
  const { root, revision } = await plantedRepo(plantedTree);
  const inputs = {
    repoRoot: root,
    auditPath: join(scratch, "audit.sqlite"),
    codegraphPath: join(scratch, "codegraph.db"),
    outPath: join(scratch, "edges.sqlite"),
  };
  const queries: readonly (() => unknown)[] = [
    (): unknown => provesFile(root, inputs.outPath, A, null),
    (): unknown => touchedBy(root, inputs.outPath, A_TEST),
    (): unknown => codegraphAgreement(inputs.outPath, inputs.codegraphPath),
  ];
  for (const query of queries) {
    expect(query).toThrow(UsageError);
    expect(query).toThrow(/pnpm test-audit build --audit=/u);
  }
  // No audit index and no CodeGraph database are named by their own flags, not by a SQLite stack.
  expect(() => buildEdges(inputs)).toThrow(/--audit takes/u);
  plantAudit(inputs.auditPath, revision);
  expect(() => buildEdges(inputs)).toThrow(/--codegraph=/u);
  // Control: with every input present the same queries answer, so the refusals above came from the missing files.
  plantCodegraph(inputs.codegraphPath);
  buildEdges(inputs);
  for (const query of queries) {
    expect(query).not.toThrow();
  }
});

test("CodeGraph's agreement with the trace is counted per test file and production file", async ({ plantedTree, scratch }) => {
  const { root, revision } = await plantedRepo(plantedTree);
  const inputs = {
    repoRoot: root,
    auditPath: join(scratch, "audit.sqlite"),
    codegraphPath: join(scratch, "codegraph.db"),
    outPath: join(scratch, "edges.sqlite"),
  };
  plantAudit(inputs.auditPath, revision);
  plantCodegraph(inputs.codegraphPath);
  buildEdges(inputs);
  // `A_TEST` is the one file with trace edges: CodeGraph names `A`, which the trace cites, and `B`, which it does not.
  expect(codegraphAgreement(inputs.outPath, inputs.codegraphPath)).toEqual({ reader: "codegraph", testFiles: 1, recall: 1, precision: 0.5 });
});
