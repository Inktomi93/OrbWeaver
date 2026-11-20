// @subject packages/server/src/infra/plugin-host/watchdog-policy.ts
// Once the watchdog is told to stop, it ends a broker still running one liveness bound of wall time later, however few
// intervals it has judged: a lagging watchdog judges late, and the app ends the watchdog soon after that bound, which
// would leave a hung broker with no supervisor on any platform.
import { expect, test } from "@orb/testkit/node";
import { PLUGIN_BROKER_LIVENESS_BOUND_MS, PLUGIN_WATCHDOG_STOP_GRACE_MS } from "#server/infra/plugin-host/budgets.ts";
import { brokerWatchdogFailure } from "#server/infra/plugin-host/watchdog-policy.ts";

const MEMORY_LIMIT_BYTES = 1024;
const STOPPED_AT = 5000;
// A broker that has beaten, judged after a lag in which no interval counted as missed.
const LAGGING = { startedAt: 0, heard: true, misses: 0 } as const;

test("a stopping broker is ended once one liveness bound of wall time has passed since the stop, before the app ends its watchdog", () => {
  // Positive control: the same state without a stop is never ended, however late the judgement.
  expect(brokerWatchdogFailure(STOPPED_AT + PLUGIN_WATCHDOG_STOP_GRACE_MS, MEMORY_LIMIT_BYTES, LAGGING)).toBeNull();

  const stopping = { ...LAGGING, stoppedAt: STOPPED_AT };
  expect(brokerWatchdogFailure(STOPPED_AT + PLUGIN_BROKER_LIVENESS_BOUND_MS - 1, MEMORY_LIMIT_BYTES, stopping)).toBeNull();
  expect(brokerWatchdogFailure(STOPPED_AT + PLUGIN_BROKER_LIVENESS_BOUND_MS, MEMORY_LIMIT_BYTES, stopping)).toEqual(expect.stringMatching(/after its stop/u));
  expect(PLUGIN_BROKER_LIVENESS_BOUND_MS).toBeLessThan(PLUGIN_WATCHDOG_STOP_GRACE_MS);
});
