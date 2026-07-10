// effective-config/cache — the resolved-config cache + reload seam. Asserts: the sync read is the env
// floor before the first reload; reload rebuilds from the stored override; and the LOAD-BEARING
// `logger.level` rebind on reload (without it AppSettings.logLevel is a
// docs-only knob effective only at restart). ASSUMES(single-replica): the cache is module-scope, reset per
// test here.

import { env } from "@orb/server/foundation/env";
import { logger } from "@orb/server/foundation/observability";
import { afterEach, beforeEach, describe } from "vitest";
import {
  __resetEffectiveConfigCache,
  getEffectiveConfig,
  reloadEffectiveConfig,
} from "../../../../../packages/server/src/domain/settings/effective-config/cache.ts";
import { writeAppOverride } from "../../../../../packages/server/src/domain/settings/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";

const AT = 1_750_000_000_000;
const originalLevel = logger.level;

beforeEach(() => {
  __resetEffectiveConfigCache();
});
afterEach(() => {
  logger.level = originalLevel;
});

describe("effective-config cache", () => {
  test("getEffectiveConfig() is the env floor before any reload", () => {
    expect(getEffectiveConfig().logLevel).toBe(env.LOG_LEVEL);
  });

  test("reload with no stored override resolves to the env floor + rebinds logger.level", async () => {
    const db = await freshDb();
    const cfg = await reloadEffectiveConfig(db);
    expect(cfg.logLevel).toBe(env.LOG_LEVEL);
    expect(logger.level).toBe(env.LOG_LEVEL);
  });

  test("reload reflects the stored override AND rebinds logger.level (the load-bearing knob)", async () => {
    const db = await freshDb();
    await writeAppOverride(db, { logLevel: "debug", schemaVersion: 2 }, AT);
    const cfg = await reloadEffectiveConfig(db);
    expect(cfg.logLevel).toBe("debug");
    expect(getEffectiveConfig().logLevel).toBe("debug");
    expect(logger.level).toBe("debug");
  });

  test("reload flows a stored maxImageBytes override to the sync getter (the imagery-cap read path)", async () => {
    const db = await freshDb();
    await writeAppOverride(db, { maxImageBytes: 20_000_000, schemaVersion: 2 }, AT);
    const cfg = await reloadEffectiveConfig(db);
    expect(cfg.maxImageBytes).toBe(20_000_000);
    // The sync getter the compose `fetchImage` binding reads at call time returns the live override.
    expect(getEffectiveConfig().maxImageBytes).toBe(20_000_000);
  });
});
