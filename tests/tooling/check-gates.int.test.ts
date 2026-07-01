// Pins that EVERY ts-morph/fs structural gate actually fires on a violation — the gate self-test the
// dep-cruiser suite has, now for scripts/check/gates/*. A gate with a broken regex / AST query silently
// matches nothing and passes green (the exact failure the dep-cruiser test was built to catch); this is
// its structural-gate twin. The gate registry is DERIVED from `report.ts`'s own output (every gate it
// prints must fire on some fixture) — so a new gate added without a fixture FAILS here (anti-drift).
//
// Each fixture is a minimal violation at the path its gate anchors on, all named `__g_*` so cleanup is a
// single find -prune -rm. We run `check:structure` clean (→ the registry), then with fixtures (→ the
// fired set), and assert every registered gate is in the fired set.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { expect, test } from "../support/fixtures";

const ROOT = join(import.meta.dirname, "..", "..");
const OK_RE = /✓\s+([a-z-]+)/gu;
const FIRED_RE = /✗\s+([a-z-]+)/gu;
const TS_EXT_RE = /\.ts$/u;
const GATE_DIR = join(ROOT, "scripts", "check", "gates");
// every gate file on disk (basename) — the source of truth for "what gates exist".
const GATE_FILES = readdirSync(GATE_DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => f.replace(TS_EXT_RE, ""))
  .sort();

