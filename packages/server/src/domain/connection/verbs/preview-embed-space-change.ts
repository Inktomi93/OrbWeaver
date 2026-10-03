// verb: previewEmbedSpaceChange — would a pending embedder change move the caller to a new embedding generation,
// and what would the rebuild cover? A new generation deletes the old index at once and re-embeds it, so the pane
// asks before writing. Read-only: nothing here writes, resolves a secret into the answer, or touches another
// owner's rows. Clearing a role moves no generation, so it deletes nothing; a row that cannot resolve yet still warns.

import type { VectorScope } from "@orb/contracts/embeddings";
import { VECTOR_SCOPES_BY_TASK } from "@orb/contracts/embeddings";
import type { Principal } from "@orb/contracts/identity";
import type { UserConnection } from "@orb/contracts/inference";
import { EMBED_SPACE_FIELDS } from "@orb/contracts/inference";
import type { UserConnectionId } from "@orb/kit/ids";
import { stableStringify } from "@orb/kit/stable-stringify";
import { ConnectionNotFoundError } from "../contract/errors.ts";
import type { EmbedSpaceChange } from "../contract/params.ts";
import type { EmbedSpace, EmbedSpaceChangePreview } from "../contract/results.ts";
import type { ConnectionContext, ConnectionService } from "../contract/service.ts";
import { lookupBinding } from "../persistence/bindings.ts";
import { fetchOwnedConnection } from "../persistence/connections.ts";
import { spaceMoved, VECTOR_TASKS, vectorResolutionOf } from "../substrate/embed-space.ts";
import { everywhereTasks } from "../substrate/kind.ts";

type VectorTask = keyof typeof VECTOR_SCOPES_BY_TASK;
type Resolution = Awaited<ReturnType<typeof vectorResolutionOf>>;
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

/** Where the owner's pictures are embedded: through `imageEmbed` when it embeds pixels, else their caption
 *  through the text role (embeddings' `resolveImageSpace`). The role is part of the image generation's id. */
function imageSpaceOf(image: Resolution, text: Resolution): { readonly via: VectorTask; readonly space: EmbedSpace } | null {
  if (image?.servesImages === true) {
    return { via: "imageEmbed", space: image.space };
  }
  return text === null ? null : { via: "embed", space: text.space };
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

/** The scopes a rebind rebuilds: a role whose resolved space changes to another real space. */
async function rebindScopes(ctx: ConnectionContext, principal: Principal, rebind: Rebind): Promise<readonly VectorScope[]> {
  if (rebind.size === 0) {
    return [];
  }
  const resolveAfter = async (task: VectorTask, now: Resolution): Promise<Resolution> => {
    if (!rebind.has(task)) {
      return now;
    }
    const connectionId = rebind.get(task) ?? null;
    return connectionId === null ? null : await vectorResolutionOf(ctx, principal, task, connectionId);
  };
  // A row that cannot resolve today (a revoked or missing key) still moves the generation the moment it can, and that
  // resolve deletes the old index without asking. So a re-point to such a row warns; only a true unbind may not.
  const unresolvable = async (task: VectorTask, after: Resolution): Promise<boolean> => {
    const connectionId = rebind.get(task) ?? null;
    if (after !== null || connectionId === null) {
      return false;
    }
    return (await lookupBinding(ctx.db, { actorKind: "user", actorId: principal.userId }, task))?.connectionId !== connectionId;
  };
  const textNow = await vectorResolutionOf(ctx, principal, "embed");
  const imageNow = await vectorResolutionOf(ctx, principal, "imageEmbed");
  const textAfter = await resolveAfter("embed", textNow);
  const imageAfter = await resolveAfter("imageEmbed", imageNow);
  const textUnknown = await unresolvable("embed", textAfter);
  const imageUnknown = await unresolvable("imageEmbed", imageAfter);
  const scopes: VectorScope[] = [];
  if (textUnknown || (textAfter !== null && spaceMoved(textNow?.space, textAfter.space))) {
    scopes.push(...VECTOR_SCOPES_BY_TASK.embed);
  }
  const picturesNow = imageSpaceOf(imageNow, textNow);
  const picturesAfter = imageSpaceOf(imageAfter, textAfter);
  const picturesUnknown = imageUnknown || (textUnknown && picturesAfter?.via !== "imageEmbed");
  if (picturesUnknown || (picturesAfter !== null && (picturesNow?.via !== picturesAfter.via || spaceMoved(picturesNow.space, picturesAfter.space)))) {
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
  if (bound.includes("embed") && !bound.includes("imageEmbed")) {
    const pictures = imageSpaceOf(await vectorResolutionOf(ctx, principal, "imageEmbed"), await vectorResolutionOf(ctx, principal, "embed"));
    if (pictures?.via === "embed") {
      scopes.push(...VECTOR_SCOPES_BY_TASK.imageEmbed);
    }
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
    return { reindex: scopes.length > 0, stored, embedCalls: stored.cards + stored.memory + stored.documents + stored.images };
  };
}
