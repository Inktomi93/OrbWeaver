// The turn-scoped mixC rerank-degrade episode. Search can fail independently at round-level and again for
// each scoped speaker, but the chat bus must tell the user once per turn/outage episode — never once per
// recall call and never through global client coalescing. A new gathered turn constructs a new episode.

import type { MemoryRecallWarningEpisode } from "../types.ts";

export function createMemoryRecallWarningEpisode(): MemoryRecallWarningEpisode {
  let rerankUnavailable = false;
  let warned = false;
  return {
    reportRerankUnavailable: (): void => {
      rerankUnavailable = true;
    },
    takeRerankUnavailable: (): boolean => {
      if (!rerankUnavailable || warned) {
        return false;
      }
      warned = true;
      return true;
    },
  };
}
