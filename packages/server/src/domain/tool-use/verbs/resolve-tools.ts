// verb: resolveTools — the per-turn READ surface (D48): resolve caller-supplied
// names against the registry into the opaque ordered set both projections and execute accept.
// Resolving ONCE per turn, then projecting + executing against the SAME set, guarantees the tools the
// model saw are exactly the tools that can run. Unknown name = THROWN `ToolNotFoundError` — at attach
// time an unknown name is OUR wiring bug (registrants attach names they registered); the MODEL's
// execute-time unknown is errors-as-data instead (verbs/execute-tool-calls.ts). Order = caller order (the request
// body stays byte-stable for a given attachment list — the prompt cache cares).
//
// THE RESOLUTION IS DRIVER-SCOPED (#677). `driverUserId` is WHOSE contributor shelf a name is looked up on —
// the turn host for a chat attach (the same identity `listDrivableToolNames` enumerated the names from), the
// rule author for the `run_tool` arm. It is not the acting principal and it is not a permission check: the
// ceilings still run at invocation (`substrate/capability.ts` + the PL-C installer gate). It exists because the
// same namespaced plugin tool name legitimately belongs to N different users, so a name ALONE no longer
// identifies an entry — `substrate/partition.ts` carries the why. A name only another user installed is
// absent for this driver, which is the correct answer, not a denial: their turn, their rules, their tools.

import type { UserId } from "@orb/kit/ids";
import { ToolNotFoundError } from "../contract/errors.ts";
import type { RegisteredTool, ResolvedToolSet, ToolRegistry } from "../contract/results.ts";
import { lookupForDriver } from "../substrate/partition.ts";

export function createResolveTools(registry: ToolRegistry): (driverUserId: UserId, names: readonly string[]) => ResolvedToolSet {
  return (driverUserId: UserId, names: readonly string[]): ResolvedToolSet => {
    const entries: RegisteredTool[] = [];
    for (const name of names) {
      const entry = lookupForDriver(registry, driverUserId, name);
      if (entry === undefined) {
        throw new ToolNotFoundError(name);
      }
      entries.push(entry);
    }
    return { entries };
  };
}
