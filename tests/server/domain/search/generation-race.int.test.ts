import { VECTOR_SCOPES_BY_TASK } from "@orb/contracts/embeddings";
import type { Db } from "@orb/db";
import { userConnections } from "@orb/db";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "vitest";
import type { EmbeddingConnectionSnapshot } from "../../../../packages/server/src/domain/embeddings/contract/service.ts";
import { markGenerationComplete } from "../../../../packages/server/src/domain/embeddings/persistence/space-state.ts";
import { resolveTargetGeneration } from "../../../../packages/server/src/domain/embeddings/substrate/generation.ts";
import { withActiveQuerySpace } from "../../../../packages/server/src/domain/search/substrate/space.ts";
import { freshDb } from "../../../support/db.ts";
import { makeFakeRoleClients } from "../../../support/factories/role-clients.ts";
import { seedUser } from "../embeddings/_support.ts";

async function connection(db: Db, ownerId: UserId, key: string): Promise<EmbeddingConnectionSnapshot> {
  const connectionId = castId<UserConnectionId>(`user_connection_query_race_${key}`);
  const clients = makeFakeRoleClients({ embedDim: 8, embedModel: `embed-${key}` });
  const resolved = await clients.resolved("embed");
  if (resolved === null) {
    throw new Error("expected embed connection");
  }
  await db.insert(userConnections).values({
    id: connectionId,
    ownerId,
    label: key,
    providerId: resolved.providerId,
    model: resolved.model,
    createdAt: 1,
    updatedAt: 1,
  });
  return {
    ...resolved,
    connectionId,
    api: "test",
    wire: "test",
    baseUrl: null,
    features: {},
    extras: null,
    transport: null,
    embed: clients.embed,
    imageEmbed: clients.imageEmbed,
  };
}

test("a promotion between query embedding and scan retries once against the new active generation", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_query_generation_race" });
  const oldConnection = await connection(db, ownerId, "old");
  const newConnection = await connection(db, ownerId, "new");
  let live = oldConnection;
  const resolve = (_ownerId: UserId, _task: "embed" | "imageEmbed", connectionId?: UserConnectionId): Promise<EmbeddingConnectionSnapshot> => {
    if (connectionId === undefined) {
      return Promise.resolve(live);
    }
    return Promise.resolve(connectionId === oldConnection.connectionId ? oldConnection : newConnection);
  };
  const oldGeneration = await resolveTargetGeneration({ db, now: () => 1, resolveEmbeddingConnection: resolve }, ownerId, "embed");
  if (oldGeneration === null) {
    throw new Error("expected old generation");
  }
  for (const scope of VECTOR_SCOPES_BY_TASK.embed) {
    await markGenerationComplete(db, { ownerId, scope, generation: oldGeneration, now: 1 });
  }

  live = newConnection;
  const newGeneration = await resolveTargetGeneration({ db, now: () => 2, resolveEmbeddingConnection: resolve }, ownerId, "embed");
  if (newGeneration === null) {
    throw new Error("expected new generation");
  }
  let calls = 0;
  const result = await withActiveQuerySpace({ db, resolveEmbeddingConnection: resolve }, ownerId, "embed", async (space) => {
    calls += 1;
    if (calls === 1) {
      for (const scope of VECTOR_SCOPES_BY_TASK.embed) {
        await markGenerationComplete(db, { ownerId, scope, generation: newGeneration, now: 2 });
      }
    }
    return space.generationId;
  });

  expect(calls).toBe(2);
  expect(result).toBe(newGeneration.id);
});
