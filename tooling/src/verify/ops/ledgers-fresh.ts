// The `ledgers:fresh` stage (#817) — the STATIC tripwire for committed single-writer outputs that
// lag the tree SILENTLY: `docs/reviews/caught-failure-ownership/population.json` (every row carries the
// `line`/`markerLine` of a caught-failure site, so ANY merge that inserts lines above one re-stales it) and
// `docs/test-baseline/manifest.json` (every tracked spec). Both already have a freshness check — but each
// is a VITEST suite, so `pnpm check` stayed green while main sat red on the next whole node run, and
// regeneration was an orchestrator barrier ritual that nothing stopped from lagging again (three re-lines
// in one night, 2026-08-30: the #799 merge shifted `plugin-frame.ts` +5 and re-staled the census twenty
// minutes after the first regen).
//
// It runs the SAME derivations the regenerators run (`deriveCaughtFailurePopulation` /
// `deriveTestBaselineManifest` — one home each, GATE-AUTHORING §4.8's single-writer door keeps the WRITE)
// and writes nothing. The existing vitest suites stay: they are the behavioural proof (bijection against
// the gate's live findings, exemption hygiene); this is the tripwire that makes the drift visible at the
// COMMIT bar instead of at the next `pnpm test`.
//
// WHOLE-PROJECT BY NATURE, and that is enforced by ABSENCE: the registry row carries no `scopedArgv`, so
// `verify --changed`/`--scope` DEFERS it with the standard notice (ops/run.ts `planStage`). There is no
// scoped derivation and there must never be one — a scoped fileset re-derives a census of a different tree
// and would report every row it did not walk as stale (the `whole-project-arms-need-scope-self-guard`
// class, paid 2026-08-30 on `tooling-front-door`).
//
// COST: the manifest half is `git ls-files` (milliseconds); the census half builds the whole-repo ts-morph
// project and is ~19s measured on this box (2026-08-30, 408 sites). That is the price of the derivation
// itself, not of this stage — the same project the `structure:full` row in the same tier already builds.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { CaughtFailurePopulation, CaughtFailureRow } from "../contract/caught-failure.ts";
import type { LedgerFreshness } from "../contract/scoped.ts";
import type { TestBaselineManifest } from "../contract/test-baseline.ts";
import { TEST_BASELINE_REL } from "../contract/test-baseline.ts";
import { deriveCaughtFailurePopulation, POPULATION_REL } from "./gen/caught-failure-population.ts";
import { deriveSnapFlagsIndexMarkdown, SNAP_FLAGS_INDEX_REL } from "./gen/snap-flags-index.ts";
import { deriveTestBaselineManifest } from "./gen/test-baseline-manifest.ts";
import { deriveTypeConfigFiles } from "./gen/type-configs.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:ledgers-fresh");

const REGEN_CENSUS = "pnpm exec node tooling/src/verify/cli.ts baseline caught-failure-population";
const REGEN_MANIFEST = "pnpm exec node tooling/src/verify/cli.ts baseline test-baseline-manifest";
const REGEN_SNAP_FLAGS_INDEX = "pnpm exec node tooling/src/verify/cli.ts baseline snap-flags-index";
const REGEN_TYPE_CONFIGS = "pnpm exec node tooling/src/verify/cli.ts baseline type-configs";

/** How many drift lines to print before summarising the tail. A re-line after a big merge moves dozens of
 *  rows; the reader needs enough to recognise the shape, not the whole diff (the file is the diff). */
const MAX_DRIFT_LINES = 40;

const MISSING = (regen: string): string => `the committed file does not exist — derive it: ${regen}`;

/** Stable, key-order-independent text for one value — so a row whose JSON key order changed is not
 *  reported as drift, and a row whose CONTENT changed always is. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      return v;
    }
    const record = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort((a, b) => a.localeCompare(b))
        .map((k) => [k, record[k]]),
    );
  });
}

/** Field-level drift for one census row present on BOTH sides — `line 412 → 417` is the whole point of the
 *  stage, so the fields are named, never summarised as "differs". */
function rowFieldDrift(siteId: string, committed: CaughtFailureRow, derived: CaughtFailureRow): string[] {
  const keys = [...new Set([...Object.keys(committed), ...Object.keys(derived)])].sort((a, b) => a.localeCompare(b));
  const changed = keys
    .filter((k) => stable((committed as unknown as Record<string, unknown>)[k]) !== stable((derived as unknown as Record<string, unknown>)[k]))
    .map((k) => `${k} ${stable((committed as unknown as Record<string, unknown>)[k])} → ${stable((derived as unknown as Record<string, unknown>)[k])}`);
  return changed.length === 0 ? [] : [`moved  ${siteId}: ${changed.join(", ")}`];
}

