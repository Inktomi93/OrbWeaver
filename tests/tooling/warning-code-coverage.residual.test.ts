// RESIDUAL unit test surviving the legacy-oracle burndown (reports/tooling/LEGACY-ORACLE-BURNDOWN.md
// Phase 1). warning-code-coverage's pure reconciliation coverage (a member with no emit + no DEFERRED FLAGs,
// an emitted member PASSes, the tuple-home-excluded-from-its-own-corpus arm) moved into its descriptor's
// mustFlag/mustPass conformance examples. What did NOT port are the DEFERRED-member ratchet arms: a DEFERRED
// member with no emit PASSes, and a DEFERRED member that GAINS an emit is stale/RED. Both require an INJECTED
// channel with a non-empty `deferred` map via `createWarningCodeCoverage([channel({...}))`); the LIVE CHANNELS
// the descriptor runs both declare `deferred: {}`, and the gate-conformance runner can only drive the live
// descriptor — so those arms are un-expressible as gate examples. They are retained here, deliberately NAMED
// `.residual.test.ts` (NOT `.int.test.ts`) so the Phase-2 deletion sweep of `tests/tooling/<name>.int.test.ts`
// does not take it; the vitest `unit` lane's `tests/**/*.test.ts` glob still collects it.
import type { WarningChannel } from "../../scripts/check/gates/warning-code-coverage.ts";
import { createWarningCodeCoverage } from "../../scripts/check/gates/warning-code-coverage.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxFor } from "./_support.ts";

const HOME = "packages/server/src/infra/providers/contract/resolve.ts";
const EMIT = "packages/server/src/infra/providers/resolve-chat.ts";
const HOME_RE = /\/packages\/server\/src\/infra\/providers\/contract\/resolve\.ts$/u;
const EMIT_RE = /\/packages\/server\/src\/infra\/providers\//u;

function channel(deferred: Record<string, string>): WarningChannel {
  return { tuple: "WARNING_CODES", homeFile: HOME_RE, emitScope: EMIT_RE, deferred };
}

const TUPLE = 'export const WARNING_CODES = ["alpha", "beta"] as const;\n';

test("a DEFERRED member with no emit passes", () => {
  const gate = createWarningCodeCoverage([channel({ beta: "unbuilt — cited" })]);
  expect(gate.run(ctxFor({ [HOME]: TUPLE, [EMIT]: 'export const x = "alpha";\n' }))).toEqual([]);
});

test("stale-arm: a DEFERRED member that GAINS an emit is RED", () => {
  const gate = createWarningCodeCoverage([channel({ beta: "unbuilt — cited" })]);
  const emit = 'export const x = "alpha";\nexport const y = "beta";\n';
  const v = gate.run(ctxFor({ [HOME]: TUPLE, [EMIT]: emit }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("stale");
});
