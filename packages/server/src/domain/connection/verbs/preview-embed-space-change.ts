// verb: previewEmbedSpaceChange — would a pending embedder change move the caller's stored embedding target, and what
// would the rebuild cover? Read-only. A rebind is measured against the stored target as the sync after the write
// measures it; clearing a role deletes nothing, and a row that cannot resolve yet still warns.

import type { VectorScope } from "@orb/contracts/embeddings";
import { VECTOR_SCOPES_BY_TASK } from "@orb/contracts/embeddings";
import type { Principal } from "@orb/contracts/identity";
import type { UserConnection } from "@orb/contracts/inference";
import { EMBED_SPACE_FIELDS } from "@orb/contracts/inference";
import type { UserConnectionId } from "@orb/kit/ids";
import { stableStringify } from "@orb/kit/stable-stringify";
import { ConnectionNotFoundError } from "../contract/errors.ts";
import type { EmbedSpaceChange } from "../contract/params.ts";
import type { EmbedSpaceChangePreview } from "../contract/results.ts";
import type { ConnectionContext, ConnectionService } from "../contract/service.ts";
import { lookupBinding } from "../persistence/bindings.ts";
import { fetchOwnedConnection } from "../persistence/connections.ts";
import { VECTOR_TASKS, vectorResolutionOf } from "../substrate/embed-space.ts";
import { everywhereTasks } from "../substrate/kind.ts";

type VectorTask = keyof typeof VECTOR_SCOPES_BY_TASK;
type UpdateChange = Extract<EmbedSpaceChange, { readonly kind: "update" }>;

/** The rows a rebind would point vector roles at; `null` clears the role. */
type Rebind = ReadonlyMap<VectorTask, UserConnectionId | null>;

function isVectorTask(task: string): task is VectorTask {
  return VECTOR_TASKS.some((vectorTask) => vectorTask === task);
}

async function requireOwnedRow(ctx: ConnectionContext, principal: Principal, connectionId: UserConnectionId): Promise<UserConnection> {
  const row = await fetchOwnedConnection(ctx.db, principal.userId, connectionId);
  if (row === null) {
    throw new ConnectionNotFoundError(connectionId);
  }
  return row;
}

/** Would the stored target for `task` move onto `connectionId` through `via`? The embeddings domain's own move rule.
 *  A row that cannot resolve today still moves the target the moment it can, and that resolve deletes the old index
 *  without asking, so it warns unless it is the row already in place. */
async function targetMoves(
  ctx: ConnectionContext,
  principal: Principal,
  move: { readonly task: VectorTask; readonly via: VectorTask; readonly connectionId: UserConnectionId; readonly inPlace: UserConnectionId | null },
): Promise<boolean> {
  const verdict = await ctx.targetWouldMove({ ownerId: principal.userId, task: move.task, via: move.via, connectionId: move.connectionId });
  return verdict ?? move.connectionId !== move.inPlace;
}

async function rebindOf(ctx: ConnectionContext, principal: Principal, change: Exclude<EmbedSpaceChange, UpdateChange>): Promise<Rebind> {
  if (change.kind === "everywhere") {
    const row = await requireOwnedRow(ctx, principal, change.connectionId);
    return new Map(
      everywhereTasks(ctx, row)
        .filter(isVectorTask)
        .map((task) => [task, row.id]),
    );
  }
  if (change.connectionId !== null) {
    await requireOwnedRow(ctx, principal, change.connectionId);
  }
  return isVectorTask(change.task) ? new Map([[change.task, change.connectionId]]) : new Map();
}

interface RolePoint {
  readonly now: UserConnectionId | null;
  readonly after: UserConnectionId | null;
}

/** Would the rebind move the picture target? Pictures go through the image role when its row embeds pixels, else
 *  through the text role as captions. */
async function picturesMove(ctx: ConnectionContext, principal: Principal, roles: { readonly text: RolePoint; readonly image: RolePoint }): Promise<boolean> {
  const { text, image } = roles;
  const pixels = image.after === null ? null : await vectorResolutionOf(ctx, principal, "imageEmbed", image.after);
  if (image.after !== null && pixels?.servesImages === true) {
    return await targetMoves(ctx, principal, { task: "imageEmbed", via: "imageEmbed", connectionId: image.after, inPlace: image.now });
  }
  // An image row that cannot resolve yet may embed pixels once it can, which moves the picture target off the captions.
  if (image.after !== null && pixels === null && image.after !== image.now) {
    return true;
  }
  return text.after !== null && (await targetMoves(ctx, principal, { task: "imageEmbed", via: "embed", connectionId: text.after, inPlace: text.now }));
}

