// runner: index — the parameterized embeddings reindex (the ONE vector write path's catch-up sweep).
// COLLAPSES the former `embed-corpus` + `embed-assets` kinds into one kind parameterized by `source`:
//   • `text`  → the corpus/text pass  (character cards + chat-block memory) via `ctx.env.embeddings.embedCorpus`
//   • `image` → the asset/image pass  (avatars)                            via `ctx.env.embeddings.embedAssets`
//   • `all`   → BOTH, folded into one atomic "reindex everything for a new embed model" result.
// The collapse is at the WORKLOAD-KIND level ONLY — it still calls the SAME per-source embeddings ops (the
// embeddings service is untouched). Concurrency is preserved by the single-active lock keying on (kind,
// source, owner): a `text` reindex and an `image` reindex hold different slots and run at once, while two
// same-source runs are single-active. `force` re-embeds matched rows (else a resumable skip of already-
// embedded ones). PROJECTS the op counts into the workload-owned `EmbedPassResult` (the adapter discipline).

import type { Runner } from "../contract/runner";

export const indexRunner: Runner<"index"> = async (ctx, params, report, signal) => {
  const force = params.force ?? false;
  const { ownerId, env } = ctx;
  let embedded = 0;
  let skipped = 0;
  // `text` and `image` are both run for `source: "all"` (the atomic reindex-everything pass).
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
