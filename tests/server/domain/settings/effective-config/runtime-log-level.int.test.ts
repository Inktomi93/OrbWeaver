// @subject packages/server/src/domain/settings/effective-config/cache.ts
// @subject packages/server/src/foundation/observability/logger.ts
// An admin's AppSettings.logLevel moves that root's running logger through the settings verb, with no restart,
// and no other root's.
import type { LogLevel } from "@orb/contracts/settings";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, processObservability } from "@orb/testkit/node/composed";

const BOOT_LOG_LEVEL = "silent" satisfies LogLevel;
const OTHER_BOOT_LOG_LEVEL = "info" satisfies LogLevel;
const LOG_SCAN_LIMIT = 100;

function linesFor(probe: string): (phase: string) => readonly string[] {
  return (phase) => processObservability.logLines(LOG_SCAN_LIMIT).filter((line) => line.includes(`"probe":"${probe}:${phase}"`));
}

test("an AppSettings.logLevel raise reaches the log ring at runtime and a lowering silences the lower level again", async ({ ids }) => {
  await using root = await createServerHarness({ logLevel: BOOT_LOG_LEVEL });
  const principal = await root.principalFor(root.ownerId);
  const probe = `runtime-log-level:${ids.uuid()}`;
  const logged = linesFor(probe);

  root.logger.info({ probe: `${probe}:boot` }, "runtime log level probe");
  expect(logged("boot")).toEqual([]);

  await root.services.settings.updateAppSettings({ principal, partial: { logLevel: "info" } });
  root.logger.info({ probe: `${probe}:raised` }, "runtime log level probe");
  expect(logged("raised")).toHaveLength(1);

  await root.services.settings.updateAppSettings({ principal, partial: { logLevel: "warn" } });
  root.logger.info({ probe: `${probe}:lowered` }, "runtime log level probe");
  root.logger.warn({ probe: `${probe}:lowered-warn` }, "runtime log level probe");
  expect(logged("lowered")).toEqual([]);
  expect(logged("lowered-warn")).toHaveLength(1);
});

test("two roots in one worker keep their own record's level, and one root's override leaves the other's alone", async ({ ids }) => {
  await using quiet = await createServerHarness({ logLevel: BOOT_LOG_LEVEL });
  await using loud = await createServerHarness({ logLevel: OTHER_BOOT_LOG_LEVEL });
  const probe = `two-root-log-level:${ids.uuid()}`;
  const logged = linesFor(probe);

  quiet.logger.info({ probe: `${probe}:quiet-boot` }, "two root log level probe");
  loud.logger.info({ probe: `${probe}:loud-boot` }, "two root log level probe");
  expect(logged("quiet-boot")).toEqual([]);
  expect(logged("loud-boot")).toHaveLength(1);

  await loud.services.settings.updateAppSettings({ principal: await loud.principalFor(loud.ownerId), partial: { logLevel: "warn" } });
  await quiet.services.settings.updateAppSettings({ principal: await quiet.principalFor(quiet.ownerId), partial: { logLevel: "info" } });
  quiet.logger.info({ probe: `${probe}:quiet-raised` }, "two root log level probe");
  loud.logger.info({ probe: `${probe}:loud-lowered` }, "two root log level probe");
  expect(logged("quiet-raised")).toHaveLength(1);
  expect(logged("loud-lowered")).toEqual([]);
});
