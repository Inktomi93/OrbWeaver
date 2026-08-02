// The db-baseline parity stage — the committed `packages/db/src/migrations/0000_baseline.sql` must equal
// what the LIVE schema (`@orb/db/schema`, the source of truth Drizzle reads at runtime) would generate.
//
// WHY IT IS A COMMIT-TIER STAGE, not only a test: pre-launch, schema changes SQUASH into the baseline
// (`baseline-single-migration` gate / Tier-1-DB.md), and `freshDb` PUSHES schema-derived DDL — so every
// per-table `.int` test passes while the committed baseline rots. TWICE a schema-version bump shipped
// without a baseline regen and was only caught ~10 hours later at `verify --push` (latest: the
// `schema_version` DEFAULT 5→6 drift, fixed 1160f0a8). The comparison costs ~1s in-process (drizzle-kit's
// own snapshot API — no stack, no db file, no network), so it was wired too LATE, not too heavy.
//
// ONE COMPARATOR, TWO CALLERS: `compareSchemaBaseline` is the single home for the statement diff — this
// file's CLI (the `pnpm check` stage) and `tests/tooling/schema-baseline-parity.int.test.ts` both call it.
// Two comparators would be exactly the drift this stage exists to catch.
//
// EQUIVALENCE = the drizzle-generated statement set vs the committed file's statement set, each
// whitespace-normalized + trailing-semicolon-stripped, ORDER-INSENSITIVE (FK-dependency order is proven
// applicable by client.int.test.ts's "baseline applies" test; here we assert STRUCTURAL parity, so a pure
// reorder is not drift). Same generator `freshDb` uses, so an in-sync baseline is byte-equivalent
// post-normalization; only a real schema/baseline divergence trips it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
// biome-ignore lint/performance/noNamespaceImport: drizzle-kit's snapshot API takes the whole schema module as a Record — namespace import is the canonical way to pass every table.
import * as schema from "@orb/db/schema";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";

const EXIT_CLEAN = 0;
const EXIT_VIOLATIONS = 1;
const EXIT_TOOL_ERROR = 2;

const BASELINE_REL = "packages/db/src/migrations/0000_baseline.sql";
const BREAKPOINT = "--> statement-breakpoint";
const WS_RE = /\s+/gu;
const TRAILING_SEMI_RE = /;\s*$/u;
/** How many drifted statements to print before summarizing — a full schema diff is unreadable. */
const MAX_SHOWN = 8;

const FIX_HINT =
  "regenerate the squashed baseline (pre-launch policy — never an incremental 0001+): " +
  "`pnpm --filter @orb/db exec drizzle-kit generate --name baseline` over a CLEARED migrations dir, then " +
  "biome-format the meta files. See docs/architecture/core/Tier-1-DB.md + the `baseline-single-migration` gate.";

export interface SchemaBaselineComparison {
  /** Statements the LIVE schema generates (normalized), sorted. */
  readonly expected: readonly string[];
  /** Statements the COMMITTED baseline holds (normalized), sorted. */
  readonly actual: readonly string[];
  /** In the live schema, absent from the baseline — the "you changed the schema and forgot to regen" arm. */
  readonly missingFromBaseline: readonly string[];
  /** In the baseline, absent from the live schema — a stale/hand-edited baseline. */
  readonly staleInBaseline: readonly string[];
}

function normalize(statement: string): string {
  return statement.replace(WS_RE, " ").replace(TRAILING_SEMI_RE, "").trim();
}

function clean(statements: readonly string[]): string[] {
  return statements
    .map(normalize)
    .filter((s) => s.length > 0)
    .sort();
}

/** The ONE comparison — the CLI stage and the int test both call this. */
export async function compareSchemaBaseline(root: string): Promise<SchemaBaselineComparison> {
  const empty = await generateSQLiteDrizzleJson({});
  const current = await generateSQLiteDrizzleJson(schema as Record<string, unknown>);
  const expected = clean(await generateSQLiteMigration(empty, current));
  const actual = clean(readFileSync(join(root, BASELINE_REL), "utf8").split(BREAKPOINT));
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return {
    expected,
    actual,
    missingFromBaseline: expected.filter((s) => !actualSet.has(s)),
    staleInBaseline: actual.filter((s) => !expectedSet.has(s)),
  };
}

function printGroup(label: string, statements: readonly string[]): void {
  if (statements.length === 0) {
    return;
  }
  process.stdout.write(`  ✗ ${statements.length} statement(s) ${label}:\n`);
  for (const s of statements.slice(0, MAX_SHOWN)) {
    process.stdout.write(`      · ${s}\n`);
  }
  if (statements.length > MAX_SHOWN) {
    process.stdout.write(`      … and ${statements.length - MAX_SHOWN} more\n`);
  }
}

async function main(): Promise<void> {
  const root = join(import.meta.dirname, "..", "..");
  let result: SchemaBaselineComparison;
  try {
    result = await compareSchemaBaseline(root);
  } catch (err) {
    // A generator/read failure is a BROKEN CHECKER, never a verdict (exit-contract §3.3).
    process.stdout.write(`db-baseline-parity — TOOL ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(EXIT_TOOL_ERROR);
  }
  process.stdout.write(`db-baseline-parity — ${result.expected.length} schema statement(s) vs ${result.actual.length} in ${BASELINE_REL}\n`);
  if (result.missingFromBaseline.length === 0 && result.staleInBaseline.length === 0) {
    process.stdout.write("  ✓ the committed baseline matches the live schema\n");
    process.exitCode = EXIT_CLEAN;
    return;
  }
  printGroup(`in the LIVE schema but NOT in ${BASELINE_REL} (the baseline was never regenerated)`, result.missingFromBaseline);
  printGroup(`in ${BASELINE_REL} but NOT in the live schema (a stale or hand-edited baseline)`, result.staleInBaseline);
  process.stdout.write(`\n  FIX: ${FIX_HINT}\n`);
  process.exit(EXIT_VIOLATIONS);
}

// Direct-run guard (the tests-execution-membership idiom): running the file spawns main(); an import (the
// int test) gets only the exported comparator.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  void main();
}
