// The rebuild trigger must agree with search's immutable-generation provenance check. A model/precision
// tag alone misses a width change and other resolved encoder changes, which search's generation check refuses.
// Compare the SAME concrete connection fingerprint generationIdOf uses,
// without changing its serialization or invalidating any unchanged stored generation.
//
// A task the principal has no binding for resolves to `null` — "no space": gaining a space from it rebuilds,
// falling back to it rebuilds nothing.

import type { Principal } from "@orb/contracts/identity";
import type { RoutableTask } from "@orb/contracts/inference";
import { embedDtypeOf, embedSpaceOf, servesImageVectors } from "@orb/contracts/inference";
import type { UserConnectionId } from "@orb/kit/ids";
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
    VECTOR_TASKS.map(async (task): Promise<readonly [RoutableTask, EmbedSpace | null]> => [task, await vectorSpaceOf(ctx, principal, task)]),
  );
  return Object.fromEntries(entries);
}

/** One vector task's space and whether its encoder embeds pixels, through the bound connection or, when
 *  `connectionId` names one, through that row as if it were bound. A resolve REFUSAL is a legitimate reading of
 *  "no space" — an unbound, unservable or unfundable task has no vectors to strand — so it folds to `null`
 *  rather than failing the write that asked. */
export async function vectorResolutionOf(
  ctx: SpaceResolveCtx,
  principal: Principal,
  task: RoutableTask,
  connectionId?: UserConnectionId,
): Promise<{ readonly space: EmbedSpace; readonly servesImages: boolean } | null> {
  // @orb-waive caught-failure-ownership(catch): a refused resolve IS the "no space" answer this comparison
  // needs; nothing is swallowed, and a throw here would fail a connection write over an unrelated task.
  try {
    const { resolved } = await ctx.runtime.resolve({ task, principal, ...(connectionId === undefined ? {} : { connectionId }) });
    if (resolved.capability.kind !== "embedding") {
      return null;
    }
    return {
      space: {
        fingerprint: connectionFingerprint(resolved),
        model: embedSpaceOf(resolved.model, embedDtypeOf(resolved.capability)),
        dim: resolved.capability.embedding.dims,
      },
      servesImages: servesImageVectors(resolved.capability),
    };
  } catch {
    return null;
  }
}

/** One vector task's space — {@link vectorResolutionOf} without the pixel question. */
export async function vectorSpaceOf(
  ctx: SpaceResolveCtx,
  principal: Principal,
  task: RoutableTask,
  connectionId?: UserConnectionId,
): Promise<EmbedSpace | null> {
  return (await vectorResolutionOf(ctx, principal, task, connectionId))?.space ?? null;
}

/** Did one task's space move? Encoder identity or width — the trigger's whole condition, in one place. */
export function spaceMoved(before: EmbedSpace | null | undefined, after: EmbedSpace | null | undefined): boolean {
  return before?.fingerprint !== after?.fingerprint || before?.dim !== after?.dim;
}

/** Did any vector task move ONTO a space its corpus must be rebuilt in? Losing a space never counts: nothing can
 *  embed there, and the old generation stays for a later re-bind (the preview's "clearing a role deletes nothing"). */
export function spacesNeedRebuild(before: EmbedSpaces, after: EmbedSpaces): boolean {
  return VECTOR_TASKS.some((task) => (after[task] ?? null) !== null && spaceMoved(before[task], after[task]));
}
