// runner: index — the parameterized embeddings reindex, parameterized by source: text (corpus/chat-block
// memory), image (avatars), or all (both, one atomic result). Single-active lock keys on (kind, source,
// owner), so a text reindex and an image reindex run concurrently while two same-source runs don't.

import type { Runner } from "../contract/runner";

export const indexRunner: Runner<"index"> = async (ctx, params, report, signal) => {
  const force = params.force ?? false;
  const { ownerId, env } = ctx;
  let embedded = 0;
  let skipped = 0;
  if (params.source === "text" || params.source === "all") {
    report({ message: force ? "re-embedding corpus (force)" : "embedding corpus" });
    const result = await env.embeddings.embedCorpus({ ownerId, force, signal });
    embedded += result.embedded;
    skipped += result.skipped;
  }
  if (params.source === "image" || params.source === "all") {
    report({ message: force ? "re-embedding assets (force)" : "embedding assets" });
    const result = await env.embeddings.embedAssets({ ownerId, force, signal });
    embedded += result.embedded;
    skipped += result.skipped;
  }
  report({ message: "indexed", current: embedded, total: embedded + skipped });
  return { embedded, skipped };
};