function fx(rel: string, content: string): void {
  const abs = join(ROOT, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function cleanFixtures(): void {
  execFileSync(
    "find",
    ["packages", "tests", "-name", "__g_*", "-prune", "-exec", "rm", "-rf", "{}", "+"],
    {
      cwd: ROOT,
    },
  );
}

function runStructure(): string {
  try {
    return execFileSync("pnpm", ["exec", "tsx", "scripts/check/report.ts"], {
      cwd: ROOT,
      encoding: "utf8",
    });
  } catch (err) {
    // report.ts exits 1 when a gate fires — the report is on stdout.
    return (err as { stdout?: string }).stdout ?? "";
  }
}

function names(re: RegExp, out: string): Set<string> {
  // `m[1]` is `string | undefined` under noUncheckedIndexedAccess — flatMap drops the (impossible
  // here, but type-visible) undefined so the Set is `Set<string>`.
  return new Set([...out.matchAll(re)].flatMap((m) => (m[1] === undefined ? [] : [m[1]])));
}

function writeFixtures(): void {
  const D = "packages/server/src/domain";
  // feature-structure: a feature missing required slots (only index.ts).
  fx(`${D}/__g_struct/index.ts`, "export const x = 1;\n");
  // verb-naming: verbs/<v>.ts not exporting create<V>.
  fx(`${D}/__g_verb/verbs/thing.ts`, "export const wrong = 1;\n");
  // types-in-contract: contract/service.ts without the exported interface.
  fx(`${D}/__g_types/contract/service.ts`, "export const notAnInterface = 1;\n");
  // test-presence: a verb with no mirror test.
  fx(`${D}/__g_pres/verbs/act.ts`, "export function createAct(): number {\n  return 1;\n}\n");
  // no-inline-union-redecl: an inline ≥3-member string-literal union alias.
  fx("packages/server/src/__g_union.ts", 'export type U = "a" | "b" | "c";\n');
  // commented-code: parked code in a // comment.
  fx("packages/server/src/__g_commented.ts", "// const dead = 1;\nexport const live = 1;\n");
  // schema-branding: a db text id column without .$type<XId>().
  fx(
    "packages/db/src/schema/__g_brand.ts",
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const gBrand = sqliteTable("g_brand", { id: text("id").primaryKey() });\n',
  );
  // db-structure: a schema file NOT re-exported from the barrel schema/index.ts.
  fx("packages/db/src/schema/__g_orphan.ts", "export const gOrphan = 1;\n");
  // test-layout: a test with no source mirror.
  fx("tests/server/__g_nomirror.test.ts", "export {};\n");
  // test-determinism: ambient clock in a test (tooling/ is scanned; only support/+e2e/ are exempt).
  // The banned call is assembled so the literal isn't present in THIS file's source (which the gate
  // also scans) — only the written fixture resolves to the ambient-clock call.
  fx("tests/tooling/__g_det.test.ts", `export const t = ${["Date", "now"].join(".")}();\n`);
  // providers-runner-seal: a domain consumer (above infra) importing a sealed runner symbol.
  fx(
    "packages/server/src/domain/__g_seal/x.ts",
    `import { deriveRunner } from "@orb/server/infra/providers";\nexport const x = deriveRunner;\n`,
  );
  // pd-citation-integrity: a code FLAG[PD-n] citing an id with no registry row (orphan).
  // The citation is assembled so the literal isn't present in THIS file's source (which the gate
  // also scans) — only the written fixture resolves to the orphan citation.
  fx(
    "packages/server/src/__g_pd.ts",
    `// ${["FLAG", "[PD-9999]"].join("")} — orphan citation, no registry row.\nexport const x = 1;\n`,
  );
  // no-direct-users-read: a domain outside sessions/admin importing the `users` table from @orb/db.
  fx(
    `${D}/__g_users/persistence/x.ts`,
    `import { users } from "@orb/db";\nexport const x = users;\n`,
  );
  // sole-env-reader: a server file outside foundation/env touching process.env (bracket form).
  fx(
    "packages/server/src/domain/__g_env.ts",
    `import process from "node:process";\nexport const x = process.env["FOO"];\n`,
  );
  // assumes-single-replica: a module-scope mutable cache in a file with no ASSUMES(single-replica).
  fx(
    "packages/server/src/domain/__g_replica.ts",
    "export const cache = new Map<string, number>();\n",
  );
  // no-caller-user-id: the D19-forbidden `callerUserId` identifier (in the fixture's source, not here).
  fx("packages/server/src/__g_caller.ts", "export const callerUserId = 1;\n");
  // test-mock-doctrine: vi.mock targeting an internal relative module.
  fx("tests/__g_mock.test.ts", `import { vi } from "vitest";\nvi.mock("../src/foo");\n`);
  // test-factory-contract: makeX taking db, seedX without db.
  fx(
    "tests/support/factories/__g_factory.ts",
    "export function makeWrong(db: any) {}\nexport function seedWrong(a: any) {}\n",
  );
  // test-fixture-imports: importing test/expect directly from vitest.
  fx("tests/__g_imports.test.ts", `import { test, expect } from "vitest";\n`);
  // test-no-stubs: a test block with no assertions.
  fx(
    "tests/__g_stub.test.ts",
    `import { test } from "support/test";\ntest("stub", () => {\n  const x = 1;\n});\n`,
  );
  // server-layout: an illegal directory at the root of server/src.
  fx("packages/server/src/__g_rogue_drawer/index.ts", "export const x = 1;\n");
  // package-layout: a loose file at the root of kit/src.
  fx("packages/kit/src/__g_rogue.ts", "export const x = 1;\n");
}

let registry = new Set<string>();
let fired = new Set<string>();

beforeAll(() => {
  cleanFixtures();
  // registry = every gate report.ts prints, ✓ OR ✗. A gate can be legitimately ✗ on the real tree
  // (e.g. test-presence flagging a not-yet-tested infra/foundation file) and must still count as
  // "registered" — otherwise the dir-cross-check below would mistake an honest red for an unregistered gate.
  const cleanReport = runStructure();
  registry = new Set([...names(OK_RE, cleanReport), ...names(FIRED_RE, cleanReport)]);
  writeFixtures();
  fired = names(FIRED_RE, runStructure()); // with fixtures: the gates that caught a violation
}, 60_000);

afterAll(() => {
  cleanFixtures();
});

test("derives a non-trivial gate registry from report.ts (not silently empty)", () => {
  expect(registry.size).toBeGreaterThan(8);
});

test("every registered structural gate fires on its fixture (anti-drift)", () => {
  const unfired = [...registry].filter((g) => !fired.has(g));
  expect(unfired).toEqual([]);
});

test("every gate file in scripts/check/gates is registered in report.ts (anti-drift)", () => {
  // A gate file that exists but is never listed in report.ts silently does nothing — it never runs,
  // so the "fires on its fixture" test above can't catch it (it's not in the registry). This closes
  // that hole: the gate file's basename (kebab) must equal a gate name report.ts prints.
  const unregistered = GATE_FILES.filter((g) => !registry.has(g));
  expect(unregistered).toEqual([]);
});
