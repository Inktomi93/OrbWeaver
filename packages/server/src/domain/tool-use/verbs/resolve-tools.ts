// verb: resolveTools — the per-turn READ surface (tool-use-design/01 §4): resolve caller-supplied
// names against the registry into the opaque ordered set both projections and execute accept.
// Resolving ONCE per turn, then projecting + executing against the SAME set, guarantees the tools the
// model saw are exactly the tools that can run. Unknown name = THROWN `ToolNotFoundError` — at attach
// time an unknown name is OUR wiring bug (registrants attach names they registered); the MODEL's
// execute-time unknown is errors-as-data instead (verbs/execute-tool-calls.ts). Order = caller order (the request
// body stays byte-stable for a given attachment list — the prompt cache cares).

import { ToolNotFoundError } from "../contract/errors";
import type { RegisteredTool, ResolvedToolSet, ToolRegistry } from "../contract/results";

export function createResolveTools(registry: ToolRegistry): (names: readonly string[]) => ResolvedToolSet {
  return (names: readonly string[]): ResolvedToolSet => {
    const entries: RegisteredTool[] = [];
    for (const name of names) {
      const entry = registry.get(name);
      if (entry === undefined) {
        throw new ToolNotFoundError(name);
      }
      entries.push(entry);
    }
    return { entries };
  };
}
