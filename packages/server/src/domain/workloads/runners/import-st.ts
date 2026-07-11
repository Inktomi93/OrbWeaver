// runner: import-st — the ST bulk import loop + the post-import stats settle. Wraps `ctx.env.import.importAll`
// (collect → import each, idempotent via importHash); on a real (non-dry) run that changed rows it then
// reconciles the stats rollups from the freshly-imported canon (the post-import settle). Projects into the
// workload-owned `MaintenanceResult`.
//
// TARGET owner: import is a CREATE-kind — every imported character/persona is minted UNDER an owner. `ctx.ownerId`
// is that target (SINGULAR = the caller's own; BULK = the owner-designated user X — the start verb REQUIRES it).
// It is never `null` for import (start guarantees it); the guard makes the "can't yeet ownerless rows" invariant
// explicit rather than silently importing into the synthetic system id.

import type { Runner } from "../contract/runner";

export const importStRunner: Runner<"import-st"> = async (ctx, params, report, signal) => {
  if (ctx.ownerId === null) {
    throw new Error("import-st: no target owner (a bulk import must designate a targetOwnerId)");
  }
  const dryRun = params.dryRun ?? false;
  report({ message: dryRun ? "import ST (dry run)" : "importing ST profiles" });
  const result = await ctx.env.import.importAll({ ownerId: ctx.ownerId, dryRun, signal });
  if (!dryRun && result.changed > 0) {
    report({ message: "reconciling stats post-import" });
    // The post-import settle scopes to the SAME target owner the import minted under (not a global rebuild).
    await ctx.env.stats.reconcileStats({ ownerId: ctx.ownerId, signal });
  }
  return { scanned: result.scanned, changed: result.changed, dryRun };
};
