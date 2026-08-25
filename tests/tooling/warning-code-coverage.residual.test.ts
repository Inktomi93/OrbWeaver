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
import type { WarningChannel } from "../../tooling/src/verify/gates/warning-code-coverage.ts";
import { createWarningCodeCoverage } from "../../tooling/src/verify/gates/warning-code-coverage.ts";
import { expect, test } from "../support/tool-fixtures.ts";
import { ctxFor } from "./_support.ts";

const HOME = "packages/server/src/infra/providers/contract/resolve.ts";
const EMIT = "packages/server/src/infra/providers/resolve-chat.ts";
const HOME_RE = /\/packages\/server\/src\/infra\/providers\/contract\/resolve\.ts$/u;
const EMIT_RE = /\/packages\/server\/src\/infra\/providers\//u;
const CHAT_HOME_RE = /\/packages\/contracts\/src\/chat\/bus\.ts$/u;
const CHAT_EMIT_RE = /\/packages\/server\/src\/domain\/chat\//u;

function channel(deferred: Record<string, string>): WarningChannel {
  return { tuple: "WARNING_CODES", homeFile: HOME_RE, emitScope: EMIT_RE, deferred };
}

const TUPLE = 'export const WARNING_CODES = ["alpha", "beta"] as const;\n';

test("a DEFERRED member with no emit passes", () => {
  const gate = createWarningCodeCoverage([channel({ beta: "unbuilt — cited" })]);
  expect(gate.run(ctxFor({ [HOME]: TUPLE, [EMIT]: 'warnings.push({ code: "alpha", message: "visible" });\n' }))).toEqual([]);
});

test("stale-arm: a DEFERRED member that GAINS an emit is RED", () => {
  const gate = createWarningCodeCoverage([channel({ beta: "unbuilt — cited" })]);
  const emit = 'warnings.push({ code: "alpha", message: "visible" });\nwarnings.push({ code: "beta", message: "visible" });\n';
  const v = gate.run(ctxFor({ [HOME]: TUPLE, [EMIT]: emit }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("stale");
});

test("an arbitrary warning-code literal does not count as an emit", () => {
  const gate = createWarningCodeCoverage([channel({ beta: "unbuilt — cited" })]);
  const v = gate.run(ctxFor({ [HOME]: TUPLE, [EMIT]: 'export const alpha = "alpha";\n' }));
  expect(v.some((finding) => finding.message.includes('"alpha"'))).toBe(true);
});

test("a warning record pushed into the warnings channel counts as an emit", () => {
  const gate = createWarningCodeCoverage([channel({ beta: "unbuilt — cited" })]);
  const emit = 'warnings.push({ code: "alpha", message: "visible" });\n';
  expect(gate.run(ctxFor({ [HOME]: TUPLE, [EMIT]: emit }))).toEqual([]);
});

test("a chat warning carried by the quiet emitter counts as an emit", () => {
  const chatHome = "packages/contracts/src/chat/bus.ts";
  const chatEmit = "packages/server/src/domain/chat/engine/engine.ts";
  const chatChannel: WarningChannel = {
    tuple: "CHAT_WARNING_CODES",
    homeFile: CHAT_HOME_RE,
    emitScope: CHAT_EMIT_RE,
    deferred: {},
  };
  const gate = createWarningCodeCoverage([chatChannel]);
  expect(
    gate.run(
      ctxFor({
        [chatHome]: 'export const CHAT_WARNING_CODES = ["compaction_failed"] as const;\n',
        [chatEmit]: 'await emitQuiet(deps, { type: "warning", code: "compaction_failed" });\n',
      }),
    ),
  ).toEqual([]);
});

test("a missing canonical warning tuple fails loud", () => {
  const gate = createWarningCodeCoverage([channel({})]);
  const v = gate.run(ctxFor({ [HOME]: "export const OTHER = ['alpha'] as const;\n" }));
  expect(v[0]?.message).toContain("canonical");
});

test("a missing canonical warning home fails loud", () => {
  const gate = createWarningCodeCoverage([channel({})]);
  const v = gate.run(ctxFor({ [EMIT]: 'warnings.push({ code: "alpha", message: "visible" });\n' }));
  expect(v[0]?.message).toContain("canonical");
});
