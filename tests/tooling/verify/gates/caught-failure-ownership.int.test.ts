// The PERMANENT PIN for `caught-failure-ownership` (issue #751) and for the durable census it produces
// (docs/reviews/caught-failure-ownership/population.json). Conformance proves the MATCHER against synthetic
// mini-projects; this proves the three things conformance structurally cannot:
//
//   1. BIJECTION, as a MULTISET. The census must equal a fresh derivation row-for-row, and the gate's live
//      findings must equal exactly the census rows verdicted `unproven` — compared by the FULL identity
//      (path, line, grammar, position, ordinal, reason), never by a lossy `Set` of `(path,line,grammar)`
//      keys. That reduction was the WIP's defect: duplicate same-line positions collapsed into one, so a
//      census could "agree" with a population it had silently deduplicated.
//   2. THE SHARED INVENTORY PARTICIPATES. `caught-failure-ownership` green on its own proves nothing about
//      its EXEMPTIONS: malformed / stale / over-exempting markers are `gate-ignore-inventory`'s verdict, and
//      that gate can only reach a verdict when the marker was offered to a sibling in the SAME pass. So the
//      run here is the whole loaded corpus, and the inventory's own findings are asserted empty.
//   3. THE CENSUS IS DERIVED, NOT DECLARED. Every field is recomputed; a hand-edited verdict, count, or
//      reason reds. There is no budget here and nothing suppresses on it — it is evidence, not a ledger.
//
// While the program's classification is in flight the `unproven` count is NON-ZERO by design; what is pinned
// is that it equals the gate's live population exactly. The final program commit adds the zero assertion.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import type { CaughtFailurePopulation, CaughtFailureRow, CaughtFailureVerdict } from "../../../../tooling/src/verify/index.ts";
import {
  CAUGHT_FAILURE_VERDICTS,
  deriveCaughtFailurePopulation,
  loadGates,
  POPULATION_REL,
  projectCtx,
  runPass,
} from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const GATE = "caught-failure-ownership";
const INVENTORY = "gate-ignore-inventory";
/** The census is worthless if the detector stopped reading the tree — a real run scans thousands of files,
 *  a broken `scanRoot` scans a handful. Restated rather than imported: this is the SECOND opinion. */
const MIN_SCANNED_FILES = 2000;

function readCensus(repoRoot: string): CaughtFailurePopulation {
  return JSON.parse(readFileSync(join(repoRoot, POPULATION_REL), "utf8")) as CaughtFailurePopulation;
}

/** The FULL row identity — every field a classification decision rests on. A comparison that drops any of
 *  these can call two different sites the same row. */
function identity(row: CaughtFailureRow): string {
  return [row.siteId, row.path, row.line, row.column, row.grammar, row.position, row.ordinal, row.verdict, row.reason ?? "", row.markerLine ?? -1].join("|");
}

describe("caught-failure-ownership — census bijection and exemption hygiene", () => {
  test("the committed census equals a fresh derivation, row for row", ({ repoRoot }) => {
    const committed = readCensus(repoRoot);
    const derived = deriveCaughtFailurePopulation(repoRoot);

    expect(committed.gate).toBe(GATE);
    // Both directions: a row the census invented AND a row it dropped are the same lie.
    expect(committed.rows.map(identity).sort()).toEqual(derived.rows.map(identity).sort());
    expect(committed.totals).toEqual(derived.totals);
  }, 240_000);

  test("every site identity is unique, and the totals are recomputable from the rows", ({ repoRoot }) => {
    const census = readCensus(repoRoot);
    // Uniqueness is what makes a MULTISET comparison safe to write as a sorted array compare, and it is the
    // property the WIP's `(path,line,grammar)` Set lacked.
    expect(new Set(census.rows.map((row) => row.siteId)).size).toBe(census.rows.length);

    // Seeded from the homed tuple, so a fourth verdict cannot be recomputed into existence by this test
    // while the census still counts three.
    const byVerdict = Object.fromEntries(CAUGHT_FAILURE_VERDICTS.map((v) => [v, 0])) as Record<CaughtFailureVerdict, number>;
    const byGrammar: Record<string, number> = {};
    for (const row of census.rows) {
      byVerdict[row.verdict] += 1;
      byGrammar[row.grammar] = (byGrammar[row.grammar] ?? 0) + 1;
    }
    expect(census.totals.byVerdict).toEqual(byVerdict);
    expect(census.totals.byGrammar).toEqual(byGrammar);
    expect(census.totals.sites).toBe(census.rows.length);
    expect(census.totals.reported).toBe(byVerdict.unproven);
    expect(census.totals.enforced).toBe(census.rows.length - byVerdict["detached-owned"]);

    // A `deliberate-absorb` is a PROMISE: it owes the exact adjacent reason it was granted for. A row with an
    // empty reason is a bare marker wearing a classification.
    for (const row of census.rows.filter((r) => r.verdict === "deliberate-absorb")) {
      expect(row.markerLine, `${row.siteId} must cite its marker line`).not.toBeNull();
      expect((row.reason ?? "").trim().length, `${row.siteId} must carry its full reason`).toBeGreaterThan(0);
    }
    for (const row of census.rows.filter((r) => r.verdict === "unproven")) {
      expect(row.markerLine, `${row.siteId} is unproven, so no marker may be recorded for it`).toBeNull();
    }
  }, 240_000);

  test("the live gate population is exactly the census's unproven rows, and no marker is malformed or stale", async ({ repoRoot }) => {
    const census = readCensus(repoRoot);
    // THE WHOLE CORPUS, not this gate alone: `gate-ignore-inventory` reaches a verdict only on markers a
    // sibling gate was actually offered in the same pass (its OVER-EXEMPT and STALE arms are unobservable
    // otherwise), so a caught-failure-only green would leave every exemption unaudited.
    const gates = await loadGates(repoRoot);
    const result = runPass(gates, projectCtx(repoRoot));
    expect(result.toolErrors, "a tool error means the run is not a verdict").toEqual([]);

    const caught = result.gates.find((g) => g.name === GATE);
    expect(caught, `${GATE} must be registered`).toBeDefined();
    expect(caught?.scan.scanned ?? 0).toBeGreaterThan(MIN_SCANNED_FILES);

    const live = (caught?.findings ?? []).map((f) => `${f.file}|${f.line}|${f.token ?? ""}`).sort();
    const unproven = census.rows
      .filter((row) => row.verdict === "unproven")
      .map((row) => `${row.path}|${row.line}|${row.position}`)
      .sort();
    expect(live).toEqual(unproven);

    // The exemptions this gate's population leans on are the SHARED vocabulary; their hygiene is the
    // inventory's verdict, and it must be clean for the census's `deliberate-absorb` rows to mean anything.
    const inventory = result.gates.find((g) => g.name === INVENTORY);
    expect(inventory, `${INVENTORY} must be registered`).toBeDefined();
    expect(inventory?.findings ?? []).toEqual([]);
  }, 600_000);
});
