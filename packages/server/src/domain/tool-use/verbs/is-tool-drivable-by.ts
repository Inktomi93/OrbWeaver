// verb: isToolDrivableBy — the TEST half of direct-drive reachability (the enumeration half is
// `list-drivable-tool-names.ts`; both are thin readers over the ONE predicate in `substrate/reachability.ts`).
//
// Two callers, two very different meanings for the SAME false, which is why this is a plain boolean and not a
// typed refusal — the caller owns what a `false` means:
//   • automation's `createRule`/`updateRule` MINT gate: false ⇒ a typed, user-visible refusal. A rule that
//     names a tool its author cannot drive must never be STORED; the boot-fatal posture of a first-party
//     registry moves to the mint for a contributor one (D146-b: never fatal to the process, always fatal to
//     the one thing that got it wrong).
//   • the per-fire PAUSE check (D146-d): false ⇒ the rule pauses. It passed the mint gate once, so a false
//     here means the contributor went away — a normal user action, not a fault, and never an error budget.
//
// Deliberately NOT `listDrivableToolNames(user).includes(name)`: this is the security predicate on the fire path and
// it reads as one (an O(1) keyed lookup, no intermediate array), and spelling it out is what keeps the two
// call sites from each inventing their own `role === "plugin"`-shaped comparison.

import type { UserId } from "@orb/kit/ids";
import type { ToolRegistry } from "../contract/results.ts";
import { toolRegistryKey } from "../substrate/partition.ts";
import { isDirectDrivableBy } from "../substrate/reachability.ts";

export function createIsToolDrivableBy(registry: ToolRegistry): (name: string, userId: UserId) => boolean {
  return (name: string, userId: UserId): boolean => {
    // Keyed straight onto THIS user's shelf (#677) — not `lookupForDriver`, which falls back to the first-party
    // partition, and a builtin is never direct-drivable. So the lookup itself already answers "is this one of
    // yours"; `isDirectDrivableBy` stays as the belt that states the policy (and that a future third
    // `ToolSource` landing on a user's shelf must still satisfy).
    const entry = registry.get(toolRegistryKey(userId, name));
    return entry !== undefined && isDirectDrivableBy(entry, userId);
  };
}
