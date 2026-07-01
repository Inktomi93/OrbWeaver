// verb: getCatalog — reads the snapshot (empty when never refreshed) and warms the cache on a hit.

import { createConnectionService } from "@orb/server/domain/connection";
import { afterEach, describe } from "vitest";
import { writeCatalogSnapshot } from "../../../../../packages/server/src/domain/connection/persistence/catalog-snapshot.ts";
import {
  __resetOrModelCache,
  getCachedOrModels,
} from "../../../../../packages/server/src/domain/connection/substrate/or-model-cache.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeConnHarness, makeOrEntry } from "../_support.ts";

afterEach(() => {
  __resetOrModelCache();
});

describe("getCatalog", () => {
  test("a never-refreshed account reads the empty snapshot", async () => {
    const svc = createConnectionService(makeConnHarness(await freshDb()).ctx);
    expect(await svc.getCatalog({})).toEqual({ fetchedAt: 0, models: [] });
  });

  test("returns the persisted snapshot and warms the cache", async () => {
    const h = makeConnHarness(await freshDb());
    const models = [makeOrEntry({ id: "openai/gpt-5" })];
    await writeCatalogSnapshot(h.ctx.db, { fetchedAt: h.clock.now(), models });
    __resetOrModelCache();
    const svc = createConnectionService(h.ctx);

    const snapshot = await svc.getCatalog({});

    expect(snapshot.models).toEqual(models);
    expect(getCachedOrModels(h.clock.now())).toEqual(models); // warmed by the read
  });
});
