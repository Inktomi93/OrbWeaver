// The db-baseline parity stage — the committed migration CHAIN must already account for everything the
// LIVE schema (`@orb/db/schema`, the source of truth Drizzle reads at runtime) declares.
//
// RE-POINTED AT THE CHAIN 2026-09-18 (#316 Arm A, the launch flip; Tier-1-DB.md §"Regime 2" asked for
// exactly this, by name). It used to generate from `{}` and compare the resulting CREATE set against
// `0000_baseline.sql`'s statements — correct only while the policy was "there is exactly one migration and
// it is regenerated in place". The instant a legitimate `0001_x` exists, the from-scratch set no longer
// matches any single file and that comparison reds on every honest incremental. So the question is now
// asked the way drizzle itself asks it: generate from the CHAIN TIP's `meta/<n>_snapshot.json` to the live
// schema and require the result to be EMPTY. Pending statements mean a schema edit with no migration
// behind it (or a migration whose change never reached the schema files).
//
// WHY IT IS A COMMIT-TIER STAGE, not only a test: `freshDb` PUSHES schema-derived DDL, so every per-table
// `.int` test passes while the committed migrations rot. TWICE a schema-version bump shipped without a
// baseline regen and was only caught ~10 hours later at `verify --push` (latest: the `schema_version`
// DEFAULT 5→6 drift, fixed 1160f0a8). The comparison costs ~1s in-process (drizzle-kit's own snapshot API
// — no stack, no db file, no network), so it was wired too LATE, not too heavy.
//
// ONE COMPARATOR, TWO CALLERS: `compareSchemaBaseline` is the single home for the diff — this file's CLI
// (the `pnpm check` stage) and `tests/tooling/verify/ops/db-baseline-parity.int.test.ts` both call it.
// Two comparators would be exactly the drift this stage exists to catch.
//
// DECLARED LIMIT: the subject is the SNAPSHOT chain, which is what drizzle diffs against. A migration's
// `.sql` hand-edited WITHOUT its snapshot is invisible here — that pair is guarded from the other two
// sides: `pnpm check:drizzle-kit` owns journal/snapshot chain integrity, and `tests/db/client.int.test.ts`
// applies the committed chain to a real libSQL db. Post-launch an applied `.sql` must never be edited at
// all (Tier-1-DB.md §"Regime 2" step 4), and a db that recorded one is boot-FATAL.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { SchemaBaselineComparison } from "../contract/scoped.ts";
import { NOTICE_MARKER } from "../contract/stage.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:db-baseline");

const MIGRATIONS_REL = "packages/db/src/migrations";
const JOURNAL_REL = `${MIGRATIONS_REL}/meta/_journal.json`;
const WS_RE = /\s+/gu;
const TRAILING_SEMI_RE = /;\s*$/u;
/** How many drifted statements to print before summarizing — a full schema diff is unreadable. */
const MAX_SHOWN = 8;
/** drizzle names snapshots `0000_snapshot.json`, `0001_snapshot.json`, … — index-ordered, zero-padded to 4. */
const SNAPSHOT_INDEX_WIDTH = 4;

const FIX_HINT =
  "emit the forward migration the schema edit owes (post-launch policy — the baseline is FROZEN and is " +
  "never regenerated): `pnpm --filter @orb/db exec drizzle-kit generate --name <what-changed>` with the " +
  "migrations dir untouched, READ the emitted SQL, then biome-format the meta files. See " +
  'docs/architecture/core/Tier-1-DB.md §"Regime 2".';

function normalize(statement: string): string {
  return statement.replace(WS_RE, " ").replace(TRAILING_SEMI_RE, "").trim();
}

function clean(statements: readonly string[]): string[] {
  return statements
    .map(normalize)
    .filter((s) => s.length > 0)
    .sort();
}

/** The committed chain's journal entries, in apply order — the same file drizzle's migrator reads. A
 *  malformed or empty journal THROWS: the caller routes that to `EXIT.toolError`, because "I could not
 *  find the chain" must never print as "the schema is in sync". */
