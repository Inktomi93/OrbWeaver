// Runner test: refresh-model-catalog — wraps connection.refreshCatalogSnapshot (counts only), projects
// CatalogRefreshResult.

import { describe, vi } from "vitest";
import { refreshModelCatalogRunner } from "../../../../../packages/server/src/domain/workloads/runners/refresh-model-catalog.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("refresh-model-catalog runner", () => {
  test("refreshes the catalog and projects the model count", async () => {
    const env = fakeEnv();
    const result = await refreshModelCatalogRunner(makeRunnerContext(env), {}, vi.fn(), new AbortController().signal);
    expect(env.connection.refreshCatalogSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ models: 99, agentSdkModels: 3 });
  });

  test("passes a failed lane's null count through (best-effort fan-out: null ≠ 0)", async () => {
    // The env's fan-out reports `null` for a lane that could not refresh (stale snapshot served); the
    // runner projects it verbatim — null must survive as null, not collapse to 0.
    const env = fakeEnv({
      connection: {
        refreshCatalogSnapshot: vi.fn(async (_args: { signal: AbortSignal }) => ({
          models: 99,
          agentSdkModels: null,
        })),
      },
    });
    const result = await refreshModelCatalogRunner(makeRunnerContext(env), {}, vi.fn(), new AbortController().signal);
    expect(result).toEqual({ models: 99, agentSdkModels: null });
  });
});
