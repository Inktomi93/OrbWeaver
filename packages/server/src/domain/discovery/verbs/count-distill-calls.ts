// domain/discovery/verbs/count-distill-calls — how many model calls a distill sweep would make: one per card
// that clears the content floor, read from the same target query the sweep runs, so the two cannot disagree.

import type { DiscoveryContext } from "../context.ts";
import type { DiscoveryService } from "../contract/service.ts";
import { countCardDistillTargets } from "../persistence/card-reads.ts";

export function createCountDistillCalls(ctx: DiscoveryContext): Pick<DiscoveryService, "countDistillCalls"> {
  return {
    countDistillCalls: (scope) => countCardDistillTargets(ctx.db, scope),
  };
}
