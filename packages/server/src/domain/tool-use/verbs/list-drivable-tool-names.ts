// verb: listDrivableToolNames — the ENUMERATION half of direct-drive reachability: which contributor tools
// may this user point at by name RIGHT NOW. The per-turn attach contribution is its consumer (a turn asks
// "what does this room's host have?", so it must enumerate rather than test).
//
// READ-THROUGH, NEVER CACHED, and that is the whole D146-d design: the registry is the live truth, a plugin's
// deactivation `unregister`s its tools, so a name that stops being drivable simply stops appearing. A stored
// list would go stale into exactly the failure `resolveTools` is documented to treat as OUR bug — it THROWS
// on an unknown name at attach, which would fail the whole turn. Nothing here can produce a name the registry
// does not currently hold, so attach can never hand `resolveTools` a ghost.
//
// Registration order is insertion order (a `Map`), which is stable per process; the caller may sort if the
// order is load-bearing for it. Attach does not need to: the turn's wire order is the union's order and the
// prompt cache only cares that it is stable for a given attachment set.

import type { UserId } from "@orb/kit/ids";
import type { ToolRegistry } from "../contract/results.ts";
import { isDirectDrivableBy } from "../substrate/reachability.ts";

export function createListDrivableToolNames(registry: ToolRegistry): (userId: UserId) => readonly string[] {
  return (userId: UserId): readonly string[] => {
    const names: string[] = [];
    for (const entry of registry.values()) {
      if (isDirectDrivableBy(entry, userId)) {
        names.push(entry.name);
      }
    }
    return names;
  };
}
