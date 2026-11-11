// @subject packages/server/src/infra/plugin-host/budgets.ts
// The broker ends a stuck Worker strictly before the parent's command timeout can kill the broker, for every command
// kind (D347): the kind's CPU budget, the overrun allowance, two checks of the broker's lateness, and one host-call
// deadline of slack for the termination and the answer to cross.
import { expect, test } from "@orb/testkit/node";
import {
  HOST_FN_DEADLINE_MS,
  PLUGIN_COMMAND_CPU_BUDGET_MS,
  PLUGIN_COMMAND_TIMEOUT_MS,
  PLUGIN_WORKER_OVERRUN_MAX_MS,
  PLUGIN_WORKER_SPAN_CHECK_MS,
} from "#server/infra/plugin-host/budgets.ts";

const commandKinds = Object.keys(PLUGIN_COMMAND_TIMEOUT_MS).filter((kind): kind is keyof typeof PLUGIN_COMMAND_TIMEOUT_MS =>
  Object.hasOwn(PLUGIN_COMMAND_CPU_BUDGET_MS, kind),
);

test("every command kind's broker bound, with its lateness and a deadline of slack, ends before the parent's timeout", () => {
  expect(commandKinds).toEqual(Object.keys(PLUGIN_COMMAND_CPU_BUDGET_MS));
  for (const kind of commandKinds) {
    const brokerEndsByMs = PLUGIN_COMMAND_CPU_BUDGET_MS[kind] + PLUGIN_WORKER_OVERRUN_MAX_MS + 2 * PLUGIN_WORKER_SPAN_CHECK_MS;
    expect(brokerEndsByMs + HOST_FN_DEADLINE_MS).toBeLessThan(PLUGIN_COMMAND_TIMEOUT_MS[kind]);
  }
});
