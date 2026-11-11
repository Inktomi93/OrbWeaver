// @subject packages/server/src/infra/plugin-host/budgets.ts
// Each command kind's worst case ends before the parent's backstop for it (D347). The backstop runs from when the
// command becomes its runtime's oldest outstanding one, so the queue ahead of a command is no term: each queued command
// is bounded alone, and the queue's own bound is its depth times one command's. The broker is replaced only on its
// heartbeat; a command still inside its worst case when the broker hangs fails with the broker, never at its backstop,
// so a host hang strikes no plugin.
import { expect, test } from "@orb/testkit/node";
import {
  HOST_FN_DEADLINE_MS,
  PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS,
  PLUGIN_BROKER_LIVENESS_BOUND_MS,
  PLUGIN_COMMAND_CPU_BUDGET_MS,
  PLUGIN_COMMAND_TIMEOUT_MS,
  PLUGIN_RESIDENT_LIMITS,
  PLUGIN_SNIPPET_LIMITS,
  PLUGIN_WORKER_OVERRUN_MAX_MS,
  PLUGIN_WORKER_SPAN_CHECK_MS,
  settlementWallMs,
} from "#server/infra/plugin-host/budgets.ts";
import { PLUGIN_BROKER_SYNC_TIMEOUT_MS } from "#server/infra/plugin-host/process-protocol.ts";

// The settlement wall one invocation may wait out with no span open, read from the limits the sandbox runs under.
const RESIDENT_WALL_MS = settlementWallMs(PLUGIN_RESIDENT_LIMITS);
const SNIPPET_WALL_TOTAL_MS = settlementWallMs(PLUGIN_SNIPPET_LIMITS);

// What one command of each kind can take from becoming its runtime's oldest to its answer, apart from Worker start:
// - guest spans, ended by the broker at the kind's budget plus the overrun allowance, read up to two checks late;
// - the settlement walls it waits out: activation races `evalGuest` and `settleActivationJobs`, each with its own wall;
// - host work no span counts: an invoke's argument build is one synchronous seam call, and a failed activation joins
//   the host calls it started, each bounded by the host-call deadline.
const WORST_CASE_TERMS = {
  create: { walls: 2 * RESIDENT_WALL_MS, host: HOST_FN_DEADLINE_MS },
  invoke: { walls: RESIDENT_WALL_MS, host: PLUGIN_BROKER_SYNC_TIMEOUT_MS },
  snippet: { walls: SNIPPET_WALL_TOTAL_MS, host: 0 },
  dispose: { walls: 0, host: 0 },
} as const satisfies Record<keyof typeof PLUGIN_COMMAND_TIMEOUT_MS, { readonly walls: number; readonly host: number }>;

// Worker start, the broker's termination and the answer's crossing have no bound of their own, so this is a chosen
// value: one host-call deadline, about twice the slowest Worker start measured at load up to 40 (D347).
const UNBOUNDED_SLACK_MS = HOST_FN_DEADLINE_MS;

// How long after the broker stops answering its watchdog ends it: the heartbeat bound, read one interval late.
const LIVENESS_BOUND_MS = PLUGIN_BROKER_LIVENESS_BOUND_MS + PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS;

test("every command kind's worst case, settlement walls and host work included, with the slack and the liveness bound, ends before the parent's backstop", () => {
  const kinds = Object.keys(PLUGIN_COMMAND_TIMEOUT_MS).filter((kind): kind is keyof typeof PLUGIN_COMMAND_TIMEOUT_MS => Object.hasOwn(WORST_CASE_TERMS, kind));
  expect(kinds).toEqual(Object.keys(WORST_CASE_TERMS));
  for (const kind of kinds) {
    const terms = WORST_CASE_TERMS[kind];
    const spansMs = PLUGIN_COMMAND_CPU_BUDGET_MS[kind] + PLUGIN_WORKER_OVERRUN_MAX_MS + 2 * PLUGIN_WORKER_SPAN_CHECK_MS;
    expect(spansMs + terms.walls + terms.host + UNBOUNDED_SLACK_MS + LIVENESS_BOUND_MS, kind).toBeLessThan(PLUGIN_COMMAND_TIMEOUT_MS[kind]);
  }
});
