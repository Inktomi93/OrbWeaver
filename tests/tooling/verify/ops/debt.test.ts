// Self-test for `pnpm debt` (tooling/src/verify/ops/debt.ts) — the DEBT WALK (#546). The walk's whole
// value is that it CANNOT quietly under-report: its declared ledger table is reconciled against every
// `*.baseline.json` on the tree, in BOTH directions, and a disagreement refuses the run instead of
// printing a short listing that reads clean. Every arm here is a planted control for that promise:
// an undeclared ledger on disk REDs, a declared row whose file is gone REDs, a non-repo root REDs, and
// the REAL tree reconciles to zero (which is what keeps the table honest as new ratchets land).
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { Ledger } from "@orb/tooling/verify";
import { discoverBaselineFiles, LEDGERS, readLedgerRows, reconcileLedgers, runDebtWalk } from "@orb/tooling/verify";
import { describe } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";

const MALFORMED = /malformed/u;

const FAKE_LEDGER: Ledger = {
  owner: "fake-gate",
  rel: "tooling/src/verify/gates/fake-gate.baseline.json",
  shape: "budget-map",
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
    expect(readLedgerRows(root, FAKE_LEDGER)).toEqual([
      { subject: "b/big.ts", budget: 9, note: null },
      { subject: "c/mid.ts", budget: 4, note: null },
      { subject: "a/small.ts", budget: 1, note: null },
    ]);
  });

  test("an entries-map ledger yields its rows WITH the per-row reason the ledger carries", async ({ plantedTree }) => {
    const ledger: Ledger = { ...FAKE_LEDGER, shape: "entries-map" };
    const root = await plantedTree({
      [ledger.rel]: '{\n  "note": "the envelope",\n  "entries": { "f.ts::X": "undecided by the sweep" }\n}\n',
    });
    expect(readLedgerRows(root, ledger)).toEqual([{ subject: "f.ts::X", budget: null, note: "undecided by the sweep" }]);
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
