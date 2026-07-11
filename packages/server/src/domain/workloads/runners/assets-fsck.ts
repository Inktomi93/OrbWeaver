// runner: assets-fsck — the read-only asset-store integrity check that RUNS AS A WORKLOAD (PD-26). Wraps
// `ctx.env.assets.fsck` (dangling rows / corrupt blobs / orphan blobs); mutates nothing. Returns the
// workload-owned `FsckReport` (the three fault counts) verbatim — the env op already projects the domain's
// richer `FsckResult` down to this shape.

import type { Runner } from "../contract/runner";

export const assetsFsckRunner: Runner<"assets-fsck"> = async (ctx, _params, report, signal) => {
  report({ message: "checking asset integrity" });
  return await ctx.env.assets.fsck({ signal });
};
