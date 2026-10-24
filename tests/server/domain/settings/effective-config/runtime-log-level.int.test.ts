// @subject packages/server/src/domain/settings/effective-config/cache.ts
// @subject packages/server/src/foundation/observability/logger.ts
// An admin's AppSettings.logLevel moves the running logger through the settings verb, with no restart.
import type { LogLevel } from "@orb/contracts/settings";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, processObservability } from "@orb/testkit/node/composed";

const BOOT_LOG_LEVEL = "silent" satisfies LogLevel;
const LOG_SCAN_LIMIT = 100;

test("an AppSettings.logLevel raise reaches the log ring at runtime and a lowering silences the lower level again", async ({ ids }) => {
  await using root = await createServerHarness({ logLevel: BOOT_LOG_LEVEL });
  const principal = await root.principalFor(root.ownerId);
  const probe = `runtime-log-level:${ids.uuid()}`;
  const logged = (phase: string): readonly string[] =>
    processObservability.logLines(LOG_SCAN_LIMIT).filter((line) => line.includes(`"probe":"${probe}:${phase}"`));

  processObservability.logger().info({ probe: `${probe}:boot` }, "runtime log level probe");
  expect(logged("boot")).toEqual([]);

  await root.services.settings.updateAppSettings({ principal, partial: { logLevel: "info" } });
  processObservability.logger().info({ probe: `${probe}:raised` }, "runtime log level probe");
  expect(logged("raised")).toHaveLength(1);

  await root.services.settings.updateAppSettings({ principal, partial: { logLevel: "warn" } });
  processObservability.logger().info({ probe: `${probe}:lowered` }, "runtime log level probe");
  processObservability.logger().warn({ probe: `${probe}:lowered-warn` }, "runtime log level probe");
  expect(logged("lowered")).toEqual([]);
  expect(logged("lowered-warn")).toHaveLength(1);
});
