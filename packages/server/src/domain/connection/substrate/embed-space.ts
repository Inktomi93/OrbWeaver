// THE PD-139a TRIGGER'S CONDITION (§10-4): what `(model[@dtype])` space each of a principal's vector tasks
// resolves to RIGHT NOW. The purge+reindex must fire on an actual SPACE change and nothing else, so the
// write verbs snapshot this before their write and compare it after.
//
// Why a resolve and not a column diff: the space is a DERIVED fact. `embedSpaceOf` folds the row's model with
// the served precision from the resolved capability, and the capability itself comes from the provider row +
// the row's `declared` overrides. So a patch that never touches `model` — re-pointing the row at another
// provider, or editing `declared` — can still move the space, while an unrelated `declared` edit moves
// nothing. Comparing the model column plus "did `declared` change at all" gets both of those wrong in
// opposite directions: it misses the first and forces a full box reindex on the second.
//
// A task the principal has no binding for resolves to `null` — "no space", which compares correctly against
// both a later binding (a change) and a later absence (no change).

import type { Principal } from "@orb/contracts/identity";
import type { RoutableTask } from "@orb/contracts/inference";
import { embedDtypeOf, embedSpaceOf } from "@orb/contracts/inference";
import type { ConnectionContext } from "../contract/service.ts";

/** The routable tasks whose binding defines a vector space. Both are `scope: "owner"` in `TASK_DEFS`. */
export const VECTOR_TASKS: readonly RoutableTask[] = ["embed", "imageEmbed"];

/** `task -> space tag`, `null` where nothing resolves. */
export type EmbedSpaces = Readonly<Record<string, string | null>>;

export async function vectorSpacesOf(ctx: Pick<ConnectionContext, "runtime">, principal: Principal): Promise<EmbedSpaces> {
  const entries = await Promise.all(VECTOR_TASKS.map(async (task): Promise<readonly [string, string | null]> => [task, await spaceFor(ctx, principal, task)]));
  return Object.fromEntries(entries);
}

/** A resolve REFUSAL is a legitimate reading of "no space" — an unbound, unservable or unfundable task has
 *  no vectors to strand — so it folds to `null` rather than failing the write that asked. */
async function spaceFor(ctx: Pick<ConnectionContext, "runtime">, principal: Principal, task: RoutableTask): Promise<string | null> {
  // @orb-waive caught-failure-ownership(catch): a refused resolve IS the "no space" answer this comparison
  // needs; nothing is swallowed, and a throw here would fail a connection write over an unrelated task.
  try {
    const { resolved } = await ctx.runtime.resolve({ task, principal });
    return embedSpaceOf(resolved.model, embedDtypeOf(resolved.capability));
  } catch {
    return null;
  }
}

/** Did any vector task's space move? The trigger's whole condition, in one place. */
export function spacesDiffer(before: EmbedSpaces, after: EmbedSpaces): boolean {
  return VECTOR_TASKS.some((task) => before[task] !== after[task]);
}
