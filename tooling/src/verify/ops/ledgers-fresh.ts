// The `ledgers:fresh` stage (#817) — the STATIC tripwire for committed single-writer outputs that
// lag the tree SILENTLY, the founding one being the caught-failure census (every row then carried the
// `line`/`markerLine` of its site, so ANY merge that inserted lines above one re-staled it; since work item
// 0009 the committed row is only the judgment keyed by `siteId`, and a line move is no longer drift). The
// test-baseline manifest was the second and was DELETED with its
// `monotonic-tests` gate (#2217, owner ruling). The census already had a freshness check — but it
// was a VITEST suite, so `pnpm check` stayed green while main sat red on the next whole node run, and
// regeneration was an orchestrator barrier ritual that nothing stopped from lagging again (three re-lines
// in one night, 2026-08-30: the #799 merge shifted `plugin-frame.ts` +5 and re-staled the census twenty
// minutes after the first regen).
//
// It runs the SAME derivations the regenerators run (`deriveCaughtFailurePopulation` and its siblings —
// one home each, GATE-AUTHORING §4.8's single-writer door keeps the WRITE)
// and writes nothing. The existing vitest suites stay: they are the behavioural proof (bijection against
// the gate's live findings, exemption hygiene); this is the tripwire that makes the drift visible at the
// COMMIT bar instead of at the next `pnpm test`.
//
// WHOLE-PROJECT BY NATURE: the registry's identity trigger runs the complete stage command for a
// changed selection (#2304). It never passes a narrowed fileset into a derivation; that would compare
// a census of a different tree and misreport every omitted row as stale.
//
// THE SUBJECT WIDENED 2026-09-12 (#2017/#2008) AND THE STAGE'S NAME NOW UNDERSELLS IT. Three of the seven
// rows are not single-writer ledgers at all: they are HAND-AUTHORED CLAIMS IN LAW DOCS that nothing held
// two-sided, which is the same failure shape one substrate over — a list written against a tree, and then
// the tree moved. The read-first cost table (all EIGHT sizes stale at once, the work queue by 7x), the
// refutation ledger's appended sections against the verifier reports they were transcribed from (nothing
// reconciled them, so a dropped row was silent), and the deferred gate roster (five rows reading
// "not yet ported" while their gate shipped). Two are derivations with a `baseline` writer; the third is a
// parity check between two AUTHORED texts and deliberately has no writer — a generator there would let a
// transcription error overwrite the evidence it got wrong. Each says so at its own function.
//
// COST: the cheap derivations take milliseconds; the caught-failure census builds the whole-repo ts-morph
// project and was ~19s on this box (2026-08-30, 408 sites). That is the price of the derivation itself,
// not a current measurement or a claim that the retired test-baseline manifest is still read.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { CaughtFailureJudgment, CaughtFailurePopulation } from "../contract/caught-failure.ts";
import { THEME } from "../contract/css-family.ts";
import type { LedgerFreshness } from "../contract/scoped.ts";
import { readDoc } from "../lib/gate-program-docs.ts";
import { deriveCaughtFailurePopulation, POPULATION_REL } from "./gen/caught-failure-population.ts";
import { READ_FIRST_COST_ROW_IDS, READ_FIRST_REL, readFirstCostRowDrift } from "./gen/read-first-costs.ts";
import { deriveSnapFlagsIndexMarkdown, SNAP_FLAGS_INDEX_REL } from "./gen/snap-flags-index.ts";
import { deriveThemeCss, THEME_BASELINE, THEME_REGEN } from "./gen/theme-css.ts";
import { deriveTypeConfigFiles } from "./gen/type-configs.ts";
import { classRollupDrift, ledgerSectionDrift } from "./ledgers-fresh-rollup.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:ledgers-fresh");

const REGEN_CENSUS = "pnpm exec node tooling/src/verify/cli.ts baseline caught-failure-population";
const REGEN_SNAP_FLAGS_INDEX = "pnpm exec node tooling/src/verify/cli.ts baseline snap-flags-index";
const REGEN_TYPE_CONFIGS = "pnpm exec node tooling/src/verify/cli.ts baseline type-configs";
const REGEN_READ_FIRST_COSTS = "pnpm exec node tooling/src/verify/cli.ts baseline read-first-costs";

