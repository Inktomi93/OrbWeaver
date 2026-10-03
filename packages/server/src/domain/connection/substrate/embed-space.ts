// The rebuild trigger must agree with search's immutable-generation provenance check. A model/precision
// tag alone misses a width change and other resolved encoder changes, which search's generation check refuses.
// Compare the SAME concrete connection fingerprint generationIdOf uses,
// without changing its serialization or invalidating any unchanged stored generation.
//
// A task the principal has no binding for resolves to `null` — "no space", which compares correctly against
// both a later binding (a change) and a later absence (no change).

import type { Principal } from "@orb/contracts/identity";
import type { RoutableTask } from "@orb/contracts/inference";
import { embedDtypeOf, embedSpaceOf } from "@orb/contracts/inference";
import { connectionFingerprint } from "#kit/embedding-generation";
import type { EmbedSpace, EmbedSpaces } from "../contract/results.ts";
import type { ConnectionContext } from "../contract/service.ts";

interface SpaceResolveCtx {
  readonly runtime: Pick<ConnectionContext["runtime"], "resolve">;
}

/** The routable tasks whose binding defines a vector space. Both are `scope: "owner"` in `TASK_DEFS`. */
export const VECTOR_TASKS: readonly RoutableTask[] = ["embed", "imageEmbed"];

/** Resolve every vector task's space tag for `principal` RIGHT NOW — the snapshot the write verbs take
 *  before and after their write. The shape is {@link EmbedSpaces} (contract/results.ts). */
export async function vectorSpacesOf(ctx: SpaceResolveCtx, principal: Principal): Promise<EmbedSpaces> {
  const entries = await Promise.all(
    VECTOR_TASKS.map(async (task): Promise<readonly [RoutableTask, EmbedSpace | null]> => [task, await spaceFor(ctx, principal, task)]),
  );
  return Object.fromEntries(entries);
}

/** A resolve REFUSAL is a legitimate reading of "no space" — an unbound, unservable or unfundable task has
 *  no vectors to strand — so it folds to `null` rather than failing the write that asked. */
async function spaceFor(ctx: SpaceResolveCtx, principal: Principal, task: RoutableTask): Promise<EmbedSpace | null> {
  // @orb-waive caught-failure-ownership(catch): a refused resolve IS the "no space" answer this comparison
  // needs; nothing is swallowed, and a throw here would fail a connection write over an unrelated task.
  try {
    const { resolved } = await ctx.runtime.resolve({ task, principal });
    if (resolved.capability.kind !== "embedding") {
      return null;
    }
    return {
      fingerprint: connectionFingerprint(resolved),
      model: embedSpaceOf(resolved.model, embedDtypeOf(resolved.capability)),
      dim: resolved.capability.embedding.dims,
    };
  } catch {
    return null;
  }
}

/** Did any vector task's space move? The trigger's whole condition, in one place. */
export function spacesDiffer(before: EmbedSpaces, after: EmbedSpaces): boolean {
  return VECTOR_TASKS.some((task) => before[task]?.fingerprint !== after[task]?.fingerprint || before[task]?.dim !== after[task]?.dim);
}
