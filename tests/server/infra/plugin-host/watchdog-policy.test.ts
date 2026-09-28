import { brokerWatchdogFailure, PLUGIN_BROKER_HEARTBEAT_TIMEOUT_MS, PLUGIN_BROKER_STARTUP_TIMEOUT_MS } from "@orb/server/infra/plugin-host";
import { expect, test } from "../../../support/fixtures.ts";

test("the broker watchdog refuses RSS overflow, startup silence, and a wedged heartbeat", () => {
  expect(brokerWatchdogFailure(5, 100, { startedAt: 0, lastHeartbeatAt: 5, rssBytes: 100 })).toBeNull();
  expect(brokerWatchdogFailure(5, 100, { startedAt: 0, lastHeartbeatAt: 5, rssBytes: 101 })).toMatch(/RSS 101 exceeded/u);
  expect(brokerWatchdogFailure(PLUGIN_BROKER_STARTUP_TIMEOUT_MS + 1, 100, { startedAt: 0 })).toMatch(/startup deadline/u);
  expect(
    brokerWatchdogFailure(PLUGIN_BROKER_HEARTBEAT_TIMEOUT_MS + 6, 100, {
      startedAt: 0,
      lastHeartbeatAt: 5,
      rssBytes: 50,
    }),
  ).toMatch(/heartbeat stopped/u);
});
