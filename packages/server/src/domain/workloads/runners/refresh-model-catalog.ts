// runner: refresh-model-catalog — the keyless OpenRouter catalog snapshot refresh. Wraps
// `ctx.env.connection.refreshCatalogSnapshot`, which returns COUNTS ONLY (no provider entry shapes leak into
// the workloads contract). Projects into the workload-owned `CatalogRefreshResult`.

import type { Runner } from "../contract/runner";

export const refreshModelCatalogRunner: Runner<"refresh-model-catalog"> = async (
  ctx,
  _params,
  report,
  signal,
) => {
  report({ message: "refreshing model catalog" });
  const result = await ctx.env.connection.refreshCatalogSnapshot({ signal });
  return { models: result.models };
};
