// RESIDUAL unit test surviving the legacy-oracle burndown (reports/tooling/LEGACY-ORACLE-BURNDOWN.md
// Phase 1). no-test-fabrication's DETECTION coverage (double-cast / literal-cast FLAG, exempt-type + escape
// PASS, non-tests scope) moved into its descriptor's mustFlag/mustPass conformance examples. What did NOT
// port is the BASELINE-BUDGET RATCHET arithmetic: a file is clean UP TO its baseline count and REDs only the
// EXCESS, and a file absent from the baseline has budget 0. That behavior is driven through
// `createNoTestFabrication(baseline)` with an INJECTED baseline map — the gate-conformance runner cannot
// inject a baseline (an in-memory example project has no baseline.json on disk, so every example runs at
// budget 0), so the ratchet is un-expressible as a gate example. It is retained here, deliberately NAMED
// `.residual.test.ts` (NOT `.int.test.ts`) so the Phase-2 deletion sweep of `tests/tooling/<name>.int.test.ts`
// does not take it; the vitest `unit` lane's `tests/**/*.test.ts` glob still collects it.
import { createNoTestFabrication } from "../../scripts/check/gates/no-test-fabrication.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxFor } from "./_support.ts";

const F = "tests/server/domain/widget/thing.int.test.ts";
const LITERAL = "export const b = { n: 1 } as Widget;\n";

test("baseline ratchet: a file AT its baseline count passes", () => {
  const gate = createNoTestFabrication({ [F]: 1 });
  expect(gate.run(ctxFor({ [F]: LITERAL }))).toEqual([]);
});

test("baseline ratchet: a file EXCEEDING its baseline REDs only the excess", () => {
  const gate = createNoTestFabrication({ [F]: 1 });
  const two = `${LITERAL}export const d = { m: 2 } as Gadget;\n`;
  expect(gate.run(ctxFor({ [F]: two }))).toHaveLength(1);
});

test("a file ABSENT from the baseline has budget 0 (any fabrication is RED)", () => {
  const gate = createNoTestFabrication({ "tests/other.int.test.ts": 5 });
  expect(gate.run(ctxFor({ [F]: LITERAL }))).toHaveLength(1);
});
