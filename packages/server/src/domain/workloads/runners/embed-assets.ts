// runner: embed-assets — the embeddings IMAGE pass (reads originals via `cas`, embeds via the role op). A
// distinct kind from embed-corpus (single-active is per-kind, so a text reindex + an image reindex run
// concurrently — a deliberate decision, not an accident). Wraps `ctx.env.embeddings.embedAssets`.

import type { Runner } from "../contract/runner";

export const embedAssetsRunner: Runner<"embed-assets"> = async (ctx, params, report, signal) => {
  const force = params.force ?? false;
  report({ message: force ? "re-embedding assets (force)" : "embedding assets" });
  const result = await ctx.env.embeddings.embedAssets({ force, signal });
  report({
    message: "assets embedded",
    current: result.embedded,
    total: result.embedded + result.skipped,
  });
  return { embedded: result.embedded, skipped: result.skipped };
};
