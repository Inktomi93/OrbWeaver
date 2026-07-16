// verb: refreshAgentSdkCatalog — runs the daemon `supportedModels()` discovery, persists the snapshot,
// warms the cache. On a discovery failure it serves a persisted snapshot if any, else throws
// AgentSdkCatalogUnavailableError (flagged, not faked). Mirrors refresh-catalog.int.test.ts.

import { AgentSdkCatalogUnavailableError, createConnectionService } from "@orb/server/domain/connection";
import { afterEach, describe } from "vitest";
import { readAgentSdkCatalogSnapshot } from "../../../../../packages/server/src/domain/connection/persistence/agent-sdk-catalog-snapshot.ts";
import { __resetAgentSdkModelCache, getCachedAgentSdkModels } from "../../../../../packages/server/src/domain/connection/substrate/agent-sdk-model-cache.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeAgentSdkModel, makeConnHarness } from "../_support.ts";

afterEach(() => {
  __resetAgentSdkModelCache();
});

describe("refreshAgentSdkCatalog", () => {
  test("runs discovery, persists, and warms the cache", async () => {
    const h = makeConnHarness(await freshDb());
    const models = [makeAgentSdkModel({ alias: "sonnet" })];
    h.setAgentSdkCatalog(models);
    const svc = createConnectionService(h.ctx);

    const snapshot = await svc.refreshAgentSdkCatalog({});

    expect(snapshot.models).toEqual(models);
    expect(snapshot.fetchedAt).toBe(h.clock.now()); // injected clock, not the wall clock
    expect(await readAgentSdkCatalogSnapshot(h.ctx.db)).toEqual(snapshot); // persisted
    expect(getCachedAgentSdkModels(h.clock.now())).toEqual(models); // warmed immediately
  });

  test("a discovery failure with NO persisted snapshot throws AgentSdkCatalogUnavailableError", async () => {
    const h = makeConnHarness(await freshDb());
    const ctx = {
      ...h.ctx,
      fetchAgentSdkModels: () => Promise.reject(new Error("daemon down")),
    };
    const svc = createConnectionService(ctx);

    await expect(svc.refreshAgentSdkCatalog({})).rejects.toBeInstanceOf(AgentSdkCatalogUnavailableError);
  });

  test("a discovery failure WITH a persisted snapshot serves the stale snapshot", async () => {
    const h = makeConnHarness(await freshDb());
    const models = [makeAgentSdkModel({ alias: "sonnet" })];
    h.setAgentSdkCatalog(models);
    await createConnectionService(h.ctx).refreshAgentSdkCatalog({}); // seed a persisted snapshot

    const ctx = {
      ...h.ctx,
      fetchAgentSdkModels: () => Promise.reject(new Error("daemon down")),
    };
    const stale = await createConnectionService(ctx).refreshAgentSdkCatalog({});

    expect(stale.models).toEqual(models);
  });
});
