// runner: import-bundle — thin over ctx.env.import.importBundle: the route already staged the uploaded zip
// to disk (token names it under the staging root); this runs off the request so a large all-blobs bundle
// never times out the HTTP upload. ctx.ownerId is never null for import (start guarantees it).

import type { Runner } from "../contract/runner";

export const importBundleRunner: Runner<"import-bundle"> = async (ctx, params, report, signal) => {
  if (ctx.ownerId === null) {
    throw new Error("import-bundle: no target owner (a bundle must be scoped to the uploader)");
  }
  report({ message: "importing bundle" });
  return await ctx.env.import.importBundle({
    ownerId: ctx.ownerId,
    token: params.token,
    ...(params.source !== undefined ? { source: params.source } : {}),
    signal,
  });
};
