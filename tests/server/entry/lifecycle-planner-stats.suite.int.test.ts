// entry/lifecycle — boot refreshes planner statistics before the listener serves. A library that grew while
// `sqlite_stat1` still called the message tables near-empty planned the chat recency subquery as a bare scan.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, createDb } from "@orb/db";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { recencyPlan, STALE_STATS_INDEX, seedStaleMessageStats } from "@orb/testkit/node/stale-planner-stats.ts";
import { afterAll, vi } from "vitest";

const TEMP_DIR = mkdtempSync(join(tmpdir(), "cb-sp-boot-"));
const DATABASE_URL = `file:${join(TEMP_DIR, "orb.db")}`;
const BOOT_TIMEOUT_MS = 120_000;

vi.stubEnv("DATABASE_URL", DATABASE_URL);
vi.stubEnv("AUTH_MODE", "single-user");
vi.stubEnv("VLLM_DISABLED", "true");
vi.stubEnv("ASSETS_DIR", join(TEMP_DIR, "assets"));
vi.stubEnv("USER_RUNTIME_DIR", join(TEMP_DIR, "users"));
vi.stubEnv("LOCAL_LIGHT_CACHE_DIR", join(TEMP_DIR, "models"));
vi.stubEnv("LOCAL_LIGHT_PREFETCH", "off");

const { createLifecycle } = await import("#server/entry/lifecycle.ts").catch((error: unknown) => {
  rmSync(TEMP_DIR, { force: true, recursive: true });
  throw error;
});

afterAll(() => {
  rmSync(TEMP_DIR, { force: true, recursive: true });
});

/** The recency plan as a fresh connection sees it: planner statistics load when a connection opens. */
async function planOnFreshConnection(): Promise<string> {
  const db = await createDb(DATABASE_URL);
  try {
    return (await recencyPlan(db)).join("\n");
  } finally {
    closeDb(db);
  }
}

test(
  "boot re-plans the chat recency subquery over a library whose stats call the message tables empty",
  async () => {
    const first = createLifecycle({ listenPort: 0 });
    await first.boot();
    await first.shutdown();

    const seeded = await createDb(DATABASE_URL);
    try {
      await seedStaleMessageStats(seeded);
    } finally {
      closeDb(seeded);
    }
    expect(await planOnFreshConnection()).not.toContain(STALE_STATS_INDEX);

    const second = createLifecycle({ listenPort: 0 });
    await second.boot();
    try {
      expect(await planOnFreshConnection()).toContain(STALE_STATS_INDEX);
    } finally {
      await second.shutdown();
    }
  },
  BOOT_TIMEOUT_MS,
);
