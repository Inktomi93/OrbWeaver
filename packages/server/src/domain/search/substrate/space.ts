// Active embedding generation selection. Reads always query through the connection that produced the
// last jointly-complete corpus; missing or drifted provenance takes the named reindex refusal.

import { embedDtypeOf, embedSpaceOf, servesImageVectors } from "@orb/contracts/inference";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { EmbeddingConnectionSnapshot } from "#domain/embeddings";
import { generationIdOf, vectorSpaceFingerprint } from "#kit/embedding-generation";
import { SEARCH_NO_SPACE, SEARCH_SPACE_REINDEXING, SearchError } from "../contract/errors.ts";
import type { ActiveQuerySpace, ImageQuerySpace, SearchContext } from "../contract/service.ts";
import { readActiveGeneration, readGeneration } from "../persistence/active-space.ts";

type SpaceContext = Pick<SearchContext, "db"> & {
  readonly resolveEmbeddingConnection?: SearchContext["resolveEmbeddingConnection"] | undefined;
  readonly roleClientsFor?: ((ownerId: UserId) => Promise<RoleClients>) | undefined;
};

async function resolveConnection(
  ctx: SpaceContext,
  ownerId: UserId,
  task: "embed" | "imageEmbed",
  connectionId?: UserConnectionId,
): Promise<EmbeddingConnectionSnapshot | null> {
  if (ctx.resolveEmbeddingConnection !== undefined) {
    // @orb-waive caught-failure-ownership(catch): same leak-free collapse ownership as entry/http/plugin-frame.ts — by-id resolution fails closed and the public require*Space boundary turns null into a named SearchError. Ends if null can leave this module without that refusal.
    try {
      return await ctx.resolveEmbeddingConnection(ownerId, task, connectionId);
    } catch {
      return null;
    }
  }
  const rc = await ctx.roleClientsFor?.(ownerId);
  if (rc === undefined) {
    return null;
  }
  const resolved = await rc.resolved(task);
  return resolved === null
    ? null
    : {
        ...resolved,
        api: "compat",
        wire: "compat",
        baseUrl: null,
        features: {},
        extras: null,
        transport: null,
        embed: rc.embed,
        imageEmbed: rc.imageEmbed,
      };
}

/** Run a complete query against one active generation. A promotion may delete the selected rows between
 * remote query embedding and the SQL scan, so a changed generation discards the result and retries once. */
export async function withActiveQuerySpace<T>(
  ctx: SpaceContext,
  ownerId: UserId,
  task: "embed" | "imageEmbed",
  query: (space: ActiveQuerySpace) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const space = task === "imageEmbed" ? await requireImageQuerySpace(ctx, ownerId) : await requireQuerySpace(ctx, ownerId, task);
    const result = await query(space);
    if (space.generationId === undefined) {
      return result;
    }
    const after = await readActiveGeneration(ctx.db, ownerId, task);
    if (after?.id === space.generationId) {
      return result;
    }
  }
  throw new SearchError(SEARCH_SPACE_REINDEXING, "your embedding index changed twice during this search — retry after re-indexing settles");
}

export async function requireQuerySpace(ctx: SpaceContext, ownerId: UserId, task: "embed" | "imageEmbed"): Promise<ActiveQuerySpace> {
  const read = await readGeneration(ctx.db, ownerId, task);
  if (read.status === "moving") {
    throw new SearchError(SEARCH_SPACE_REINDEXING, "your embedding index is being rebuilt — retry after re-indexing settles");
  }
  if (read.status === "unrecorded") {
    const connection = await resolveConnection(ctx, ownerId, task);
    if (connection === null) {
      throw new SearchError(SEARCH_NO_SPACE, `no ${task} connection is bound for this user — bind one in Connections`);
    }
    return {
      fingerprint: vectorSpaceFingerprint(connection),
      model: embedSpaceOf(connection.model, embedDtypeOf(connection.capability)),
      via: task,
      connection,
    };
  }
  const active = read.generation;
  if (active.connectionId === null) {
    throw new SearchError(SEARCH_SPACE_REINDEXING, "the connection for your indexed library no longer exists — re-indexing is required");
  }
  const connection = await resolveConnection(ctx, ownerId, active.via, castId<UserConnectionId>(active.connectionId));
  if (connection === null || generationIdOf({ ownerId, task, via: active.via, connection, space: active.space }) !== active.id) {
    throw new SearchError(SEARCH_SPACE_REINDEXING, "the connection for your indexed library changed — re-indexing is required");
  }
  return { generationId: active.id, fingerprint: active.fingerprint, model: active.space, via: active.via, connection };
}

/** Compatibility read for callers that only need the settled tag. Query verbs use {@link requireQuerySpace}. */
export async function requireSpaceModel(ctx: SpaceContext, ownerId: UserId, task: "embed" | "imageEmbed"): Promise<string> {
  return (await requireQuerySpace(ctx, ownerId, task)).model;
}

export async function requireImageQuerySpace(ctx: SpaceContext, ownerId: UserId): Promise<ActiveQuerySpace> {
  const read = await readGeneration(ctx.db, ownerId, "imageEmbed");
  if (read.status === "ready") {
    return await requireQuerySpace(ctx, ownerId, "imageEmbed");
  }
  if (read.status === "moving") {
    throw new SearchError(SEARCH_SPACE_REINDEXING, "your image embedding index is being rebuilt — retry after re-indexing settles");
  }
  const image = await resolveConnection(ctx, ownerId, "imageEmbed");
  if (image !== null && servesImageVectors(image.capability)) {
    return {
      fingerprint: vectorSpaceFingerprint(image),
      model: embedSpaceOf(image.model, embedDtypeOf(image.capability)),
      via: "imageEmbed",
      connection: image,
    };
  }
  const embed = await resolveConnection(ctx, ownerId, "embed");
  if (embed === null) {
    throw new SearchError(SEARCH_NO_SPACE, "no imageEmbed or embed connection is bound for this user — bind one in Connections");
  }
  return {
    fingerprint: vectorSpaceFingerprint(embed),
    model: embedSpaceOf(embed.model, embedDtypeOf(embed.capability)),
    via: "embed",
    connection: embed,
  };
}

export async function requireImageSpace(ctx: SpaceContext, ownerId: UserId): Promise<ImageQuerySpace> {
  const space = await requireImageQuerySpace(ctx, ownerId);
  return { via: space.via, model: space.model };
}
