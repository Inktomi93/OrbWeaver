// verb: previewEmbedSpaceChange — would a pending embedder change move the caller to a new embedding generation,
// and what would the rebuild cover? A new generation deletes the old index at once and re-embeds it, so the pane
// asks before writing. Read-only: nothing here writes, resolves a secret into the answer, or touches another
// owner's rows.

import type { VectorScope } from "@orb/contracts/embeddings";
import { VECTOR_SCOPES_BY_TASK } from "@orb/contracts/embeddings";
import type { Principal } from "@orb/contracts/identity";
import type { UserConnection } from "@orb/contracts/inference";
import { EMBED_SPACE_FIELDS, servesImageVectors } from "@orb/contracts/inference";
import { stableStringify } from "@orb/kit/stable-stringify";
import { ConnectionNotFoundError } from "../contract/errors.ts";
import type { EmbedSpaceChange } from "../contract/params.ts";
import type { EmbedSpaceChangePreview } from "../contract/results.ts";
import type { ConnectionContext, ConnectionService } from "../contract/service.ts";
import { lookupBinding } from "../persistence/bindings.ts";
import { fetchOwnedConnection } from "../persistence/connections.ts";
import { spaceMoved, VECTOR_TASKS, vectorSpaceOf } from "../substrate/embed-space.ts";

type VectorTask = keyof typeof VECTOR_SCOPES_BY_TASK;

function isVectorTask(task: string): task is VectorTask {
  return VECTOR_TASKS.some((vectorTask) => vectorTask === task);
}

/** Does the owner's image index live in the text space? Then an `embed` change rebuilds the pictures too. */
async function imagesRideTheTextSpace(ctx: ConnectionContext, principal: Principal): Promise<boolean> {
  // @orb-waive caught-failure-ownership(catch): an unresolvable image role is the "no image embedder" answer — the captions then ride the text space, which is exactly the fact asked. Ends if this read gates a write.
  try {
    const { resolved } = await ctx.runtime.resolve({ task: "imageEmbed", principal });
    return !servesImageVectors(resolved.capability);
  } catch {
    return true;
  }
}

type BindChange = Extract<EmbedSpaceChange, { readonly kind: "bind" }>;
type UpdateChange = Extract<EmbedSpaceChange, { readonly kind: "update" }>;

async function requireOwnedRow(ctx: ConnectionContext, principal: Principal, connectionId: UpdateChange["connectionId"]): Promise<UserConnection> {
  const row = await fetchOwnedConnection(ctx.db, principal.userId, connectionId);
  if (row === null) {
    throw new ConnectionNotFoundError(connectionId);
  }
  return row;
}

/** Re-pointing a role moves its space when the row it would resolve to is a different encoder or width. */
async function bindMoves(ctx: ConnectionContext, principal: Principal, change: BindChange): Promise<readonly VectorTask[]> {
  if (change.connectionId !== null) {
    await requireOwnedRow(ctx, principal, change.connectionId);
  }
  if (!isVectorTask(change.task)) {
    return [];
  }
  const before = await vectorSpaceOf(ctx, principal, change.task);
  const after = change.connectionId === null ? null : await vectorSpaceOf(ctx, principal, change.task, change.connectionId);
  return spaceMoved(before, after) ? [change.task] : [];
}

/** Patching a row moves the space of every vector role it backs, when the patch changes an identity field. */
async function updateMoves(ctx: ConnectionContext, principal: Principal, change: UpdateChange): Promise<readonly VectorTask[]> {
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
  return bound;
}

export function createPreviewEmbedSpaceChange(ctx: ConnectionContext): ConnectionService["previewEmbedSpaceChange"] {
  return async ({ principal, change }): Promise<EmbedSpaceChangePreview> => {
    const tasks = change.kind === "bind" ? await bindMoves(ctx, principal, change) : await updateMoves(ctx, principal, change);
    const scopes: VectorScope[] = tasks.flatMap((task) => [...VECTOR_SCOPES_BY_TASK[task]]);
    if (tasks.includes("embed") && !tasks.includes("imageEmbed") && (await imagesRideTheTextSpace(ctx, principal))) {
      scopes.push("images");
    }
    const counts = await ctx.countOwnedVectors(principal.userId);
    const stored = {
      cards: scopes.includes("cards") ? counts.cards : 0,
      memory: scopes.includes("memory") ? counts.memory : 0,
      documents: scopes.includes("documents") ? counts.documents : 0,
      images: scopes.includes("images") ? counts.images : 0,
    };
    return { reindex: tasks.length > 0, stored, embedCalls: stored.cards + stored.memory + stored.documents + stored.images };
  };
}
