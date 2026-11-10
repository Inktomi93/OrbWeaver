// Preview the prospective encoders through owned, validated rows before reporting the cost of rebuilding.
import type { VectorScope } from "@orb/contracts/embeddings";
import { VECTOR_SCOPES_BY_TASK } from "@orb/contracts/embeddings";
import type { Principal } from "@orb/contracts/identity";
import type { EmbedSpaceChangePreview, EmbedTargetRefusal, UserConnection } from "@orb/contracts/inference";
import type { UserConnectionId } from "@orb/kit/ids";
import { stableStringify } from "@orb/kit/stable-stringify";
import { ConnectionNotFoundError } from "../contract/errors.ts";
import type { EmbedSpaceChange } from "../contract/params.ts";

import type { ConnectionContext, ConnectionService } from "../contract/service.ts";
import { lookupBinding } from "../persistence/bindings.ts";
import { fetchOwnedConnection } from "../persistence/connections.ts";
import { SPACE_PATCH_FIELDS, VECTOR_TASKS, vectorResolutionOf } from "../substrate/embed-space.ts";
import { everywhereTasks } from "../substrate/kind.ts";
import { validatedPatch } from "./connections.ts";

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

async function rebindOf(ctx: ConnectionContext, principal: Principal, change: Exclude<EmbedSpaceChange, UpdateChange>): Promise<Rebind> {
  if (change.kind === "everywhere") {
    const row = await requireOwnedRow(ctx, principal, change.connectionId);
    // A row whose kind nothing held states yet may be an embedder once the write warms it, so it previews as one.
    const tasks = await everywhereTasks(ctx, row, { cachedFacts: true, coldAs: "embedding" });
    return new Map(tasks.filter(isVectorTask).map((task) => [task, row.id]));
  }
  if (change.connectionId !== null) {
    await requireOwnedRow(ctx, principal, change.connectionId);
  }
  return isVectorTask(change.task) ? new Map([[change.task, change.connectionId]]) : new Map();
}

interface Target {
  readonly task: VectorTask;
  readonly via: VectorTask;
  readonly row: UserConnection;
  readonly inPlace: UserConnectionId | null;
}

async function proposedRow(ctx: ConnectionContext, principal: Principal, change: UpdateChange): Promise<UserConnection | null> {
  const row = await requireOwnedRow(ctx, principal, change.connectionId);
  if (!SPACE_PATCH_FIELDS.some((field) => change.patch[field] !== undefined)) {
    return null;
  }
  const patch = await validatedPatch(ctx, principal.userId, row, change.patch);
  if (!SPACE_PATCH_FIELDS.some((field) => patch[field] !== undefined && stableStringify(patch[field]) !== stableStringify(row[field]))) {
    return null;
  }
  return { ...row, ...patch };
}

async function rowAfter(
  ctx: ConnectionContext,
  principal: Principal,
  point: { readonly binding: UserConnectionId | null | undefined; readonly current: UserConnectionId | null },
  edited: UserConnection | null,
): Promise<UserConnection | null> {
  const id = point.binding === undefined ? point.current : point.binding;
  if (id === null) {
    return null;
  }
  return id === edited?.id ? edited : await requireOwnedRow(ctx, principal, id);
}

async function proposedTargets(ctx: ConnectionContext, principal: Principal, change: EmbedSpaceChange): Promise<Target[]> {
  const { edited, rebind } =
    change.kind === "update"
      ? { edited: await proposedRow(ctx, principal, change), rebind: new Map<VectorTask, UserConnectionId | null>() }
      : { edited: null, rebind: await rebindOf(ctx, principal, change) };
  if (edited === null && rebind.size === 0) {
    return [];
  }
  const owner = { actorKind: "user", actorId: principal.userId } as const;
  const inPlace = async (task: VectorTask): Promise<UserConnectionId | null> => (await lookupBinding(ctx.db, owner, task))?.connectionId ?? null;
  const textNow = await inPlace("embed");
  const imageNow = await inPlace("imageEmbed");
  const textChanged = rebind.has("embed") || edited?.id === textNow;
  const imageChanged = rebind.has("imageEmbed") || edited?.id === imageNow;
  if (!(textChanged || imageChanged)) {
    return [];
  }
  const text = await rowAfter(ctx, principal, { binding: rebind.get("embed"), current: textNow }, edited);
  const image = await rowAfter(ctx, principal, { binding: rebind.get("imageEmbed"), current: imageNow }, edited);
  const targets: Target[] = [];
  if (textChanged && text !== null) {
    targets.push({ task: "embed", via: "embed", row: text, inPlace: textNow });
  }
  if (image !== null) {
    const pixels = await vectorResolutionOf(ctx, principal, "imageEmbed", { connectionId: image.id, previewConnection: image, cachedFacts: true });
    if (pixels?.servesImages === true || (pixels === null && imageChanged)) {
      targets.push({ task: "imageEmbed", via: "imageEmbed", row: image, inPlace: imageNow });
      return targets;
    }
  }
  if (text !== null) {
    targets.push({ task: "imageEmbed", via: "embed", row: text, inPlace: textNow });
  }
  return targets;
}

async function checkTargets(
  ctx: ConnectionContext,
  principal: Principal,
  targets: readonly Target[],
): Promise<{ scopes: VectorScope[]; refusal: EmbedTargetRefusal | null }> {
  const scopes: VectorScope[] = [];
  for (const target of targets) {
    const proof = await ctx.previewTargetMove({ ownerId: principal.userId, task: target.task, via: target.via, connection: target.row });
    if (proof.kind === "refused") {
      return { scopes, refusal: proof.refusal };
    }
    if (proof.kind === "move" || (proof.kind === "unresolved" && target.row.id !== target.inPlace)) {
      scopes.push(...VECTOR_SCOPES_BY_TASK[target.task]);
    }
  }
  return { scopes, refusal: null };
}

export function createPreviewEmbedSpaceChange(ctx: ConnectionContext): ConnectionService["previewEmbedSpaceChange"] {
  return async ({ principal, change }): Promise<EmbedSpaceChangePreview> => {
    const targets = await proposedTargets(ctx, principal, change);
    const { scopes, refusal } = await checkTargets(ctx, principal, targets);
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
      refusal,
      reindex: refusal === null && scopes.length > 0,
      stored,
      embedCalls: stored.cards + stored.memory + stored.documents + stored.images,
      utilityModelSet: (utility?.connectionId ?? null) !== null,
    };
  };
}
