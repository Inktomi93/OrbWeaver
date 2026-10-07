// The ambient-environment door's own pins — moved here with the door itself when `_shared/proc.ts` hit its
// 450-line cap (#1848) and the three env functions became `_shared/process-env.ts`. The property under test
// is unchanged and is the reason the door exists at all: `withProcessEnv` is a WINDOW, so whatever it
// exposed to a worker/subprocess protocol must be gone afterwards — an absent key restored as actual
// ABSENCE (not as the string "undefined", which is what a naive restore leaves and what then reaches a
// child as a real path), and a present key restored byte-for-byte even when the window REJECTED.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { inheritedProcessEnv, processEnvValue, testProcessEnv, withProcessEnv } from "@orb/tooling/_shared/process-env";
import { expect, test } from "../../support/tool-fixtures.ts";

const ABSENT_ENV_KEY = "ORB_PROC_TEST_ABSENT";
const PRESENT_ENV_KEY = "ORB_PROC_TEST_PRESENT";

test("test environment preserves explicit overrides and adds the storage option without ambient mutation", () => {
  const ambient = inheritedProcessEnv();
  const overrides = {
    ["NODE_OPTIONS"]: '--max-old-space-size=16384 --import="/a path/preload.js"',
    ["ORB_CT_CACHE_DIR"]: "/owned/ct",
    ["ORB_RUN_MARKER"]: "proof-run",
  };
  const environment = testProcessEnv(overrides);
  expect(environment).toEqual({ ...ambient, ...overrides, ["NODE_OPTIONS"]: `${overrides["NODE_OPTIONS"]} --no-webstorage` });
  expect(inheritedProcessEnv()).toEqual(ambient);
  expect(testProcessEnv(environment)).toEqual(environment);
});

test("test environment disables storage after an inherited enabling option in an actual Node child", () => {
  const environment = testProcessEnv({ ["NODE_OPTIONS"]: "--max-old-space-size=16384 --no-webstorage --experimental-webstorage" });
  const child = runNicedSync(
    process.execPath,
    ["-e", 'console.log(JSON.stringify({ localStorage: "localStorage" in globalThis, sessionStorage: "sessionStorage" in globalThis }))'],
    { env: environment },
  );
  expect(child.status, child.stderr).toBe(0);
  expect(JSON.parse(child.stdout)).toEqual({ localStorage: false, sessionStorage: false });
  expect(environment["NODE_OPTIONS"]).toBe("--max-old-space-size=16384 --no-webstorage --experimental-webstorage --no-webstorage");
  expect(testProcessEnv(environment)).toEqual(environment);
});

test("withProcessEnv restores an absent key as actual absence across consecutive worker windows", async ({ repoRoot, scratch }) => {
  expect(Object.hasOwn(inheritedProcessEnv(), ABSENT_ENV_KEY)).toBe(false);
  const firstSink = join(scratch, "first.jsonl");
  const secondSink = join(scratch, "second.jsonl");

  await withProcessEnv(ABSENT_ENV_KEY, firstSink, async () => {
    expect(processEnvValue(ABSENT_ENV_KEY)).toBe(firstSink);
    await Promise.resolve();
  });
  expect(Object.hasOwn(inheritedProcessEnv(), ABSENT_ENV_KEY)).toBe(false);
  expect(processEnvValue(ABSENT_ENV_KEY)).toBeUndefined();

  await withProcessEnv(ABSENT_ENV_KEY, secondSink, async () => {
    expect(processEnvValue(ABSENT_ENV_KEY)).toBe(secondSink);
    await Promise.resolve();
  });
  expect(Object.hasOwn(inheritedProcessEnv(), ABSENT_ENV_KEY)).toBe(false);
  expect(processEnvValue(ABSENT_ENV_KEY)).toBeUndefined();
  expect(() => readFileSync(join(repoRoot, "undefined"), "utf8")).toThrow();
});

test("withProcessEnv restores a present key byte-for-byte after a rejected worker window", async () => {
  expect(Object.hasOwn(inheritedProcessEnv(), PRESENT_ENV_KEY)).toBe(false);
  await withProcessEnv(PRESENT_ENV_KEY, "original-value", async () => {
    await expect(
      withProcessEnv(PRESENT_ENV_KEY, "temporary-value", async () => {
        expect(processEnvValue(PRESENT_ENV_KEY)).toBe("temporary-value");
        await Promise.reject(new Error("planted worker rejection"));
      }),
    ).rejects.toThrow("planted worker rejection");
    expect(Object.hasOwn(inheritedProcessEnv(), PRESENT_ENV_KEY)).toBe(true);
    expect(processEnvValue(PRESENT_ENV_KEY)).toBe("original-value");
  });
  expect(Object.hasOwn(inheritedProcessEnv(), PRESENT_ENV_KEY)).toBe(false);
});
