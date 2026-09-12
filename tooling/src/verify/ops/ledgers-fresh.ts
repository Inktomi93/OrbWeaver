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
import type { ClassRollupRow } from "../lib/gate-program-docs.ts";
import {
  committedClassRollup,
  deriveClassRollup,
  ledgerSections,
  readDoc,
  reportLedgerRows,
  STATE_BINS,
  strayLedgerSections,
} from "../lib/gate-program-docs.ts";
import { deriveCaughtFailurePopulation, POPULATION_REL } from "./gen/caught-failure-population.ts";
import { READ_FIRST_COST_ROW_IDS, READ_FIRST_REL, readFirstCostRowDrift } from "./gen/read-first-costs.ts";
import { deriveSnapFlagsIndexMarkdown, SNAP_FLAGS_INDEX_REL } from "./gen/snap-flags-index.ts";
import { deriveTestBaselineManifest } from "./gen/test-baseline-manifest.ts";
import { deriveTypeConfigFiles } from "./gen/type-configs.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:ledgers-fresh");

const REGEN_CENSUS = "pnpm exec node tooling/src/verify/cli.ts baseline caught-failure-population";
const REGEN_MANIFEST = "pnpm exec node tooling/src/verify/cli.ts baseline test-baseline-manifest";
const REGEN_SNAP_FLAGS_INDEX = "pnpm exec node tooling/src/verify/cli.ts baseline snap-flags-index";
const REGEN_TYPE_CONFIGS = "pnpm exec node tooling/src/verify/cli.ts baseline type-configs";
const REGEN_READ_FIRST_COSTS = "pnpm exec node tooling/src/verify/cli.ts baseline read-first-costs";

const GATE_REVIEWS_DIR = "docs/reviews/gate-runtime";
const GATES_DIR = "tooling/src/verify/gates";
const DEFERRED_ROSTER_REL = "docs/architecture/core/Core-Enforcement-Deferred-Dropped.md";
/** A trigger cell that has ALREADY been adjudicated. Caps are the document's own convention for a resolved
 *  row, and the words are its own vocabulary — not a grammar invented here. */
const RESOLVED_TRIGGER = /\b(PROMOTED|DROPPED|SUPERSEDED|UPGRADED|RETIRED)\b/;
const REFUTATION_LEDGER_REL = `${GATE_REVIEWS_DIR}/refutation-ledger-2026-09-12.md`;

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

/** THE REFUTATION LEDGER'S APPENDED SECTIONS versus the verifier reports they came from (#2017).
 *
 *  A verifier report declares its rows in its own `## LEDGER ROWS (N rows)` table and an agent appends that
 *  table into the ledger under a `###` section whose heading CITES the report. Nothing reconciled the two,
 *  so a row dropped in the transcription was silent — and the ledger is the program's work queue.
 *
 *  IT IS NOT A REGENERABLE LEDGER, deliberately, and that is why it has no `baseline` kind. Both sides are
 *  authored: the fix for a mismatch is to append the missing row (or correct the report), never to
 *  overwrite one text from the other — a generator here would let a transcription error rewrite the
 *  evidence it got wrong. `regen` therefore names the ACTION rather than a command, which is a stated
 *  deviation from this stage's other four rows.
 *
 *  THE UNRECONCILED COUNT IS REPORTED, never swallowed. Most ledger sections cite an AUDIT report that
 *  declares no rows of its own (the ten waves are distilled INTO the ledger by their reader), so a bare
 *  "fresh" over the handful that do reconcile would be the same clean-zero this row exists to end. */
