// catalog-snapshot persistence. Asserts: the write→read
// round-trip; the warm-on-read side-effect (a read seeds the in-memory TTL cache — no cold-boot null hole);
// and the tightened parse (a malformed stored blob degrades to null, replacing neo's blind cast).

import type { ModelCatalogEntry } from "@orb/contracts/connection";
import { afterEach, describe } from "vitest";
import { settings } from "../../../../../packages/db/src/schema/index.ts";
import { readCatalogSnapshot, writeCatalogSnapshot } from "../../../../../packages/server/src/domain/connection/persistence/catalog-snapshot.ts";
import { __resetOrModelCache, getCachedOrModels } from "../../../../../packages/server/src/domain/connection/substrate/or-model-cache.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";

const FETCHED_AT = 1_750_000_000_000;
const MODELS: ModelCatalogEntry[] = [
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    contextLength: 128_000,
    promptPrice: null,
    completionPrice: null,
    cacheReadPrice: null,
    cacheWritePrice: null,
    inputModalities: ["text"],
    supportedParameters: ["temperature", "top_p"],
  },
];

afterEach(() => {
  __resetOrModelCache();
});

describe("catalog-snapshot persistence", () => {
  test("write then read round-trips the snapshot", async () => {
    const db = await freshDb();
    await writeCatalogSnapshot(db, { fetchedAt: FETCHED_AT, models: MODELS });
    const read = await readCatalogSnapshot(db);
    expect(read).toEqual({ fetchedAt: FETCHED_AT, models: MODELS });
  });

  test("read WARMS the in-memory TTL cache (the warm-on-read side-effect)", async () => {
    const db = await freshDb();
    await writeCatalogSnapshot(db, { fetchedAt: FETCHED_AT, models: MODELS });
    __resetOrModelCache();
    expect(getCachedOrModels(FETCHED_AT)).toBeNull(); // cold before the read
    await readCatalogSnapshot(db);
    expect(getCachedOrModels(FETCHED_AT)).toEqual(MODELS); // warmed by the read, no explicit seed
  });

  test("a missing row reads as null", async () => {
    const db = await freshDb();
    expect(await readCatalogSnapshot(db)).toBeNull();
  });

  test("a malformed stored blob degrades to null (tightened parse, not a blind cast)", async () => {
    const db = await freshDb();
    await db.insert(settings).values({ key: "openrouter-model-catalog", value: { bogus: true }, updatedAt: 0 });
    expect(await readCatalogSnapshot(db)).toBeNull();
  });
});
