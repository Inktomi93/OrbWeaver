// Self-test for `pnpm debt` (tooling/src/verify/ops/debt.ts) — the DEBT WALK (#546). The walk's whole
// value is that it CANNOT quietly under-report: its declared ledger table is reconciled against every
// `*.baseline.json` on the tree, in BOTH directions, and a disagreement refuses the run instead of
// printing a short listing that reads clean. Every arm here is a planted control for that promise:
// an undeclared ledger on disk REDs, a declared row whose file is gone REDs, a non-repo root REDs, and
// the REAL tree reconciles to zero (which is what keeps the table honest as new ratchets land).
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { discoverBaselineFiles } from "@orb/tooling/_shared/ratchet-rows";
import type { Ledger } from "@orb/tooling/verify";
import { LEDGERS, readLedgerRows, reconcileLedgers, runDebtWalk } from "@orb/tooling/verify";
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

  test("the LISTING separates burnable debt from ruled-permanent rows, and never prints a ratified row as backlog", async ({ runCli }) => {
    const result = await runCli("verify", ["debt", "--gate", "duplicate-action-doors"]);
    expect(result.code).toBe(EXIT.clean);
    // The six door pairs are ratified (#568), so the burnable list is EMPTY and the ruled list carries them.
    expect(result.stdout).toContain("BURNABLE DEBT — 0 row(s)");
    expect(result.stdout).toContain("RATIFIED — 6 row(s)");
    expect(result.stdout).toContain("(0 debt · 12 ratified)");
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