/** The committed census vs a fresh derivation, row by row (keyed by the move-stable `siteId`). */
export function censusDrift(committed: CaughtFailurePopulation | undefined, derived: CaughtFailurePopulation): LedgerFreshness {
  const base = { ledger: POPULATION_REL, regen: REGEN_CENSUS, derived: derived.rows.length } as const;
  if (committed === undefined) {
    return { ...base, drift: [MISSING(REGEN_CENSUS)] };
  }
  const committedRows = new Map(committed.rows.map((row) => [row.siteId, row]));
  const derivedRows = new Map(derived.rows.map((row) => [row.siteId, row]));
  const drift: string[] = [];
  for (const [siteId, row] of committedRows) {
    const fresh = derivedRows.get(siteId);
    if (fresh === undefined) {
      drift.push(`gone   ${siteId} (committed line ${row.line}) — the site is no longer on the tree`);
      continue;
    }
    drift.push(...rowFieldDrift(siteId, row, fresh));
  }
  for (const [siteId, row] of derivedRows) {
    if (!committedRows.has(siteId)) {
      drift.push(`new    ${siteId} (line ${row.line}, ${row.verdict}) — the census never recorded it`);
    }
  }
  if (stable(committed.totals) !== stable(derived.totals)) {
    drift.push(`totals ${stable(committed.totals)} → ${stable(derived.totals)}`);
  }
  return { ...base, drift: drift.sort((a, b) => a.localeCompare(b)) };
}

/** The committed test-baseline manifest vs a fresh `git ls-files` derivation. `deletions` cannot drift —
 *  the derivation carries the committed ledger forward verbatim — so only `testFiles` is compared. */
export function manifestDrift(committed: TestBaselineManifest | undefined, derived: TestBaselineManifest): LedgerFreshness {
  const base = { ledger: TEST_BASELINE_REL, regen: REGEN_MANIFEST, derived: derived.testFiles.length } as const;
  if (committed === undefined) {
    return { ...base, drift: [MISSING(REGEN_MANIFEST)] };
  }
  const listed = new Set(committed.testFiles);
  const tracked = new Set(derived.testFiles);
  const drift = [
    ...derived.testFiles.filter((f) => !listed.has(f)).map((f) => `new    ${f} — a tracked spec the manifest does not list`),
    ...committed.testFiles.filter((f) => !tracked.has(f)).map((f) => `gone   ${f} — listed but no longer a tracked spec`),
  ];
  return { ...base, drift: drift.sort((a, b) => a.localeCompare(b)) };
}

/** Read a committed JSON ledger, or undefined when it does not exist. A PARSE failure is deliberately NOT
 *  caught: a corrupt committed ledger is a tool error (exit 2 via run-tool), never a freshness verdict. */
function readCommitted<T>(root: string, rel: string): T | undefined {
  const abs = join(root, rel);
  return existsSync(abs) ? (JSON.parse(readFileSync(abs, "utf8")) as T) : undefined;
}

/** The generated snap flag index vs a fresh derivation — a byte-for-byte text ledger (no line/fileset
 *  keying, unlike the two JSON ledgers above), so drift is either "missing" or "the whole file differs". */
export function snapFlagsIndexDrift(root: string): LedgerFreshness {
  const abs = join(root, SNAP_FLAGS_INDEX_REL);
  const derivedText = deriveSnapFlagsIndexMarkdown();
  const derivedRows = derivedText.split("\n").filter((line) => line.startsWith("| `")).length;
  const base = { ledger: SNAP_FLAGS_INDEX_REL, regen: REGEN_SNAP_FLAGS_INDEX, derived: derivedRows } as const;
  if (!existsSync(abs)) {
    return { ...base, drift: [MISSING(REGEN_SNAP_FLAGS_INDEX)] };
  }
  const committedText = readFileSync(abs, "utf8");
  return { ...base, drift: committedText === derivedText ? [] : ["the committed file differs from a fresh derivation (byte-for-byte)"] };
}

/** Generated config bytes versus the complete authored-intent derivation. Each config is compared as a
 * whole file: patching JSONC fragments would preserve stale fields that the generator no longer owns. */