const GATES_DIR = "tooling/src/verify/gates";
const DEFERRED_ROSTER_REL = "docs/law/Core-Enforcement-Deferred-Dropped.md";
/** A trigger cell that has ALREADY been adjudicated. Caps are the document's own convention for a resolved
 *  row, and the words are its own vocabulary — not a grammar invented here. */
const RESOLVED_TRIGGER = /\b(PROMOTED|DROPPED|SUPERSEDED|UPGRADED|RETIRED)\b/;
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

/** Field-level drift for one census row present on BOTH sides — `verdict "unproven" → "deliberate-absorb"`
 *  names what changed, never a bare "differs". */
function rowFieldDrift(siteId: string, committed: CaughtFailureJudgment, derived: CaughtFailureJudgment): string[] {
  const keys = [...new Set([...Object.keys(committed), ...Object.keys(derived)])].sort((a, b) => a.localeCompare(b));
  const changed = keys
    .filter((k) => stable((committed as unknown as Record<string, unknown>)[k]) !== stable((derived as unknown as Record<string, unknown>)[k]))
    .map((k) => `${k} ${stable((committed as unknown as Record<string, unknown>)[k])} → ${stable((derived as unknown as Record<string, unknown>)[k])}`);
  return changed.length === 0 ? [] : [`changed ${siteId}: ${changed.join(", ")}`];
}

/** The committed census vs a fresh derivation, row by row (keyed by the move-stable `siteId`). A vanished
 *  site is named by its id: the committed row carries no coordinate to cite, and the id spells the path. */
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
      drift.push(`gone   ${siteId} — the site is no longer on the tree`);
      continue;
    }
    drift.push(...rowFieldDrift(siteId, row, fresh));
  }
  for (const [siteId, row] of derivedRows) {
    if (!committedRows.has(siteId)) {
      drift.push(`new    ${siteId} (${row.verdict}) — the census never recorded it`);
    }
  }
  if (stable(committed.totals) !== stable(derived.totals)) {
    drift.push(`totals ${stable(committed.totals)} → ${stable(derived.totals)}`);
  }
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

/** #2230: the generator owns the complete file, including rules outside the `@theme` block. A declaration
 * count cannot catch same-count edits, changed values, or a stale pointer/seed block. */
