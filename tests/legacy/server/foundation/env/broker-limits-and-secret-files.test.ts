// @module-tag requires-process-chdir
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { APP_SECRET_ENV_KEYS } from "#server/foundation/env/index.ts";
import { EMPTY_DIR, makeDir, reimportEnvWith, restoreProcessEnvAfterEach } from "./_support.ts";

describe("foundation/env — plugin broker limits and *_FILE secrets", () => {
  restoreProcessEnvAfterEach();

  test("plugin broker process limits are parsed once with finite defaults and strict positive overrides", async () => {
    const defaults = await reimportEnvWith({});
    expect(defaults.env.PLUGIN_BROKER_WORKER_MAX).toBe(4);
    expect(defaults.env.PLUGIN_BROKER_MEMORY_LIMIT_BYTES).toBe(1_073_741_824);

    const configured = await reimportEnvWith({ PLUGIN_BROKER_WORKER_MAX: "12", PLUGIN_BROKER_MEMORY_LIMIT_BYTES: "2147483648" });
    expect(configured.env.PLUGIN_BROKER_WORKER_MAX).toBe(12);
    expect(configured.env.PLUGIN_BROKER_MEMORY_LIMIT_BYTES).toBe(2_147_483_648);

    await expect(reimportEnvWith({ PLUGIN_BROKER_WORKER_MAX: "0" })).rejects.toThrow("PLUGIN_BROKER_WORKER_MAX");
    await expect(reimportEnvWith({ PLUGIN_BROKER_MEMORY_LIMIT_BYTES: "1e9" })).rejects.toThrow("PLUGIN_BROKER_MEMORY_LIMIT_BYTES");
  });

  for (const key of APP_SECRET_ENV_KEYS) {
    test(`${key}_FILE loads into the frozen floor, never process.env`, async () => {
      const file = join(makeDir("orb-env-secret-"), "secret");
      const value = "file-secret-that-is-long-enough-for-session-validation";
      writeFileSync(file, `${value}\n\n`);
      const mod = await reimportEnvWith({ [key]: "", [`${key}_FILE`]: file });
      expect(mod.env[key]).toBe(value);
      expect(mod.processEnvSnapshot()[key]).toBe("");
    });

    test(`${key} explicit nonempty env wins over a missing file`, async () => {
      const value = "explicit-secret-that-is-long-enough-for-session-validation";
      const mod = await reimportEnvWith({ [key]: value, [`${key}_FILE`]: join(EMPTY_DIR, "missing") });
      expect(mod.env[key]).toBe(value);
    });

    test(`${key}_FILE empty means unset, but unreadable refuses boot`, async () => {
      const file = join(makeDir("orb-env-empty-secret-"), "secret");
      writeFileSync(file, "\n\n");
      expect((await reimportEnvWith({ [`${key}_FILE`]: file })).env[key]).toBeUndefined();
      await expect(reimportEnvWith({ [`${key}_FILE`]: join(EMPTY_DIR, "missing") })).rejects.toThrow(`${key}_FILE`);
    });
  }
});
