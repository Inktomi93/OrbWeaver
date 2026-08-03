// agent-sdk-catalog-snapshot persistence. Asserts: the write→read round-trip; the warm-on-read side-effect
// (a read seeds the in-memory TTL cache — no cold-boot null hole); the tightened parse (a malformed stored
// blob degrades to null); and that it uses a DISTINCT KV key from the OR snapshot (the two never co-mingle).

import type { AgentSdkModel } from "@orb/contracts/connection";
import { afterEach, describe } from "vitest";
import { settings } from "../../../../../packages/db/src/schema/index.ts";
import {
  readAgentSdkCatalogSnapshot,
  writeAgentSdkCatalogSnapshot,
} from "../../../../../packages/server/src/domain/connection/persistence/agent-sdk-catalog-snapshot.ts";
import { readCatalogSnapshot } from "../../../../../packages/server/src/domain/connection/persistence/catalog-snapshot.ts";
import { __resetAgentSdkModelCache, getCachedAgentSdkModels } from "../../../../../packages/server/src/domain/connection/substrate/agent-sdk-model-cache.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const FETCHED_AT = 1_750_000_000_000;
const MODELS: AgentSdkModel[] = [
  {
    alias: "sonnet",
    resolvedModel: "claude-sonnet-5",
    displayName: "Sonnet",
    description: "Sonnet 5",
    supportsEffort: true,
    effortLevels: ["low", "medium", "high", "xhigh", "max"],
    supportsAdaptiveThinking: false,
  },
];

afterEach(() => {
  __resetAgentSdkModelCache();
});

describe("agent-sdk-catalog-snapshot persistence", () => {
  test("write then read round-trips the snapshot", async () => {
    const db = await freshDb();
    await writeAgentSdkCatalogSnapshot(db, { fetchedAt: FETCHED_AT, models: MODELS });
    const read = await readAgentSdkCatalogSnapshot(db);
    expect(read).toEqual({ fetchedAt: FETCHED_AT, models: MODELS });
  });

  test("read WARMS the in-memory TTL cache (the warm-on-read side-effect)", async () => {
    const db = await freshDb();
    await writeAgentSdkCatalogSnapshot(db, { fetchedAt: FETCHED_AT, models: MODELS });
    __resetAgentSdkModelCache();
    expect(getCachedAgentSdkModels(FETCHED_AT)).toBeNull(); // cold before the read
    await readAgentSdkCatalogSnapshot(db);
    expect(getCachedAgentSdkModels(FETCHED_AT)).toEqual(MODELS); // warmed by the read, no explicit seed
  });

  test("a missing row reads as null", async () => {
    const db = await freshDb();
    expect(await readAgentSdkCatalogSnapshot(db)).toBeNull();
  });

  test("a malformed stored blob degrades to null (tightened parse, not a blind cast)", async () => {
    const db = await freshDb();
    await db.insert(settings).values({ key: "agent-sdk-model-catalog", value: { bogus: true }, updatedAt: 0 });
    expect(await readAgentSdkCatalogSnapshot(db)).toBeNull();
  });

  test("the agent-sdk snapshot uses a DISTINCT key — it does not collide with the OR snapshot", async () => {
    const db = await freshDb();
    await writeAgentSdkCatalogSnapshot(db, { fetchedAt: FETCHED_AT, models: MODELS });
    // The OR snapshot reader sees NOTHING under its own key (no co-mingling).
    expect(await readCatalogSnapshot(db)).toBeNull();
  });
});
