// Self-test for the DORMANT `warning-code-coverage` gate (scripts/check/gates/warning-code-coverage.ts —
// D41/D45/D48/D51 the two warning-code channels; held out of ALL_CHECKS pending doc reconciliation).
// Drives the factory with an INJECTED channel over in-memory files, proving both ratchet arms: a member
// with no emit + no DEFERRED is RED (missing), a DEFERRED member that GAINS an emit is RED (stale), a
// member with an emit passes, and the tuple home file is excluded from its own emit corpus.
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

test("missing-arm: a member with no emit and no DEFERRED is RED", () => {
  const gate = createWarningCodeCoverage([channel({})]);
  // alpha emitted, beta not.
  const v = gate.run(ctxFor({ [HOME]: TUPLE, [EMIT]: 'export const x = "alpha";\n' }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("beta");
});

test("a member with an emit site passes", () => {
  const gate = createWarningCodeCoverage([channel({})]);
  const emit = 'export const x = "alpha";\nexport const y = "beta";\n';
  expect(gate.run(ctxFor({ [HOME]: TUPLE, [EMIT]: emit }))).toEqual([]);
});

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

test("the tuple home file is excluded from its own emit corpus (no false pass)", () => {
  const gate = createWarningCodeCoverage([channel({})]);
  // No emit file at all — the home's OWN member literals must NOT count as emit sites.
  const v = gate.run(ctxFor({ [HOME]: TUPLE }));
  expect(v).toHaveLength(2);
});
