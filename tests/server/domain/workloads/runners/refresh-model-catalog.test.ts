// Runner test: refresh-model-catalog — wraps connection.refreshCatalogSnapshot (counts only), projects
// CatalogRefreshResult.

import { describe, vi } from "vitest";
import { refreshModelCatalogRunner } from "../../../../../packages/server/src/domain/workloads/runners/refresh-model-catalog.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("refresh-model-catalog runner", () => {
  test("refreshes the catalog and projects the model count", async () => {
    const env = fakeEnv();
    const result = await refreshModelCatalogRunner(
      makeRunnerContext(env),
      {},
      vi.fn(),
      new AbortController().signal,
    );
    expect(env.connection.refreshCatalogSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ models: 99 });
  });
});
