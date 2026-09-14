// Self-test for `pnpm debt` (tooling/src/verify/ops/debt.ts) — the DEBT WALK (#546). The walk's whole
// value is that it CANNOT quietly under-report: its declared ledger table is reconciled against every
// `*.baseline.json` on the tree, in BOTH directions, and a disagreement refuses the run instead of
// printing a short listing that reads clean. Every arm here is a planted control for that promise:
// an undeclared ledger on disk REDs, a declared row whose file is gone REDs, a non-repo root REDs, and
// the REAL tree reconciles to zero (which is what keeps the table honest as new ratchets land).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { discoverBaselineFiles } from "@orb/tooling/_shared/ratchet-rows";
import type { Ledger } from "@orb/tooling/verify";
import { LEDGERS, liveAdmitted, readLedgerRows, reconcileLedgers, runDebtWalk } from "@orb/tooling/verify";
import { describe } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";

const MALFORMED = /malformed/u;

const FAKE_LEDGER: Ledger = {
  owner: "fake-gate",
  rel: "tooling/src/verify/gates/fake-gate.baseline.json",
  unit: "finding(s)",
  why: "a fixture ledger",
};

describe("debt walk — the ledger reconciliation (both directions)", () => {
  test("REAL TREE: every declared ledger is on disk, and every `*.baseline.json` on disk is declared", ({ repoRoot }) => {
    // THE PIN THAT KEEPS THE TABLE HONEST. A new ratchet baseline that nobody adds to LEDGERS would
    // otherwise be declared debt this walk silently omits — the exact class the walk exists to end.
    const discovered = discoverBaselineFiles(repoRoot);
    expect(discovered.length).toBeGreaterThan(0);
    expect(reconcileLedgers(LEDGERS, discovered)).toEqual([]);
    // …and the discovery is real: each declared ledger's path is one of the files the walk found.
    for (const ledger of LEDGERS) {
      expect(discovered).toContain(ledger.rel);
    }
  });

  test("PLANTED CONTROL — an UNDECLARED ledger on disk refuses the run and names the file", () => {
    const problems = reconcileLedgers(LEDGERS, [...LEDGERS.map((l) => l.rel), FAKE_LEDGER.rel]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("UNKNOWN LEDGER");
    expect(problems[0]).toContain(FAKE_LEDGER.rel);
  });

  test("PLANTED CONTROL — a declared row whose file is GONE refuses the run (§4.4a mode B)", () => {
    const problems = reconcileLedgers(
      [...LEDGERS, FAKE_LEDGER],
      LEDGERS.map((l) => l.rel),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("DEAD LEDGER ROW");
    expect(problems[0]).toContain("fake-gate");
  });

  test("a root with no tooling/src is BLINDNESS, not an empty listing — the walk exits toolError", ({ scratch }) => {
    expect(discoverBaselineFiles(scratch)).toEqual([]);
    expect(runDebtWalk(scratch, [])).toBe(EXIT.toolError);
  });
});

describe("debt walk — row extraction", () => {
  test("a budget-map ledger yields its rows biggest-budget-first (the triage order)", async ({ plantedTree }) => {
    const root = await plantedTree({
      [FAKE_LEDGER.rel]: '{\n  "a/small.ts": 1,\n  "b/big.ts": 9,\n  "c/mid.ts": 4\n}\n',
    });
    expect(readLedgerRows(root, FAKE_LEDGER).map((r) => [r.subject, r.count])).toEqual([
      ["b/big.ts", 9],
      ["c/mid.ts", 4],
      ["a/small.ts", 1],
    ]);
  });

  test("an entries-map ledger yields its rows WITH the per-row reason the ledger carries", async ({ plantedTree }) => {
    // The shape is SNIFFED by the shared reader (#569) — a consumer that had to be told the shape is a
    // consumer that reads a new ledger as zero rows. An entries-map row is one membership, class DEBT.
    const root = await plantedTree({
      [FAKE_LEDGER.rel]: '{\n  "note": "the envelope",\n  "entries": { "f.ts::X": "undecided by the sweep" }\n}\n',
    });
    expect(readLedgerRows(root, FAKE_LEDGER)).toEqual([{ subject: "f.ts::X", count: 1, ratified: 0, debt: 1, why: "undecided by the sweep", cite: [] }]);
  });

  test("a CLASSIFIED ledger yields the DEBT/RATIFIED partition, and the halves sum to the budget (#569)", async ({ plantedTree }) => {
    const root = await plantedTree({
      [FAKE_LEDGER.rel]:
        '{\n  "a/plain.ts": 2,\n  "b/ruled.ts": { "count": 3, "ratified": 3, "why": "ruled in #568", "cite": ["package.json"] },\n  "c/mixed.ts": { "count": 4, "ratified": 1, "why": "one is ruled", "cite": ["package.json"] }\n}\n',
    });
    const rows = readLedgerRows(root, FAKE_LEDGER);
    expect(rows.map((r) => [r.subject, r.debt, r.ratified])).toEqual([
      ["c/mixed.ts", 3, 1],
      ["b/ruled.ts", 0, 3],
      ["a/plain.ts", 2, 0],
    ]);
    for (const row of rows) {
      expect(row.debt + row.ratified).toBe(row.count);
    }
  });

  test("the RETIRED density ledger is gone from the walk — a `--gate` filter naming it is MISUSE, not an empty listing", async ({ runCli }) => {
    // RETARGETED TWICE IN ONE DAY, AND THE SECOND TARGET DIED UNDER IT. This row used to assert the LISTING's
    // ratified section against `duplicate-action-doors`; on 2026-09-13 that ledger was deleted by its
    // authority migration (#1584) and the row was re-pointed at `density-tier` as "the remaining fully-ratified
    // ledger" — by a lane that could not see its sibling deleting THAT ledger the same evening (#1939). Both
    // conversions landed, so the assertion failed at the merge with `EXIT.misuse` where it expected `EXIT.clean`.
    //
    // GUARANTEE RETIRED WITH ITS LAST CARRIER, stated rather than quietly dropped: NO live ledger carries a
    // ratified row any more (`ct-unfed-reads` holds zero rows, `orphan-export-ratchet`'s `entries` is `{}`),
    // so the CLI's *rendering* of a RATIFIED section has no real subject to exercise and this row cannot be
    // re-pointed a third time. The PARTITION LOGIC it was really about is still pinned, synthetically and
    // durably, by "a CLASSIFIED ledger yields the DEBT/RATIFIED partition, and the halves sum to the budget
    // (#569)" above, which plants its own ledger and depends on no gate. What is uncovered is only the
    // section rendering, and it is uncovered because the debt it rendered is gone.
    //
    // What this row proves now is the two-sided retirement, same as the `duplicate-action-doors` arm below:
    // the declaration is gone, so a filter naming it finds nothing and SAYS SO rather than printing a clean,
    // empty, reassuring section.
    const result = await runCli("verify", ["debt", "--gate", "density-tier"]);
    expect(result.code).toBe(EXIT.misuse);
  });

  test("the RETIRED doors ledger is gone from the walk — a `--gate` filter naming it is MISUSE, not an empty listing", async ({ runCli }) => {
    // The two-sided half of the retirement: `reconcileLedgers` already reds a ledger ON DISK the table does
    // not declare, and this is the other direction — the declaration is gone, so the filter finds nothing and
    // says so instead of printing a clean, empty, reassuring section.
    const result = await runCli("verify", ["debt", "--gate", "duplicate-action-doors"]);
    expect(result.code).toBe(EXIT.misuse);
  });

  test("a MALFORMED ledger throws — an unparseable debt file must never report zero rows", async ({ plantedTree }) => {
    const root = await plantedTree({ [FAKE_LEDGER.rel]: "{ not json\n" });
    expect(() => readLedgerRows(root, FAKE_LEDGER)).toThrow(MALFORMED);
  });
});

describe("debt walk — the operator command", () => {
  test("`verify debt` lists every declared ledger and exits CLEAN (it is a lens, never a gate)", async ({ runCli }) => {
    const result = await runCli("verify", ["debt"]);
    expect(result.code).toBe(EXIT.clean);
    for (const ledger of LEDGERS) {
      expect(result.stdout).toContain(ledger.rel);
    }
    expect(result.stdout).toContain("TOTAL:");
  });

  test("a --gate filter that matches no ledger is MISUSE, not an empty listing", async ({ runCli }) => {
    const result = await runCli("verify", ["debt", "--gate", "zz-no-such-gate"]);
    expect(result.code).toBe(EXIT.misuse);
  });
});

// ── #2222: THE LIVE HALF'S REFUSAL NAMES ITS OWN REASON ───────────────────────────────────────────────
//
// THE DEFECT. `liveAdmitted` was `… | null`, and FOUR distinct causes collapsed into one bare `null`: no
// artifact, an unparseable artifact, a run that DIED (#410), and a run that finished but is a NON-VERDICT
// (#2167). The printer rendered every one of them as the same generic disjunction — "missing, malformed, or
// from a run that did not finish" — which did not even LIST the non-verdict case. An operator could not
// tell "run `pnpm check:structure`" from "your last run was the gate self-test's own child, and its
// admitted counts are about planted props". A refusal nobody can act on is the same disease as a zero
// nobody can trust, which is the whole reason this walk refuses instead of printing zeros.
//
// The green arm is the negative control: a COMPLETE verdict is consumed and carries its run id, so a build
// that refused everything would pass every red arm below and fail this one.

/** One `reports/check-structure.json` at the published path, carrying exactly the manifest under test. */
function plantStructureReport(root: string, run: Record<string, unknown> | undefined, gates: readonly Record<string, unknown>[] = []): void {
  mkdirSync(join(root, "reports"), { recursive: true });
  writeFileSync(join(root, "reports", "check-structure.json"), JSON.stringify(run === undefined ? { gates } : { run, gates }));
}

const COMPLETE_RUN = { runId: "planted-1", complete: true, verdict: "verdict", nonVerdictReason: null, incompleteReasons: [] };

describe("#2222 — the live admission refuses with the reason, never a generic disjunction", () => {
  test("GREEN — a COMPLETE verdict is consumed, and its per-gate admissions come back with the run id", async ({ plantedTree }) => {
    const root = await plantedTree({});
    plantStructureReport(root, COMPLETE_RUN, [{ name: "suppressions", scan: { admitted: 7 } }]);

    const live = liveAdmitted(root);
    expect(live.ok).toBe(true);
    expect(live.ok && live.runId).toBe("planted-1");
    expect(live.ok && live.byOwner.get("suppressions")).toBe(7);
  });

  test("NO ARTIFACT — the reason names the path and the command that makes one", async ({ plantedTree }) => {
    const root = await plantedTree({});
    const live = liveAdmitted(root);
    expect(live.ok).toBe(false);
    expect(live.ok ? "" : live.why).toContain("reports/check-structure.json");
    expect(live.ok ? "" : live.why).toContain("pnpm check:structure");
  });

  test("UNPARSEABLE — the reason says so and carries the parser's own message", async ({ plantedTree }) => {
    const root = await plantedTree({});
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(join(root, "reports", "check-structure.json"), "{ not json");

    const live = liveAdmitted(root);
    expect(live.ok).toBe(false);
    expect(live.ok ? "" : live.why).toContain("UNPARSEABLE");
  });

  test("THE RUN DIED — the reason is the #410 in-flight stub, naming the run", async ({ plantedTree }) => {
    const root = await plantedTree({});
    plantStructureReport(root, { ...COMPLETE_RUN, complete: false });

    const live = liveAdmitted(root);
    expect(live.ok).toBe(false);
    expect(live.ok ? "" : live.why).toContain("NEVER FINISHED");
    expect(live.ok ? "" : live.why).toContain("planted-1");
  });

  test("THE RUN DID NOT RECONCILE — the reason quotes the manifest's own incompleteReasons", async ({ plantedTree }) => {
    const root = await plantedTree({});
    plantStructureReport(root, { ...COMPLETE_RUN, incompleteReasons: ["ran 4/5 active gate(s)"] });

    const live = liveAdmitted(root);
    expect(live.ok).toBe(false);
    expect(live.ok ? "" : live.why).toContain("did NOT RECONCILE");
    expect(live.ok ? "" : live.why).toContain("ran 4/5 active gate(s)");
  });

  test("A NON-VERDICT — the case the old message did not even list — quotes the run's own words", async ({ plantedTree }) => {
    const root = await plantedTree({});
    plantStructureReport(root, { ...COMPLETE_RUN, verdict: "non-verdict", nonVerdictReason: "FIXTURE MODE (ORB_GATE_FIXTURES=1)" });

    const live = liveAdmitted(root);
    expect(live.ok).toBe(false);
    expect(live.ok ? "" : live.why).toContain("NON-VERDICT");
    expect(live.ok ? "" : live.why).toContain("FIXTURE MODE (ORB_GATE_FIXTURES=1)");
  });

  test("A PRE-#410 ARTIFACT carries no manifest at all — readable, just older, and it says which", async ({ plantedTree }) => {
    const root = await plantedTree({});
    plantStructureReport(root, undefined, [{ name: "suppressions", scan: { admitted: 3 } }]);

    const live = liveAdmitted(root);
    expect(live.ok).toBe(true);
    expect(live.ok && live.runId).toBe("(pre-#410 artifact)");
  });
});
