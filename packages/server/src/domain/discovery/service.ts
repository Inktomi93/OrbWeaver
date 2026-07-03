// domain/discovery — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The
// `DiscoveryContext` is assembled at the entry root (db + the injected clock/id determinism seam + the bound
// `summarize` thunk + the injected `embeddings.writeHubScores` seam) and passed in. Each service method binds
// the context's sub-deps to the standalone `compute*`/read function (the same functions the `transport/jobs`
// runners call directly — the compute* passes stay standalone-exportable).

import type { DiscoveryContext, DiscoveryService } from "./contract/service";
import { computeDuplicatePairs as runComputeDuplicatePairs } from "./duplicates/generate";
import { readDuplicateCharacters } from "./duplicates/retrieve";
import { computeThemes as runComputeThemes } from "./themes/generate";
import { readThemes } from "./themes/retrieve";
import { createComputeHubScores } from "./verbs/compute-hub-scores";

export function createDiscoveryService(ctx: DiscoveryContext): DiscoveryService {
  const dupDeps = {
    now: ctx.now,
    newDuplicateCharacterPairId: ctx.newDuplicateCharacterPairId,
  };
  const themeDeps = {
    now: ctx.now,
    newThemeClusterId: ctx.newThemeClusterId,
    summarize: ctx.summarize,
  };

  return {
    computeDuplicatePairs: (opts) => runComputeDuplicatePairs(ctx.db, dupDeps, opts),
    duplicateCharacters: (userId, opts) => readDuplicateCharacters(ctx.db, userId, opts),
    computeThemes: (opts) => runComputeThemes(ctx.db, themeDeps, opts),
    themes: (userId, level) => readThemes(ctx.db, userId, level),
    ...createComputeHubScores(ctx),
  };
}
