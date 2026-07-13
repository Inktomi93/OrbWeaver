// runner: import-st — the ST bulk import loop + the post-import stats settle. On a real (non-dry) run that
// changed rows, reconciles the stats rollups from the freshly-imported canon. ctx.ownerId is never null for
// import (start guarantees it); the guard makes "can't yeet ownerless rows" explicit.

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
    await ctx.env.stats.reconcileStats({ ownerId: ctx.ownerId, signal });
  }
  return { scanned: result.scanned, changed: result.changed, dryRun };
};