function readJournal(root: string): { readonly length: number; readonly tip: string } {
  const parsed: unknown = JSON.parse(readFileSync(join(root, JOURNAL_REL), "utf8"));
  const entries = typeof parsed === "object" && parsed !== null ? (parsed as { entries?: unknown }).entries : undefined;
  if (!Array.isArray(entries)) {
    throw new Error(`${JOURNAL_REL} has no 'entries' array — the chain cannot be identified`);
  }
  const tags = entries.map((entry: unknown, index) => {
    const tag = typeof entry === "object" && entry !== null ? (entry as { tag?: unknown }).tag : undefined;
    if (typeof tag !== "string") {
      throw new Error(`${JOURNAL_REL} entry ${index} has no string 'tag'`);
    }
    return tag;
  });
  const tip = tags.at(-1);
  if (tip === undefined) {
    throw new Error(`${JOURNAL_REL} holds no migration entries — the chain cannot be identified`);
  }
  return { length: tags.length, tip };
}

/** The chain tip's committed snapshot — drizzle's own record of the schema AFTER the last migration, and
 *  therefore the state a new `generate` would diff against. Validated rather than cast blind: a snapshot
 *  missing its `dialect`/`tables` shape would otherwise be diffed as an EMPTY schema, which prints the
 *  whole schema as "pending" — a spectacular false red that reads like a real finding. */
