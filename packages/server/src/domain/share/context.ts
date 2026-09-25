// domain/share — DI bundle. The `ShareContext` type is homed in `contract/service.ts`; this builder adds the one
// precondition check every start path runs over the injected facts, and the socket count the card shows.

import type { ShareContext, ShareServiceDeps } from "./contract/service.ts";
import { shareRefusal } from "./substrate/refusal.ts";

export function createShareContext(deps: ShareServiceDeps): ShareContext {
  return {
    ...deps,
    refusal: () => shareRefusal(deps),
    liveSocketsBesides: (userId) => deps.liveSocketCount() - deps.liveSocketCount(userId),
  };
}
