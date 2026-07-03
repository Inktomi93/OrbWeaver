// runner: embed-corpus — the embeddings TEXT pass (the ONE vector write path). `force` re-embeds matched
// rows; else it skips already-embedded ones (resumable). Wraps the injected `ctx.env.embeddings.embedCorpus`
// op and PROJECTS its counts into the workload-owned `EmbedPassResult`.

import type { Runner } from "../contract/runner";

export const embedCorpusRunner: Runner<"embed-corpus"> = async (ctx, params, report, signal) => {
  const force = params.force ?? false;
  report({ message: force ? "re-embedding corpus (force)" : "embedding corpus" });
  const result = await ctx.env.embeddings.embedCorpus({ force, signal });
  report({
    message: "corpus embedded",
    current: result.embedded,
    total: result.embedded + result.skipped,
  });
  return { embedded: result.embedded, skipped: result.skipped };
};
