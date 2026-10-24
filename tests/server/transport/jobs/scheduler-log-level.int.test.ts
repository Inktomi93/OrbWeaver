// @subject packages/server/src/transport/jobs/oidc-gc-scheduler.ts
// A scheduler builds its component logger once at start and still follows a later change to its root's level,
// because a pino child reads its level from the root until it is given one of its own.
import type { LogLevel } from "@orb/contracts/settings";
import { oidcTransactions } from "@orb/db";
import { MS_PER_HOUR } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, processObservability, withheldTable } from "@orb/testkit/node/composed";
import { NATIVE_OIDC_SETTINGS } from "@orb/testkit/node/helpers";
import { sql } from "drizzle-orm";

const BOOT_LOG_LEVEL = "silent" satisfies LogLevel;
const LOG_SCAN_LIMIT = 200;
const SWEEP_FAILED = "oidc-gc: sweep failed";

test("an oidc-gc scheduler started at silent logs its failed tick once the root's level is raised, and stops when it is lowered", async () => {
  await using root = await createServerHarness({
    logLevel: BOOT_LOG_LEVEL,
    env: { ["AUTH_MODE"]: "oidc", ["AUTH_FALLBACK"]: "deny" },
    oidc: NATIVE_OIDC_SETTINGS,
  });
  const failures = (): number => processObservability.logLines(LOG_SCAN_LIMIT).filter((line) => line.includes(SWEEP_FAILED)).length;
  // The tick's sweep queues on the root's one connection before this probe, and its failure is logged on the
  // microtasks that follow, which the macrotask turn drains.
  const failingTick = async (): Promise<void> => {
    root.timers.advance(MS_PER_HOUR);
    await root.db.run(sql`select 1`);
    await new Promise<void>((resolve) => setImmediate(resolve));
  };
  await using _withheld = await withheldTable(root.db, oidcTransactions);
  const before = failures();

  await failingTick();
  expect(failures()).toBe(before);

  root.logger.level = "info";
  await failingTick();
  expect(failures()).toBe(before + 1);

  root.logger.level = BOOT_LOG_LEVEL;
  await failingTick();
  expect(failures()).toBe(before + 1);
});
