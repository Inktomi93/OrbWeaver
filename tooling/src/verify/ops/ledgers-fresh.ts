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
// THE SUBJECT WIDENED 2026-09-12 (#2008) AND THE STAGE'S NAME NOW UNDERSELLS IT. The deferred gate roster
// row is not a single-writer ledger at all: it is a HAND-AUTHORED CLAIM that nothing held two-sided (five
// rows read "not yet ported" while their gate shipped), which is the same failure shape one substrate over —
// a claim written against a tree, and then the tree moved. It has no writer: the fix is an authored edit.
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
import { ACTIVE_GATES_INDEX_REL, deriveActiveGatesIndex } from "./gen/active-gates-index.ts";
import { deriveCaughtFailurePopulation, POPULATION_REL } from "./gen/caught-failure-population.ts";
import { deriveSnapFlagsIndexMarkdown, SNAP_FLAGS_INDEX_REL } from "./gen/snap-flags-index.ts";
import { deriveThemeCss, THEME_BASELINE, THEME_REGEN } from "./gen/theme-css.ts";
import { deriveTypeConfigFiles } from "./gen/type-configs.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:ledgers-fresh");

const REGEN_ACTIVE_GATES_INDEX = "pnpm exec node tooling/src/verify/cli.ts baseline active-gates-index";
const REGEN_CENSUS = "pnpm exec node tooling/src/verify/cli.ts baseline caught-failure-population";
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

/** The generated law doc vs a fresh derivation off the SAME loaded gate roster `check:structure` runs
 *  (work item 0045) — byte-for-byte, like the snap flag index: the whole file is generated, never a block
 *  inside a hand-edited doc. */
async function activeGatesIndexDrift(root: string): Promise<LedgerFreshness> {
  const abs = join(root, ACTIVE_GATES_INDEX_REL);
  const derivedText = await deriveActiveGatesIndex(root);
  const derivedRows = derivedText.split("\n").filter((line) => line.startsWith("| `")).length;
  const base = { ledger: ACTIVE_GATES_INDEX_REL, regen: REGEN_ACTIVE_GATES_INDEX, derived: derivedRows } as const;
  if (!existsSync(abs)) {
    return { ...base, drift: [MISSING(REGEN_ACTIVE_GATES_INDEX)] };
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

/** Every output is derived even when a sibling reports drift. A failed derivation throws to the CLI
 * tool-error boundary; it never supplies a freshness verdict. */
export async function ledgerFreshness(root: string): Promise<readonly LedgerFreshness[]> {
  const census = censusDrift(readCommitted<CaughtFailurePopulation>(root, POPULATION_REL), deriveCaughtFailurePopulation(root));
  const snapFlagsIndex = snapFlagsIndexDrift(root);
  const typeConfigs = typeConfigsDrift(root);
  return [census, snapFlagsIndex, typeConfigs, await themeCssDrift(root), await activeGatesIndexDrift(root)];
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
  "active-gates-index": async (root) => verdict([await activeGatesIndexDrift(root)]),
  "caught-failure-population": (root) =>
    verdict([censusDrift(readCommitted<CaughtFailurePopulation>(root, POPULATION_REL), deriveCaughtFailurePopulation(root))]),
  "snap-flags-index": (root) => verdict([snapFlagsIndexDrift(root)]),
  "type-configs": (root) => verdict([typeConfigsDrift(root)]),
  [THEME_BASELINE]: async (root) => verdict([await themeCssDrift(root)]),
};