export function typeConfigsDrift(root: string): LedgerFreshness {
  const derived = deriveTypeConfigFiles(root);
  const drift: string[] = [];
  for (const [path, expected] of Object.entries(derived)) {
    const absolute = join(root, path);
    if (!existsSync(absolute)) {
      drift.push(`missing ${path}`);
    } else if (readFileSync(absolute, "utf8") !== expected) {
      drift.push(`changed ${path}`);
    }
  }
  return {
    ledger: "generated TypeScript configs",
    regen: REGEN_TYPE_CONFIGS,
    derived: Object.keys(derived).length,
    drift,
  };
}

/** Every single-writer output's freshness, cheap half first. The derivations run unconditionally — a stage that
 *  short-circuited on the first drift would hide the others from the same barrier run. */
export function ledgerFreshness(root: string): readonly LedgerFreshness[] {
  const manifest = manifestDrift(readCommitted<TestBaselineManifest>(root, TEST_BASELINE_REL), deriveTestBaselineManifest(root));
  const census = censusDrift(readCommitted<CaughtFailurePopulation>(root, POPULATION_REL), deriveCaughtFailurePopulation(root));
  const snapFlagsIndex = snapFlagsIndexDrift(root);
  const typeConfigs = typeConfigsDrift(root);
  return [manifest, census, snapFlagsIndex, typeConfigs];
}

/** A derivation that came back EMPTY is blindness, not cleanliness: a broken `scanRoot`, a `git ls-files`
 *  that ran outside a repo, a walk fence that swallowed the tree. Comparing an empty derivation against an
 *  empty committed file would print a serene green forever, so it REFUSES (tool error) instead. */
function blindness(result: LedgerFreshness): string | undefined {
  return result.derived === 0
    ? `${result.ledger}: the fresh derivation produced ZERO rows — the derivation went blind; this run is not a verdict (${result.regen})`
    : undefined;
}

/** The whole run's report, EVERY ledger, in order. It is a pure function of the results — and it reports
 *  all of them, never short-circuiting at the first stale one (the first live run used `.every(report)`,
 *  which stops at the first false: it printed the manifest's drift and said nothing about the census).
 *
 *  The regen command is the LAST line of a failing block on purpose: `verify`'s `failureExcerpt` keeps the
 *  last 8 non-blank lines, so the fix survives into reports/verify.json even when the drift list is long. */
export function ledgerReport(results: readonly LedgerFreshness[]): readonly string[] {
  return results.flatMap((result) => {
    if (result.drift.length === 0) {
      return [`fresh  ${result.ledger} (${result.derived} derived)`];
    }
    const shown = result.drift.slice(0, MAX_DRIFT_LINES).map((line) => `  ${line}`);
    const elided =
      result.drift.length > MAX_DRIFT_LINES ? [`  … and ${result.drift.length - MAX_DRIFT_LINES} more (the regenerated file is the full diff)`] : [];
    return [
      `STALE  ${result.ledger} — ${result.drift.length} difference(s) vs a fresh derivation:`,
      ...shown,
      ...elided,
      `  regenerate and commit: ${result.regen}`,
    ];
  });
}

/** Judge the results: exit 2 if any derivation went blind, 1 on drift, 0 when every ledger is fresh. */
function verdict(results: readonly LedgerFreshness[]): number {
  const blind = results.map(blindness).filter((m): m is string => m !== undefined);
  if (blind.length > 0) {
    for (const message of blind) {
      process.stderr.write(`TOOL ERROR ${message}\n`);
    }
    return EXIT.toolError;
  }
  for (const line of ledgerReport(results)) {
    process.stdout.write(`${line}\n`);
  }
  return results.some((result) => result.drift.length > 0) ? EXIT.violations : EXIT.clean;
}

/** The `ledgers-fresh` verb — the whole-project stage. Every output, one process, writes nothing. */
export function runLedgersFresh(root: string): number {
  return verdict(ledgerFreshness(root));
}

/** The `baseline <kind> --check` arm — the SAME derivation the writer runs, diffed instead of written.
 *  One home per ledger, two doors: `baseline <kind>` writes, `baseline <kind> --check` judges. */
export const LEDGER_CHECKS: Readonly<Record<string, (root: string) => number>> = {
  "caught-failure-population": (root) =>
    verdict([censusDrift(readCommitted<CaughtFailurePopulation>(root, POPULATION_REL), deriveCaughtFailurePopulation(root))]),
  "test-baseline-manifest": (root) => verdict([manifestDrift(readCommitted<TestBaselineManifest>(root, TEST_BASELINE_REL), deriveTestBaselineManifest(root))]),
  "snap-flags-index": (root) => verdict([snapFlagsIndexDrift(root)]),
  "type-configs": (root) => verdict([typeConfigsDrift(root)]),
};