async function themeCssDrift(root: string): Promise<LedgerFreshness> {
  const expected = await deriveThemeCss(root);
  const absolute = join(root, THEME);
  const base = { ledger: `${THEME} (generated bytes)`, regen: THEME_REGEN, derived: Buffer.byteLength(expected) };
  if (!existsSync(absolute)) {
    return { ...base, drift: [MISSING(THEME_REGEN)] };
  }
  return {
    ...base,
    drift: readFileSync(absolute).equals(Buffer.from(expected)) ? [] : ["the committed file differs from a fresh derivation (byte-for-byte)"],
  };
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

/** The #1584 read-list table's SIZE column versus a fresh measurement — byte-for-byte over the whole
 *  document, because the derivation rewrites cells in place and a partial compare would let a rewritten row
 *  drift back. #2017: all EIGHT sizes were stale at once and the work queue was understated by 7x. */
export function readFirstCostsDrift(root: string): LedgerFreshness {
  const rows = readFirstCostRowDrift(root);
  return {
    ledger: `${READ_FIRST_REL} (SIZE column)`,
    regen: REGEN_READ_FIRST_COSTS,
    derived: READ_FIRST_COST_ROW_IDS.length,
    // ONE LINE PER MOVED ROW, with both cells (#2117). A bare "the SIZE cells differ" made a regeneration
    // on a backed-up copy the only way to learn which of the nine had moved, while every sibling row in
    // this stage names its drifting rows.
    drift: rows.map((row) => `row ${row.id}: ${JSON.stringify(row.committed)} → ${JSON.stringify(row.derived)}`),
  };
}

/** THE DEFERRED ROSTER HALF, held against the tree (#2008).
 *
 *  `docs/law/Core-Enforcement-Deferred-Dropped.md` lists neo gates "not yet ported, with activation trigger". It is
 *  ONE-SIDED: a row turns into a lie the moment its trigger fires and the gate lands, and nothing noticed.
 *  Measured 2026-09-12: 8 of the 28 rows name a gate that is LIVE, and FIVE of those still read as
 *  not-yet-ported — `assets-single-writer`, `suppressions`, `bus-payload-allowlist`, `dangling-refs`,
 *  `fetch-fn-in-features`. Same class as the refusal that outlived its blocker, one document over.
 *
 *  THE REVERSE DIRECTION IS NOT HELD, and naming it is the point. A row marked PROMOTED whose gate is NOT a
 *  module is not necessarily wrong: `dead-code` was promoted into the `deps:knip` STAGE under a different
 *  id, and where a promotion landed is prose in the trigger cell, not a census. A tripwire that guessed at
 *  it would fire on the one honest row and prove nothing. */
export function deferredRosterDrift(root: string): LedgerFreshness {
  // SCOPED TO THE DEFERRED TABLE, not to the file: the same document carries the PREBUILT seals and the
  // DROPPED list, whose rows have the identical shape. Counting those would inflate the denominator, and a
  // denominator nobody can check is how a census stops being a measurement.
  const lines = readDoc(root, DEFERRED_ROSTER_REL).split("\n");
  const start = lines.findIndex((line) => line.startsWith("## Deferred backlog"));
  const end = lines.findIndex((line, index) => index > start && start !== -1 && line.startsWith("#") && !line.startsWith("## Deferred backlog"));
  const rows = (start === -1 ? [] : lines.slice(start, end === -1 ? lines.length : end)).filter((line) => /^\| `[a-z0-9-]+`/.test(line));
  const drift = rows.flatMap((line) => {
    const id = /^\| `([a-z0-9-]+)`/.exec(line)?.[1];
    const landed = id !== undefined && existsSync(join(root, `${GATES_DIR}/${id}.ts`));
    return landed && !RESOLVED_TRIGGER.test(line)
      ? [
          `fired  ${DEFERRED_ROSTER_REL}: \`${id}\` reads as not-yet-ported and ${GATES_DIR}/${id}.ts is on the tree — mark the row PROMOTED with where it landed, or delete it`,
        ]
      : [];
  });
  return {
    ledger: `${DEFERRED_ROSTER_REL} (${rows.length} deferred rows; the PROMOTED-but-absent direction is prose and is NOT held)`,
    regen: "edit the deferred row: a trigger that FIRED says PROMOTED / DROPPED / SUPERSEDED and names where the rule now lives",
    derived: rows.length,
    drift,
  };
}

/** Every output is derived even when a sibling reports drift. A failed derivation throws to the CLI
 * tool-error boundary; it never supplies a freshness verdict. */
export async function ledgerFreshness(root: string): Promise<readonly LedgerFreshness[]> {
  const census = censusDrift(readCommitted<CaughtFailurePopulation>(root, POPULATION_REL), deriveCaughtFailurePopulation(root));
  const snapFlagsIndex = snapFlagsIndexDrift(root);
  const typeConfigs = typeConfigsDrift(root);
  return [
    census,
    snapFlagsIndex,
    typeConfigs,
    await themeCssDrift(root),
    readFirstCostsDrift(root),
    ledgerSectionDrift(root),
    classRollupDrift(root),
    deferredRosterDrift(root),
  ];
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
export async function runLedgersFresh(root: string): Promise<number> {
  return verdict(await ledgerFreshness(root));
}

/** The `baseline <kind> --check` arm — the SAME derivation the writer runs, diffed instead of written.
 *  One home per ledger, two doors: `baseline <kind>` writes, `baseline <kind> --check` judges. */
export const LEDGER_CHECKS: Readonly<Record<string, (root: string) => number | Promise<number>>> = {
  "caught-failure-population": (root) =>
    verdict([censusDrift(readCommitted<CaughtFailurePopulation>(root, POPULATION_REL), deriveCaughtFailurePopulation(root))]),
  "snap-flags-index": (root) => verdict([snapFlagsIndexDrift(root)]),
  "read-first-costs": (root) => verdict([readFirstCostsDrift(root)]),
  "type-configs": (root) => verdict([typeConfigsDrift(root)]),
  [THEME_BASELINE]: async (root) => verdict([await themeCssDrift(root)]),
};

// biome-ignore lint/performance/noBarrelFile: re-exports preserve the original module's public API after extracting classRollupDrift and ledgerSectionDrift to ledgers-fresh-rollup.ts
export { classRollupDrift, ledgerSectionDrift } from "./ledgers-fresh-rollup.ts";
