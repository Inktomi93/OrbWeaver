// The PERMANENT PIN for `caught-failure-ownership` (issue #751) and for the durable census it produces
// (docs/reviews/caught-failure-ownership/population.json). Conformance proves the MATCHER against synthetic
// mini-projects; this proves the three things conformance structurally cannot:
//
//   1. BIJECTION, as a MULTISET. The census must equal a fresh derivation row-for-row, and the gate's live
//      findings must equal exactly the census rows verdicted `unproven` — compared by the FULL identity
//      (path, line, grammar, position, ordinal, reason), never by a lossy `Set` of `(path,line,grammar)`
//      keys. That reduction was the WIP's defect: duplicate same-line positions collapsed into one, so a
//      census could "agree" with a population it had silently deduplicated.
//   2. MARKER HYGIENE ON THE REAL TREE. `caught-failure-ownership` green on its own proves nothing about its
//      574 WAIVERS: malformed / unknown / stale / dead-position / over-broad / duplicate markers are the
//      CENTRAL ordinary-waiver engine's verdict, delivered as `authority.authorityAlarms`, and they are
//      asserted empty for this policy. (Before the #1584 conversion this was `gate-ignore-inventory`'s
//      verdict over the whole legacy corpus; the central engine reaches it for one policy in one pass, so
//      the run no longer has to load 270 modules to see it.)
//   3. THE CENSUS IS DERIVED, NOT DECLARED. Every field is recomputed; a hand-edited verdict, count, or
//      reason reds. There is no budget here and nothing suppresses on it — it is evidence, not a ledger.
//
// While the program's classification is in flight the `unproven` count is NON-ZERO by design; what is pinned
// is that it equals the gate's live population exactly. The final program commit adds the zero assertion.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import { CAUGHT_FAILURE_ARMS } from "../../../../tooling/src/verify/contract/caught-failure.ts";
import { gate as caughtFailureOwnership } from "../../../../tooling/src/verify/gates/caught-failure-ownership.ts";
import type { CaughtFailurePopulation, CaughtFailureRow, CaughtFailureVerdict } from "../../../../tooling/src/verify/index.ts";
import { CAUGHT_FAILURE_VERDICTS, deriveCaughtFailurePopulation, POPULATION_REL, projectCtx, runPolicyPass } from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const GATE = "caught-failure-ownership";
/** The census is worthless if the detector stopped reading the tree — a real run admits thousands of files,
 *  a broken POPULATION admits a handful. Restated rather than imported: this is the SECOND opinion. */
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

    // Seeded from the homed tuple, so a THIRD verdict cannot be recomputed into existence by this test
    // while the census still counts two. (`detached-owned` and the `enforced` total that carried it were
    // retired with the #1584 conversion: the `@swallowed-ok` acceptance arm is gone, and a framework-owned
    // site is no longer a row at all — which is what every other OWNED site already was.)
    const byVerdict = Object.fromEntries(CAUGHT_FAILURE_VERDICTS.map((v) => [v, 0])) as Record<CaughtFailureVerdict, number>;
    // The SAME closure on the grammar axis, which until #1584 had none: an arm the classifier invents, or one
    // it silently stops producing, has to move a row here rather than sail through as a free string key.
    const byGrammar = Object.fromEntries(CAUGHT_FAILURE_ARMS.map((arm) => [arm, 0])) as Record<string, number>;
    for (const row of census.rows) {
      expect(CAUGHT_FAILURE_ARMS, `${row.siteId} names an arm outside the homed tuple`).toContain(row.grammar);
      byVerdict[row.verdict] += 1;
      byGrammar[row.grammar] = (byGrammar[row.grammar] ?? 0) + 1;
    }
    expect(census.totals.byVerdict).toEqual(byVerdict);
    expect(census.totals.byGrammar).toEqual(byGrammar);
    expect(census.totals.sites).toBe(census.rows.length);
    expect(census.totals.reported).toBe(byVerdict.unproven);

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

  test("the live policy population is exactly the census's unproven rows, and no waiver is stale or over-broad", ({ repoRoot }) => {
    const census = readCensus(repoRoot);
    const context = projectCtx(repoRoot);
    const result = runPolicyPass({
      knownPolicies: [caughtFailureOwnership],
      policies: [caughtFailureOwnership],
      root: repoRoot,
      project: context.project,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors, "a tool error means the run is not a verdict").toEqual([]);
    expect(result.factErrors).toEqual([]);

    const owner = result.policies.find((policy) => policy.id === GATE);
    expect(owner, `${GATE} must be loaded`).toBeDefined();
    expect(owner?.owner.status, "an incomplete owner withholds reconciliation, so its zero proves nothing").toBe("success");
    expect(owner?.population.effectiveSourcePaths.length ?? 0).toBeGreaterThan(MIN_SCANNED_FILES);

    const live = result.authority.effectiveFindings.map((finding) => `${finding.file}|${finding.line}|${finding.token ?? ""}`).sort();
    const unproven = census.rows
      .filter((row) => row.verdict === "unproven")
      .map((row) => `${row.path}|${row.line}|${row.position}`)
      .sort();
    expect(live).toEqual(unproven);

    // Every `deliberate-absorb` row is a waiver the engine actually CONSUMED — the census cannot claim a
    // suppression the production reconciler did not grant.
    expect(result.authority.waivedFindings.length).toBe(census.rows.filter((row) => row.verdict === "deliberate-absorb").length);

    // The hygiene half. A stale, dead-position, over-broad or duplicate marker is an ALARM here, and an
    // alarm is exactly the shape a bulk marker translation fails in.
    expect(result.authority.authorityAlarms.filter((alarm) => alarm.policyId === GATE)).toEqual([]);
    expect(result.waiverCarrierRefusals, "a refused carrier is a skipped population, not a clean one").toEqual([]);
  }, 600_000);
});