export function ledgerSectionDrift(root: string): LedgerFreshness {
  const text = readDoc(root, REFUTATION_LEDGER_REL);
  const sections = ledgerSections(text);
  const drift: string[] = [];
  let reconciled = 0;
  // THE FENCE REPORTS WHAT IT EXCLUDES (#2166). Six real defect rows were appended below `## CLASS ROLLUP`
  // and every instrument that reads this file while sitting inside it was correct-and-blind: the reconciler
  // printed the SAME "11 of 24" before and after. A fence that cannot say what it stopped short of is the
  // false clean this whole row is about, so a ledger-shaped section outside it is now a finding.
  for (const stray of strayLedgerSections(text)) {
    drift.push(
      `stray  ${REFUTATION_LEDGER_REL}:${stray.line} \`### ${stray.heading}\` carries ${stray.rows} ledger row(s) but sits under \`${stray.enclosing}\`, OUTSIDE the \`## THE LEDGER\` fence — no reconciler, no rollup and no row count can see it. Move the section above \`## CLASS ROLLUP\`.`,
    );
  }
  for (const section of sections) {
    const report = section.report;
    if (report === undefined) {
      continue;
    }
    const reportRel = `${GATE_REVIEWS_DIR}/${report}`;
    // Membership is asked, never caught: an absent report is a VERDICT about the ledger (a section citing
    // evidence that is not on the tree), and swallowing the read error would file it as an unreadable
    // report instead — the one distinction this row exists to keep.
    if (!existsSync(join(root, reportRel))) {
      drift.push(`missing ${REFUTATION_LEDGER_REL}:${section.line} cites ${report}, which is not in ${GATE_REVIEWS_DIR}/`);
      continue;
    }
    const table = reportLedgerRows(readDoc(root, reportRel));
    if (table === undefined) {
      continue;
    }
    reconciled += 1;
    if (table.rows !== section.rows) {
      drift.push(
        `rows   ${REFUTATION_LEDGER_REL}:${section.line} carries ${section.rows} row(s); ${report}'s own LEDGER ROWS table declares ${table.rows} — append the missing row(s), or correct the report`,
      );
    }
    if (table.declared !== undefined && table.declared !== table.rows) {
      drift.push(`self   ${report}'s heading says (${table.declared} rows) and its table carries ${table.rows}`);
    }
  }
  return {
    ledger: `${REFUTATION_LEDGER_REL} sections vs their reports (${reconciled} of ${sections.length} IN-FENCE sections reconcilable; the rest cite an audit report that declares no rows)`,
    regen: "append the missing row(s) to the ledger section, or correct the source report — BOTH sides are authored and neither is generated",
    derived: reconciled,
    drift,
  };
}

/** THE DEFERRED ROSTER HALF, held against the tree (#2008).
 *
 *  `Core-Enforcement-Deferred-Dropped.md` lists neo gates "not yet ported, with activation trigger". It is
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

/** Every single-writer output's freshness, cheap half first. The derivations run unconditionally — a stage that
 *  short-circuited on the first drift would hide the others from the same barrier run. */
export function ledgerFreshness(root: string): readonly LedgerFreshness[] {
  const manifest = manifestDrift(readCommitted<TestBaselineManifest>(root, TEST_BASELINE_REL), deriveTestBaselineManifest(root));
  const census = censusDrift(readCommitted<CaughtFailurePopulation>(root, POPULATION_REL), deriveCaughtFailurePopulation(root));
  const snapFlagsIndex = snapFlagsIndexDrift(root);
  const typeConfigs = typeConfigsDrift(root);
  return [
    manifest,
    census,
    snapFlagsIndex,
    typeConfigs,
    readFirstCostsDrift(root),
    ledgerSectionDrift(root),
    classRollupDrift(root),
    deferredRosterDrift(root),
  ];
}

const REGEN_CLASS_ROLLUP = "rebuild the `## CLASS ROLLUP` table from the body by the method printed under that heading";

/** THE CLASS ROLLUP versus the body it claims to summarise (#2207).
 *
 *  A DERIVED TABLE THAT NOTHING RE-DERIVED. The rollup summarises every ledger row above it, and the
 *  reconciler one row up reports the file FRESH — correctly: `ledgerSectionDrift` checks each SECTION
 *  against the REPORT it cites, and the rollup cites no report. So the two staleness events were both
 *  caught by a human reading the table: `91 rows · 33/7/3/48` against a body of 99, then `100 rows`
 *  against a body of 303 — a 203-row error that survived every `pnpm check` for a day. Twice is the
 *  argument for an arm rather than for more care.
 *
 *  IT IS NOT REGENERABLE FROM HERE, exactly like `ledgerSectionDrift`: both sides are authored, the table
 *  is rebuilt once at the barrier on a quiet tree by the account holding main's checkout, and a generator
 *  in this stage would let a lane's half-appended section rewrite the summary mid-flight. `regen` names
 *  the ACTION, which is this stage's stated deviation for authored-both-sides ledgers.
 *
 *  PER-TABLE COUNTS AND THE UNBINNED COUNT ARE PRINTED ON EVERY RUN, fresh or stale, because the ledger's
 *  own counting paragraph requires it in those words: "the three defects above were all invisible to a run
 *  that printed only the totals". A totals-only reader is how the method silently stopped covering the
 *  file — it kept summing, over a shrinking set. */
