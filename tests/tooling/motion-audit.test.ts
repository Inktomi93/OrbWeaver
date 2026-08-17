// The CLS VERDICT rule of `pnpm motion-audit` (issue #109, 2026-08-16): the budget gates on the
// NON-VIRTUALIZED total, while raw + virtualized stay printed. Found by lane ae-shell-motion — a no-probe
// home→chat journey measured ~0.26 of CLS that was purely the message list settling on mount, which
// motion-stats.ts already classifies (`virtualized: true`) and warn-suppresses but still folded into the
// gated number, making "journey under 0.1" unreachable by any app fix short of changing the virtualizer.
// This file's home is tests/tooling/ per core/Spine-Testing.md §2 (a test of a scripts/ tool); the browser
// half — that a virtualized-tagged shift really does move only raw — is tests/client/lib/motion-stats.ct.tsx.
import { clsOverBudget, clsTotals } from "../../scripts/probes/motion-audit.ts";
import { expect, test } from "../support/fixtures.ts";

/** The in-page snapshot fields the verdict reads. Typed off the probe's own parameter so the fixture can
 *  never drift from the shape `clsTotals` actually parses (a probe the reader can't read is a lying proof). */
type Snapshot = NonNullable<Parameters<typeof clsTotals>[0]>;

function snapshot(over: Pick<Snapshot, "cls" | "virtualizedCls" | "nonVirtualizedCls">): Snapshot {
  return { loafs: [], worstBlocking: 0, worstShift: 0, ...over };
}

test("a purely virtualized journey moves the RAW total and never the verdict", () => {
  // The measured shape: 0.26 of instability, all of it virtual-row reconciliation.
  const motion = snapshot({ cls: 0.26, virtualizedCls: 0.26, nonVirtualizedCls: 0 });
  expect(clsTotals(motion)).toEqual({ raw: 0.26, virtualized: 0.26, budgeted: 0 });
  expect(clsOverBudget(motion)).toBe(false);
});

test("a real app shift still fails the budget even when virtualized settling dwarfs it", () => {
  // The regression this must not become: excluding virtualized shifts must not excuse a real one.
  const motion = snapshot({ cls: 0.41, virtualizedCls: 0.26, nonVirtualizedCls: 0.15 });
  expect(clsOverBudget(motion)).toBe(true);
  expect(clsTotals(motion).raw).toBe(0.41);
});

test("the non-virtualized total is judged against the same 0.1 CWV ceiling as before", () => {
  expect(clsOverBudget(snapshot({ cls: 0.1, virtualizedCls: 0, nonVirtualizedCls: 0.1 }))).toBe(false);
  expect(clsOverBudget(snapshot({ cls: 0.11, virtualizedCls: 0, nonVirtualizedCls: 0.11 }))).toBe(true);
});

test("a page bundle predating the split (no virtualized fields) keeps the OLD verdict, never a free pass", () => {
  // `--isolated --ref <old sha>` legitimately answers from a page without the three-way split. Reading
  // that as "nothing was virtualized" reproduces the pre-#109 behaviour; reading it as 0 would be a lie.
  const legacy = snapshot({ cls: 0.26 });
  expect(clsTotals(legacy)).toEqual({ raw: 0.26, virtualized: 0, budgeted: 0.26 });
  expect(clsOverBudget(legacy)).toBe(true);
});

test("no snapshot at all (no __orb bridge) is zeros, not NaN", () => {
  expect(clsTotals(null)).toEqual({ raw: 0, virtualized: 0, budgeted: 0 });
  expect(clsOverBudget(null)).toBe(false);
});