/** The scopes a rebind rebuilds: a stored target the re-pointed roles would move, measured as the target sync after the
 *  write measures it (the stored target, not the previous binding). Clearing a role resolves to no space and moves
 *  nothing. */
async function rebindScopes(ctx: ConnectionContext, principal: Principal, rebind: Rebind): Promise<readonly VectorScope[]> {
  if (rebind.size === 0) {
    return [];
  }
  const owner = { actorKind: "user", actorId: principal.userId } as const;
  const inPlace = async (task: VectorTask): Promise<UserConnectionId | null> => (await lookupBinding(ctx.db, owner, task))?.connectionId ?? null;
  const textNow = await inPlace("embed");
  const imageNow = await inPlace("imageEmbed");
  const textAfter = rebind.has("embed") ? (rebind.get("embed") ?? null) : textNow;
  const imageAfter = rebind.has("imageEmbed") ? (rebind.get("imageEmbed") ?? null) : imageNow;
  const scopes: VectorScope[] = [];
  if (
    rebind.has("embed") &&
    textAfter !== null &&
    (await targetMoves(ctx, principal, { task: "embed", via: "embed", connectionId: textAfter, inPlace: textNow }))
  ) {
    scopes.push(...VECTOR_SCOPES_BY_TASK.embed);
  }
  if (await picturesMove(ctx, principal, { text: { now: textNow, after: textAfter }, image: { now: imageNow, after: imageAfter } })) {
    scopes.push(...VECTOR_SCOPES_BY_TASK.imageEmbed);
  }
  return scopes;
}

/** Patching a row moves the space of every vector role it backs, when the patch changes an identity field. */
async function updateScopes(ctx: ConnectionContext, principal: Principal, change: UpdateChange): Promise<readonly VectorScope[]> {
  const row = await requireOwnedRow(ctx, principal, change.connectionId);
  const { patch } = change;
  if (!EMBED_SPACE_FIELDS.some((field) => patch[field] !== undefined && stableStringify(patch[field]) !== stableStringify(row[field] ?? null))) {
    return [];
  }
  const bound: VectorTask[] = [];
  for (const task of VECTOR_TASKS) {
    if (isVectorTask(task) && (await lookupBinding(ctx.db, { actorKind: "user", actorId: principal.userId }, task))?.connectionId === row.id) {
      bound.push(task);
    }
  }
  const scopes: VectorScope[] = bound.flatMap((task) => [...VECTOR_SCOPES_BY_TASK[task]]);
  // Pictures embedded through the text role move with it.
  if (bound.includes("embed") && !bound.includes("imageEmbed") && (await vectorResolutionOf(ctx, principal, "imageEmbed"))?.servesImages !== true) {
    scopes.push(...VECTOR_SCOPES_BY_TASK.imageEmbed);
  }
  return scopes;
}

export function createPreviewEmbedSpaceChange(ctx: ConnectionContext): ConnectionService["previewEmbedSpaceChange"] {
  return async ({ principal, change }): Promise<EmbedSpaceChangePreview> => {
    const scopes =
      change.kind === "update" ? await updateScopes(ctx, principal, change) : await rebindScopes(ctx, principal, await rebindOf(ctx, principal, change));
    const counts = await ctx.countOwnedVectors(principal.userId);
    const stored = {
      cards: scopes.includes("cards") ? counts.cards : 0,
      memory: scopes.includes("memory") ? counts.memory : 0,
      documents: scopes.includes("documents") ? counts.documents : 0,
      images: scopes.includes("images") ? counts.images : 0,
    };
    // "Set" is the user's binding, not reachability: a set Utility model that is briefly down still rebuilds later.
    const utility = await lookupBinding(ctx.db, { actorKind: "user", actorId: principal.userId }, "summarize");
    return {
      reindex: scopes.length > 0,
      stored,
      embedCalls: stored.cards + stored.memory + stored.documents + stored.images,
      utilityModelSet: (utility?.connectionId ?? null) !== null,
    };
  };
}
