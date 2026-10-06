// The rebuild trigger must agree with search's immutable-generation provenance check. A model/precision
// tag alone misses a width change and other resolved encoder changes, which search's generation check refuses.
// Compare the SAME concrete connection fingerprint generationIdOf uses,
// without changing its serialization or invalidating any unchanged stored generation.
//
// A task the principal has no binding for resolves to `null` — "no space": gaining a space from it asks the stored
// target whether anything moved, falling back to it moves nothing.

import type { Principal } from "@orb/contracts/identity";
import type { EmbedTargetRefusal, RoutableTask } from "@orb/contracts/inference";
import { embedDtypeOf, embedSpaceOf, servesImageVectors } from "@orb/contracts/inference";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import { connectionFingerprint } from "#kit/embedding-generation";
import { EmbedAuthError, EmbedUnreachableError, EmbedWidthUnmakeableError } from "../contract/errors.ts";
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
 *  rather than failing the write that asked. `cachedFacts` reads the server facts already cached and dials nothing. */
export async function vectorResolutionOf(
  ctx: SpaceResolveCtx,
  principal: Principal,
  task: RoutableTask,
  through: { readonly connectionId?: UserConnectionId | undefined; readonly cachedFacts?: boolean } = {},
): Promise<{ readonly space: EmbedSpace; readonly servesImages: boolean } | null> {
  const { connectionId, cachedFacts = false } = through;
  // @orb-waive caught-failure-ownership(catch): a refused resolve IS the "no space" answer this comparison
  // needs; nothing is swallowed, and a throw here would fail a connection write over an unrelated task.
  try {
    const { resolved } = await ctx.runtime.resolve({
      task,
      principal,
      ...(connectionId === undefined ? {} : { connectionId }),
      ...(cachedFacts ? { cachedFacts } : {}),
    });
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
async function vectorSpaceOf(ctx: SpaceResolveCtx, principal: Principal, task: RoutableTask, connectionId?: UserConnectionId): Promise<EmbedSpace | null> {
  return (await vectorResolutionOf(ctx, principal, task, { connectionId }))?.space ?? null;
}

/** Did one task's space move? Encoder identity or width — the trigger's whole condition, in one place. */
function spaceMoved(before: EmbedSpace | null | undefined, after: EmbedSpace | null | undefined): boolean {
  return before?.fingerprint !== after?.fingerprint || before?.dim !== after?.dim;
}

/** Could this write have moved the owner's stored target? Only when a vector task now resolves to a space it did
 *  not before. A cheap filter, not the verdict: the owner's stored target decides (a re-bind of the encoder it
 *  already names moves nothing). Losing a space never counts: nothing can embed there, and the old generation stays
 *  for a later re-bind (the preview's "clearing a role deletes nothing"). */
function spacesMayMoveTarget(before: EmbedSpaces, after: EmbedSpaces): boolean {
  return VECTOR_TASKS.some((task) => (after[task] ?? null) !== null && spaceMoved(before[task], after[task]));
}

/**
 * Settle a written change that may have moved the owner's stored targets. The sync probes the new encoder before any
 * target moves; a width it does not make, or a probe it does not answer, runs `undo` and refuses the write, so the
 * index and the binding stay as they were. A sync that throws undoes the write too: a write never stays landed behind
 * an error. `undo` must restore only what this write still holds, since a newer write may have landed meanwhile.
 *
 * @throws {@link EmbedWidthUnmakeableError}, {@link EmbedUnreachableError} or {@link EmbedAuthError} after `undo`.
 */
export async function settleEmbedSpace(
  ctx: Pick<ConnectionContext, "syncEmbedTargets">,
  args: { readonly ownerId: UserId; readonly before: EmbedSpaces; readonly after: EmbedSpaces; readonly undo: () => Promise<void> },
): Promise<void> {
  if (!spacesMayMoveTarget(args.before, args.after)) {
    return;
  }
  let refused: EmbedTargetRefusal | null;
  try {
    refused = await ctx.syncEmbedTargets(args.ownerId);
  } catch (error) {
    await args.undo();
    throw error;
  }
  if (refused === null) {
    return;
  }
  await args.undo();
  throw refusalError(refused);
}

function refusalError(refused: EmbedTargetRefusal): Error {
  switch (refused.kind) {
    case "width":
      return new EmbedWidthUnmakeableError(refused);
    case "unreachable":
      return new EmbedUnreachableError();
    case "auth":
      return new EmbedAuthError();
  }
}
