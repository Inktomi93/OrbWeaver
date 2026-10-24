// @subject packages/server/src/transport/jobs/oidc-gc-scheduler.ts
// A scheduler builds its component logger once at start and still follows a later AppSettings.logLevel
// override of its root, because a pino child reads its level from the root until it is given one of its own.
import type { LogLevel } from "@orb/contracts/settings";
import { startOidcGcScheduler } from "@orb/server/transport/jobs";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, processObservability } from "@orb/testkit/node/composed";

const BOOT_LOG_LEVEL = "silent" satisfies LogLevel;
const LOG_SCAN_LIMIT = 100;

test("a scheduler started at silent logs its failed tick once the root's level is raised, and stops when it is lowered", async ({ ids }) => {
  await using root = await createServerHarness({ logLevel: BOOT_LOG_LEVEL });
  const principal = await root.principalFor(root.ownerId);
  const marker = `scheduler-log-level:${ids.uuid()}`;
  const failedLines = (): readonly string[] => processObservability.logLines(LOG_SCAN_LIMIT).filter((line) => line.includes(marker));

  let tick: (() => void) | undefined;
  let pending: Promise<void> = Promise.resolve();
  const stop = startOidcGcScheduler({
    logger: root.logger,
    track: (work) => {
      pending = work.then(() => undefined);
    },
    sweep: () => Promise.reject(new Error(marker)),
    now: () => 0,
    scheduleInterval: (fn) => {
      tick = fn;
      return () => undefined;
    },
  });
  const runTick = async (): Promise<void> => {
    tick?.();
    await pending;
  };

  await pending;
  expect(failedLines()).toEqual([]);

  await root.services.settings.updateAppSettings({ principal, partial: { logLevel: "info" } });
  await runTick();
  expect(failedLines()).toHaveLength(1);

  await root.services.settings.updateAppSettings({ principal, partial: { logLevel: "silent" } });
  await runTick();
  expect(failedLines()).toHaveLength(1);

  stop();
});
