// verb: refreshCatalog — fetches OR /models, persists the snapshot, warms the cache. On a fetch failure it
// serves a persisted snapshot if any, else throws CatalogUnavailableError (flagged, not faked).

import { CatalogUnavailableError, createConnectionService } from "@orb/server/domain/connection";
import { afterEach, describe, expect, test } from "vitest";
import { readCatalogSnapshot } from "../../../../../packages/server/src/domain/connection/persistence/catalog-snapshot.ts";
import {
  __resetOrModelCache,
  getCachedOrModels,
} from "../../../../../packages/server/src/domain/connection/substrate/or-model-cache.ts";
import { freshDb } from "../../../../support/db.ts";
import { makeConnHarness, makeOrEntry } from "../_support.ts";

afterEach(() => {
  __resetOrModelCache();
});

describe("refreshCatalog", () => {
  test("fetches, persists, and warms the cache", async () => {
    const h = makeConnHarness(await freshDb());
    const models = [makeOrEntry({ id: "openai/gpt-5" })];
    h.setOrCatalog(models);
    const svc = createConnectionService(h.ctx);

    const snapshot = await svc.refreshCatalog({});

    expect(snapshot.models).toEqual(models);
    expect(snapshot.fetchedAt).toBe(h.clock.now()); // injected clock, not the wall clock
    expect(await readCatalogSnapshot(h.ctx.db)).toEqual(snapshot); // persisted
    expect(getCachedOrModels(h.clock.now())).toEqual(models); // warmed immediately
  });

  test("a fetch failure with NO persisted snapshot throws CatalogUnavailableError", async () => {
    const h = makeConnHarness(await freshDb());
    const ctx = { ...h.ctx, fetchOrCatalog: () => Promise.reject(new Error("network down")) };
    const svc = createConnectionService(ctx);

    await expect(svc.refreshCatalog({})).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  test("a fetch failure WITH a persisted snapshot serves the stale snapshot", async () => {
    const h = makeConnHarness(await freshDb());
    const models = [makeOrEntry({ id: "openai/gpt-5" })];
    h.setOrCatalog(models);
    await createConnectionService(h.ctx).refreshCatalog({}); // seed a persisted snapshot

    const ctx = { ...h.ctx, fetchOrCatalog: () => Promise.reject(new Error("network down")) };
    const stale = await createConnectionService(ctx).refreshCatalog({});

    expect(stale.models).toEqual(models);
  });
});