/** ONE LINE PER DIFFERING CELL, both values — the shape `readFirstCostsDrift` uses and for the same
 *  reason: a bare "the rollup differs" makes regenerating on a copy the only way to learn WHICH cell moved.
 *  A bin the committed table has no column for is SKIPPED here and reported once as a schema defect. */
function rowDrift(own: ClassRollupRow | undefined, derived: ClassRollupRow, missingBins: readonly string[]): readonly string[] {
  if (own === undefined) {
    return [`row ${derived.klass}: the rollup has no such row; the body holds ${String(derived.rows)}`];
  }
  const drift = own.rows === derived.rows ? [] : [`cell ${derived.klass}.rows: ${String(own.rows)} → ${String(derived.rows)}`];
  for (const state of STATE_BINS) {
    const before = own.states[state] ?? 0;
    const after = derived.states[state] ?? 0;
    if (!missingBins.includes(state) && before !== after) {
      drift.push(`cell ${derived.klass}.${state}: ${String(before)} → ${String(after)}`);
    }
  }
  return drift;
}

export function classRollupDrift(root: string): LedgerFreshness {
  const text = readDoc(root, REFUTATION_LEDGER_REL);
  const derived = deriveClassRollup(text);
  const committed = committedClassRollup(text);
  const label =
    `${REFUTATION_LEDGER_REL} (CLASS ROLLUP: ${derived.tables} tables · ${derived.total.rows} rows · ` +
    `unbinned ${derived.unbinned.length} · per-table ${derived.perTable.join(",")})`;
  const drift: string[] = [];
  // A table the binner cannot read is the blindness this arm exists for, never a silent skip.
  for (const columns of derived.statelessTables) {
    drift.push(`unreadable  an in-fence table has no \`state\` column, so its rows bin nowhere: header \`${columns.join(" | ")}\``);
  }
  for (const cell of derived.unbinned) {
    drift.push(`unbinned  a state cell bins to none of ${STATE_BINS.join("/")}: ${JSON.stringify(cell)}`);
  }
  if (committed === undefined) {
    drift.push("missing  no `class`-headed rollup table under `## CLASS ROLLUP` — the summary this ledger documents is absent");
    return { ledger: label, regen: REGEN_CLASS_ROLLUP, derived: derived.total.rows, drift };
  }
  // A SHORT SCHEMA IS ITS OWN DEFECT, reported before any cell comparison: a bin with no column cannot
  // disagree with the body, it simply cannot see it, and calling that a cell mismatch would send the
  // reader to fix numbers that are not wrong.
  for (const bin of committed.missingBins) {
    drift.push(`schema  the rollup has no \`${bin}\` column, so every ${bin} row in the body is invisible to it rather than miscounted`);
  }
  const byClass = new Map(committed.rows.map((row) => [row.klass, row]));
  for (const row of [...derived.rows, derived.total]) {
    drift.push(...rowDrift(byClass.get(row.klass), row, committed.missingBins));
  }
  for (const own of committed.rows) {
    if (!(own.klass === "TOTAL" || derived.rows.some((row) => row.klass === own.klass))) {
      drift.push(`row ${own.klass}: the rollup carries a class the body no longer names`);
    }
  }
  return { ledger: label, regen: REGEN_CLASS_ROLLUP, derived: derived.total.rows, drift };
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
  "read-first-costs": (root) => verdict([readFirstCostsDrift(root)]),
  "type-configs": (root) => verdict([typeConfigsDrift(root)]),
};