function readChainTipSnapshot(root: string, tipIndex: number): Record<string, unknown> {
  const rel = `${MIGRATIONS_REL}/meta/${String(tipIndex).padStart(SNAPSHOT_INDEX_WIDTH, "0")}_snapshot.json`;
  const parsed: unknown = JSON.parse(readFileSync(join(root, rel), "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("dialect" in parsed) || !("tables" in parsed)) {
    throw new Error(`${rel} is not a drizzle snapshot (no 'dialect'/'tables') — the chain tip cannot be diffed`);
  }
  return parsed as Record<string, unknown>;
}

/** The ONE comparison — the CLI stage and the int test both call this.
 *
 *  `@orb/db/schema` and drizzle-kit's snapshot API are DYNAMIC imports on purpose: this module is reachable
 *  from the tool's index.ts (the five-slot front door every verify suite enters through), and a static
 *  import would drag the whole db schema graph + drizzle-kit into every gate-conformance run that never
 *  touches the baseline. */
export async function compareSchemaBaseline(root: string): Promise<SchemaBaselineComparison> {
  // biome-ignore lint/performance/noNamespaceImport: drizzle-kit's snapshot API takes the whole schema module as a Record — namespace import is the canonical way to pass every table.
  const schema = await import("@orb/db/schema");
  const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import("drizzle-kit/api");
  const journal = readJournal(root);
  const tip = readChainTipSnapshot(root, journal.length - 1);
  const current = await generateSQLiteDrizzleJson(schema as Record<string, unknown>);
  // The snapshot's own shape is drizzle-kit-internal; the door is its API signature, and the validation
  // above is what makes this narrowing a checked one rather than a hope.
  const pending = clean(await generateSQLiteMigration(tip as Parameters<typeof generateSQLiteMigration>[0], current));
  return { chainTip: journal.tip, chainLength: journal.length, pending };
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

// ── the LOCAL-DB DIVERGENCE TRIPWIRE (advisory — issue #534, re-aimed by #316) ───────────────────────
// The gating arm above asks "does the committed CHAIN account for the live SCHEMA". This one asks the
// other question the same file governs: "is what the LOCAL DB recorded still in that chain" — because
// when it is not, the next server boot ABORTS (`DB_LAUNCHED`, boot/migrate.ts). It used to forecast the
// opposite consequence, an automatic wipe: on 2026-08-23 that cost a 1,242-chat import and ~8h of GPU
// passes with no signal but a server.log line read hours later (#533), and on 2026-08-19 it took the
// owner's whole corpus (#316, the incident behind the launch flip).
//
// It stays a NOTICE, never a violation: the stage's verdict is about the COMMITTED tree, and whatever a
// particular developer's db recorded is not a property of the commit. What it buys is VISIBILITY at the
// decision point — the line rides the `[verify-notice]` channel, which `printSummary` renders in the tail
// beside the verdict.
//
// A lane worktree has no `data/` and gets `no-db` (silence); a fresh checkout gets `trivial` (silence);
// an unreadable db gets `unknown`, which is REPORTED — "I could not measure" is never printed as clean.
const DEV_DB_MIGRATIONS = "packages/db/src/migrations";
const MIB = 1_048_576;
const HASH_PREFIX = 12;
const DEFAULT_DATABASE_URL = "file:./data/orbweaver.db"; // mirrors foundation/env's default.

function noticeLine(text: string): void {
  process.stdout.write(`${NOTICE_MARKER} ${text}\n`);
}

/** Print the local-db divergence forecast, if there is anything to say. Never throws, never gates. */
async function reportDevDbForecast(root: string): Promise<void> {
  // biome-ignore lint/style/noProcessEnv: the dev db's URL is genuinely process env — this stage runs standalone, outside the server's env module.
  const url = process.env["DATABASE_URL"] ?? DEFAULT_DATABASE_URL;
  const { forecastDevDbReset } = await import("@orb/db");
  let forecast: Awaited<ReturnType<typeof forecastDevDbReset>>;
  // @orb-waive caught-failure-ownership(err): printed via noticeLine — this is a Never-throws/never-gates forecast function per the doc comment above, and the notice itself says "could not read", never claiming safety. Ends if this forecast starts gating the run's exit code.
  try {
    forecast = await forecastDevDbReset(url, join(root, DEV_DB_MIGRATIONS));
  } catch (err) {
    noticeLine(`could not read the db at ${url} to forecast a boot refusal: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (forecast.status === "unknown") {
    noticeLine(`could not forecast a boot refusal for ${forecast.path}: ${forecast.reason} — this check said nothing, which is not the same as "safe"`);
    return;
  }
  if (forecast.status !== "diverged") {
    return;
  }
  const mib = Math.round(forecast.bytes / MIB);
  noticeLine(
    `THE NEXT SERVER BOOT WILL REFUSE TO START. ${forecast.path} (${mib} MiB) recorded migration ` +
      `${forecast.appliedHash.slice(0, HASH_PREFIX)}…, which is in no entry of the committed chain (its newest is ` +
      `${forecast.shippedHash.slice(0, HASH_PREFIX)}…) — boot/migrate aborts rather than auto-wipe a LAUNCHED db (#316). ` +
      "An applied migration was edited or deleted: restore it, or ship the change as a forward incremental " +
      "migration. A deliberate wipe of a local dev db is `pnpm seed:demo --fresh`.",
  );
}

/** The `db-baseline` verb. ROOT is the caller's cwd, never a depth-derived `import.meta.dirname` walk —
 *  the up-count is a property of where the file SITS, and it silently changes at every move (playbook
 *  §9.1-4). */
export async function runDbBaselineParity(root: string): Promise<number> {
  await reportDevDbForecast(root);
  let result: SchemaBaselineComparison;
  // @orb-waive caught-failure-ownership(err): printed as TOOL ERROR and routed through EXIT.toolError, per the exit-contract §3.3 comment below. Ends if that exit code stops being surfaced.
  try {
    result = await compareSchemaBaseline(root);
  } catch (err) {
    // A generator/read failure is a BROKEN CHECKER, never a verdict (exit-contract §3.3).
    process.stdout.write(`db-baseline-parity — TOOL ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    return EXIT.toolError;
  }
  process.stdout.write(`db-baseline-parity — live schema vs the ${result.chainLength}-migration chain ending at ${result.chainTip}\n`);
  if (result.pending.length === 0) {
    process.stdout.write("  ✓ the committed migration chain accounts for the live schema\n");
    return EXIT.clean;
  }
  printGroup(`drizzle would emit to bring ${result.chainTip} up to the live schema (a schema edit with no migration behind it)`, result.pending);
  process.stdout.write(`\n  FIX: ${FIX_HINT}\n`);
  return EXIT.violations;
}
