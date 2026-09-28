import type { ProdRecord } from "../../../../tooling/src/stack/contract/types.ts";
import type { FailedSpawnDeps } from "../../../../tooling/src/stack/ops/prod-up.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const record: ProdRecord = {
  mode: "prod",
  pid: 123,
  pgid: 123,
  port: 8788,
  startedAt: new Date(0).toISOString(),
  debug: false,
  repoRoot: "/repo",
  logPath: "/repo/.run/prod.log",
};

const { terminateFailedSpawn } = await import("../../../../tooling/src/stack/ops/prod-up.ts");

test("boot-timeout cleanup confirms the complete server process group is gone before removing its record", async () => {
  let alive = true;
  let now = 0;
  let removed = false;
  const signals: string[] = [];
  const deps: FailedSpawnDeps = {
    groupAlive: () => alive,
    signalGroup: (_pgid, signal) => {
      signals.push(signal);
      if (signal === "SIGKILL") {
        alive = false;
      }
    },
    pause: () => {
      now = 6000;
      return Promise.resolve();
    },
    now: () => now,
    readRecord: () => record,
    removePidfile: () => {
      removed = true;
    },
  };

  await terminateFailedSpawn(record, deps);

  expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
  expect(removed).toBe(true);
});

test("boot-timeout cleanup leaves the pidfile intact when the server process group cannot be killed", async () => {
  let now = 0;
  let removed = false;
  const deps: FailedSpawnDeps = {
    groupAlive: () => true,
    signalGroup: () => undefined,
    pause: () => {
      now += 6000;
      return Promise.resolve();
    },
    now: () => now,
    readRecord: () => record,
    removePidfile: () => {
      removed = true;
    },
  };

  await expect(terminateFailedSpawn(record, deps)).rejects.toThrow(/remained live/u);
  expect(removed).toBe(false);
});
