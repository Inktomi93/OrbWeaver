import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { DOMAIN_CONTRACT_RE, handWrittenShapes, matchedTable, tableNames } from "../../../../tooling/src/verify/lib/contract-derives-not-respells.ts";

const CONTRACTS_DIR_RE = /^packages\/contracts\/src\/(?<domain>[^/]+)\//u;

type Sources = ReturnType<Project["getSourceFiles"]>;

/** Every export name under `packages/contracts/src/<domain>/`, keyed by domain. */
function contractsExportsByDomain(files: Sources, rel: (file: Sources[number]) => string): Map<string, Set<string>> {
  const byDomain = new Map<string, Set<string>>();
  for (const file of files) {
    const domain = CONTRACTS_DIR_RE.exec(rel(file))?.groups?.["domain"];
    if (domain !== undefined) {
      const names = byDomain.get(domain) ?? new Set<string>();
      for (const [name] of file.getExportedDeclarations()) {
        names.add(name);
      }
      byDomain.set(domain, names);
    }
  }
  return byDomain;
}

/** A domain `contract/` derives its shapes. This lists every hand-written shape there that an `@orb/contracts` domain
 *  already exports under the same name, or that spells a drizzle table's row (`<Table>Row` / `<Table>Insert`). */
function respells(root: string): readonly string[] {
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
  project.addSourceFilesAtPaths(
    ["packages/db/src/schema/**/*.ts", "packages/contracts/src/*/**/*.ts", "packages/server/src/domain/*/contract/**/*.{ts,tsx}"].map((glob) =>
      join(root, glob),
    ),
  );
  const files = project.getSourceFiles();
  const rel = (file: Sources[number]): string => relative(root, file.getFilePath()).replaceAll("\\", "/");
  const contractsExports = contractsExportsByDomain(files, rel);
  const tables = tableNames(files, rel);
  const found: string[] = [];
  for (const file of files) {
    const domain = DOMAIN_CONTRACT_RE.exec(rel(file))?.groups?.["domain"];
    for (const { name } of domain === undefined ? [] : handWrittenShapes(file)) {
      const table = matchedTable(name, tables)?.table;
      if (contractsExports.get(domain ?? "")?.has(name) === true) {
        found.push(`${rel(file)}::${name} respells @orb/contracts/${domain}`);
      } else if (table !== undefined) {
        found.push(`${rel(file)}::${name} hand-writes the ${table} row`);
      }
    }
  }
  return found;
}

function withTree<T>(tree: Readonly<Record<string, string>>, run: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "contract-derives-"));
  try {
    for (const [path, source] of Object.entries(tree)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), source);
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const WIRE = "export interface RosterMemberSpec {\n  readonly kind: string;\n}\n";
const TABLES = {
  "packages/db/src/schema/workloads.ts":
    'export const workloadSchedules = sqliteTable("workload_schedules", {});\nexport const workloads = sqliteTable("workloads", {});\nexport const modelStats = sqliteTable("model_stats", {});\n',
};

test("a domain contract that re-spells a name @orb/contracts owns is refused", () => {
  const tree = { ...TABLES, "packages/contracts/src/chat/roster.ts": WIRE, "packages/server/src/domain/chat/contract/params.ts": WIRE };
  expect(withTree(tree, respells)).toEqual(["packages/server/src/domain/chat/contract/params.ts::RosterMemberSpec respells @orb/contracts/chat"]);
  const alias = { "packages/server/src/domain/chat/contract/params.ts": "export type RosterMemberSpec = {\n  readonly kind: string;\n};\n" };
  expect(withTree({ "packages/contracts/src/chat/roster.ts": WIRE, ...alias }, respells)).toHaveLength(1);
  const barrel = {
    "packages/contracts/src/chat/index.ts": 'export type { RosterMemberSpec } from "./roster.ts";\n',
    "packages/contracts/src/chat/roster.ts": WIRE,
  };
  expect(withTree({ ...barrel, ...alias }, respells)).toHaveLength(1);
});

test("a hand-written row or insert shape that names a drizzle table is refused", () => {
  const tree = {
    ...TABLES,
    "packages/server/src/domain/workloads/contract/probe-schedule.ts": "export interface WorkloadScheduleRow {\n  readonly id: string;\n}\n",
    "packages/server/src/domain/workloads/contract/x.ts": "export type WorkloadInsert = {\n  readonly id: string;\n};\n",
  };
  expect(withTree(tree, respells).toSorted()).toEqual([
    "packages/server/src/domain/workloads/contract/probe-schedule.ts::WorkloadScheduleRow hand-writes the workloadSchedules row",
    "packages/server/src/domain/workloads/contract/x.ts::WorkloadInsert hand-writes the workloads row",
  ]);
});

test("derives, aggregates and domain-internal shapes stay in the contract", () => {
  const tree = {
    ...TABLES,
    "packages/contracts/src/assets/index.ts": "export interface ListOwnedParams {\n  readonly ownerId: string;\n}\n",
    "packages/server/src/domain/assets/contract/params.ts":
      'import type { ListOwnedParams as Wire } from "@orb/contracts/assets";\n\nexport type ListOwnedParams = Wire;\n',
    "packages/server/src/domain/workloads/contract/probe-schedule.ts": "export type WorkloadScheduleRow = typeof workloadSchedules.$inferSelect;\n",
    "packages/server/src/domain/stats/contract/probe-views.ts": "export interface LeaderboardRow {\n  readonly model: string;\n}\n",
    "packages/server/src/domain/chat/contract/params.ts": "export interface JoinChatParams {\n  readonly chatId: string;\n}\n",
    "packages/contracts/src/chat/roster.ts": WIRE,
    "packages/server/src/domain/discovery/contract/results.ts": "export interface ThemeRow {\n  readonly id: string;\n}\n",
    "packages/server/src/domain/chat/verbs/not-a-contract.ts": WIRE,
  };
  expect(withTree(tree, respells)).toEqual([]);
});

test("the real contracts, domain contracts and drizzle tables agree", ({ repoRoot }) => {
  expect(respells(repoRoot)).toEqual([]);
}, 120_000);
