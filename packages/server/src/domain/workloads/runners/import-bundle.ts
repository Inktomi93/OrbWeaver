// runner: import-bundle — the workload-backed portability-bundle import (export-import-portability.md §3).
// Thin over `ctx.env.import.importBundle`: the route already STAGED the uploaded zip to disk (the `token`
// param names it under the staging root) and enqueued this SINGULAR run under the caller as owner; the env op
// reads that staged zip → the entity-agnostic `runBundleImport` over the registry, records the summary counts,
// and removes the staged file in a `finally`. Runs OFF the request so a 10 GiB all-blobs bundle never times
// out the HTTP upload. The `AbortSignal` (admin cancel / SIGTERM) is threaded so the driver stops between files.
//
// TARGET owner: import is a CREATE-kind — every imported row is minted UNDER `ctx.ownerId` (SINGULAR = the
// caller's own; the route stamps `ownerId = caller.userId`). Never `null` for import (the start verb guarantees
// it); the guard makes the "can't yeet ownerless rows" invariant explicit rather than importing into `system`.

import type { Runner } from "../contract/runner";

export const importBundleRunner: Runner<"import-bundle"> = async (ctx, params, report, signal) => {
  if (ctx.ownerId === null) {
    throw new Error("import-bundle: no target owner (a bundle must be scoped to the uploader)");
  }
  report({ message: "importing bundle" });
  return await ctx.env.import.importBundle({
    ownerId: ctx.ownerId,
    token: params.token,
    signal,
  });
};
