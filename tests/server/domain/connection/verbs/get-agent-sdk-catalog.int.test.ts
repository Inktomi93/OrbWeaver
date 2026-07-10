// verb: getAgentSdkCatalog — reads the daemon catalog snapshot (empty when never refreshed) and warms the
// cache on a hit. Mirrors get-catalog.int.test.ts.

import { createConnectionService } from "@orb/server/domain/connection";
import { afterEach, describe } from "vitest";
import { writeAgentSdkCatalogSnapshot } from "../../../../../packages/server/src/domain/connection/persistence/agent-sdk-catalog-snapshot.ts";
import {
  __resetAgentSdkModelCache,
  getCachedAgentSdkModels,
} from "../../../../../packages/server/src/domain/connection/substrate/agent-sdk-model-cache.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeAgentSdkModel, makeConnHarness } from "../_support.ts";

afterEach(() => {
  __resetAgentSdkModelCache();
});

describe("getAgentSdkCatalog", () => {
  test("a never-refreshed account reads the empty snapshot", async () => {
    const svc = createConnectionService(makeConnHarness(await freshDb()).ctx);
    expect(await svc.getAgentSdkCatalog({})).toEqual({ fetchedAt: 0, models: [] });
  });

  test("returns the persisted snapshot and warms the cache", async () => {
    const h = makeConnHarness(await freshDb());
    const models = [makeAgentSdkModel({ alias: "sonnet" })];
    await writeAgentSdkCatalogSnapshot(h.ctx.db, { fetchedAt: h.clock.now(), models });
    __resetAgentSdkModelCache();
    const svc = createConnectionService(h.ctx);

    const snapshot = await svc.getAgentSdkCatalog({});

    expect(snapshot.models).toEqual(models);
    expect(getCachedAgentSdkModels(h.clock.now())).toEqual(models); // warmed by the read
  });
});
