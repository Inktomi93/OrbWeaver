import { LOCAL_TEXT_ENCODING } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { documentChunks, embedGenerationTargets, embedSpaceState, userConnections } from "@orb/db";
import { embedRequestTimeoutMs, ProviderError } from "@orb/inference";
import type { DocumentChunkId, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { vi } from "vitest";
import type { EmbeddingConnectionSnapshot } from "../../../../../packages/server/src/domain/embeddings/contract/service.ts";
import { markGenerationComplete } from "../../../../../packages/server/src/domain/embeddings/persistence/space-state.ts";
import {
  LOCAL_ENCODER_PROBE_TIMEOUT_MS,
  probeWidth,
  resolveTargetGeneration,
} from "../../../../../packages/server/src/domain/embeddings/substrate/generation.ts";
import { freshDb } from "../../../../support/db.ts";
import { makeFakeRoleClients } from "../../../../support/factories/role-clients.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedDocument, seedUser } from "../_support.ts";

async function seedConnection(db: Db, ownerId: UserId, key: string): Promise<EmbeddingConnectionSnapshot> {
  const connectionId = castId<UserConnectionId>(`user_connection_generation_${key}`);
  const clients = makeFakeRoleClients({ embedDim: 8, embedModel: `embed-${key}` });
  const resolved = await clients.resolved("embed");
  if (resolved === null) {
    throw new Error("the embed test connection must resolve");
  }
  await db.insert(userConnections).values({
    id: connectionId,
    ownerId,
    label: `Generation ${key}`,
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

test("a new text window recipe on the same connection queues a rebuild and retires the old generation", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db);
  let connection = await seedConnection(db, ownerId, "text-recipe");
  const moved: UserId[] = [];
  const ctx = {
    db,
    now: () => 1,
    resolveEmbeddingConnection: () => Promise.resolve(connection),
    withStableEmbeddingBinding: <T>(_owner: UserId, read: () => Promise<T>): Promise<T> => read(),
    onTargetGenerationMoved: (owner: UserId): void => {
      moved.push(owner);
    },
  };
  const prior = await resolveTargetGeneration(ctx, ownerId, "embed");
  if (prior === null || connection.capability.kind !== "embedding") {
    throw new Error("the fixture must resolve an embedding generation");
  }
  expect(moved).toEqual([]);
  connection = {
    ...connection,
    capability: { ...connection.capability, embedding: { ...connection.capability.embedding, localTextEncoding: LOCAL_TEXT_ENCODING } },
  };
  const next = await resolveTargetGeneration(ctx, ownerId, "embed");
  expect(next?.id).not.toBe(prior.id);
  expect(next?.epoch).toBe(prior.epoch + 1);
  expect(moved).toEqual([ownerId]);
  expect(await markGenerationComplete(db, { ownerId, scope: "cards", generation: prior, now: 2 })).toBe(false);
  const target = await db
    .select({ generationId: embedGenerationTargets.generationId })
    .from(embedGenerationTargets)
    .where(eq(embedGenerationTargets.ownerId, ownerId));
  expect(target).toEqual([{ generationId: next?.id }]);
});

test("a slow stale resolution cannot reset a newer target or promote its generation", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_generation_target_race" });
  const oldConnection = await seedConnection(db, ownerId, "old");
  const newConnection = await seedConnection(db, ownerId, "new");
  const now = (): number => 1;

  const oldGeneration = await resolveTargetGeneration(
    {
      db,
      now,
      resolveEmbeddingConnection: () => Promise.resolve(oldConnection),
      withStableEmbeddingBinding: (_ownerId, read) => read(),
      onTargetGenerationMoved: () => undefined,
    },
    ownerId,
    "embed",
  );
  if (oldGeneration === null) {
    throw new Error("the old generation must resolve");
  }
  expect(oldGeneration.epoch).toBe(1);
  expect(await markGenerationComplete(db, { ownerId, scope: "cards", generation: oldGeneration, now: 2 })).toBe(false);
  expect(await markGenerationComplete(db, { ownerId, scope: "memory", generation: oldGeneration, now: 3 })).toBe(false);
  expect(await markGenerationComplete(db, { ownerId, scope: "documents", generation: oldGeneration, now: 4 })).toBe(true);

  const documentId = await seedDocument(db, ownerId, { id: "document_generation_shrink", text: "kept retired" });
  const oldKeptId = castId<DocumentChunkId>("document_chunk_generation_old_kept");
  const oldExtraId = castId<DocumentChunkId>("document_chunk_generation_old_extra");
  const newKeptId = castId<DocumentChunkId>("document_chunk_generation_new_kept");
  await db.insert(documentChunks).values([
    {
      id: oldKeptId,
      documentId,
      chunkIdx: 0,
      content: "kept",
      charStart: 0,
      charEnd: 4,
      embedding: new Float32Array(1024),
      contentHash: "old-kept",
      model: oldConnection.model,
      generationId: oldGeneration.id,
      dim: 1024,
    },
    {
      id: oldExtraId,
      documentId,
      chunkIdx: 1,
      content: "retired",
      charStart: 5,
      charEnd: 12,
      embedding: new Float32Array(1024),
      contentHash: "old-extra",
      model: oldConnection.model,
      generationId: oldGeneration.id,
      dim: 1024,
    },
  ]);

  const staleStarted = Promise.withResolvers<void>();
  const releaseStale = Promise.withResolvers<EmbeddingConnectionSnapshot>();
  let staleReads = 0;
  const staleResolution = resolveTargetGeneration(
    {
      db,
      now,
      withStableEmbeddingBinding: (_ownerId, read) => read(),
      onTargetGenerationMoved: () => undefined,
      resolveEmbeddingConnection: () => {
        staleReads += 1;
        if (staleReads === 1) {
          staleStarted.resolve();
          return releaseStale.promise;
        }
        return Promise.resolve(newConnection);
      },
    },
    ownerId,
    "embed",
  );
  await staleStarted.promise;

  const newGeneration = await resolveTargetGeneration(
    {
      db,
      now,
      resolveEmbeddingConnection: () => Promise.resolve(newConnection),
      withStableEmbeddingBinding: (_ownerId, read) => read(),
      onTargetGenerationMoved: () => undefined,
    },
    ownerId,
    "embed",
  );
  if (newGeneration === null) {
    throw new Error("the new generation must resolve");
  }
  expect(newGeneration.epoch).toBe(2);
  await db.insert(documentChunks).values({
    id: newKeptId,
    documentId,
    chunkIdx: 0,
    content: "kept",
    charStart: 0,
    charEnd: 4,
    embedding: new Float32Array(1024),
    contentHash: "new-kept",
    model: newConnection.model,
    generationId: newGeneration.id,
    dim: 1024,
  });

  releaseStale.resolve(oldConnection);
  await expect(staleResolution).resolves.toMatchObject({ id: newGeneration.id, epoch: 2 });

  const target = await db
    .select({ generationId: embedGenerationTargets.generationId, epoch: embedGenerationTargets.epoch })
    .from(embedGenerationTargets)
    .where(and(eq(embedGenerationTargets.ownerId, ownerId), eq(embedGenerationTargets.task, "embed")));
  expect(target).toEqual([{ generationId: newGeneration.id, epoch: 2 }]);

  expect(await markGenerationComplete(db, { ownerId, scope: "cards", generation: newGeneration, now: 2 })).toBe(false);
  expect(await markGenerationComplete(db, { ownerId, scope: "cards", generation: oldGeneration, now: 3 })).toBe(false);

  const cardCandidate = await db
    .select({ generationId: embedSpaceState.candidateGenerationId, epoch: embedSpaceState.candidateEpoch })
    .from(embedSpaceState)
    .where(and(eq(embedSpaceState.ownerId, ownerId), eq(embedSpaceState.scope, "cards")));
  expect(cardCandidate).toEqual([{ generationId: newGeneration.id, epoch: 2 }]);

  expect(await markGenerationComplete(db, { ownerId, scope: "memory", generation: newGeneration, now: 4 })).toBe(false);
  // The switch to the new target already deleted the old generation's chunks; only the rebuild's row exists.
  const beforePromotion = await db.select({ id: documentChunks.id }).from(documentChunks).where(eq(documentChunks.documentId, documentId));
  expect(beforePromotion).toEqual([{ id: newKeptId }]);
  expect(await markGenerationComplete(db, { ownerId, scope: "documents", generation: newGeneration, now: 5 })).toBe(true);

  expect(await db.select({ id: documentChunks.id }).from(documentChunks).where(eq(documentChunks.documentId, documentId))).toEqual([{ id: newKeptId }]);

  const promoted = await db
    .select({
      scope: embedSpaceState.scope,
      activeGenerationId: embedSpaceState.activeGenerationId,
      candidateGenerationId: embedSpaceState.candidateGenerationId,
      candidateEpoch: embedSpaceState.candidateEpoch,
    })
    .from(embedSpaceState)
    .where(eq(embedSpaceState.ownerId, ownerId));
  expect(promoted).toHaveLength(3);
  expect(promoted).toEqual(
    expect.arrayContaining(
      ["cards", "memory", "documents"].map((scope) => ({
        scope,
        activeGenerationId: newGeneration.id,
        candidateGenerationId: null,
        candidateEpoch: null,
      })),
    ),
  );
});

/** A text embedder on `wire` whose embed is `embed`. */
async function probeTarget(wire: string, embed: EmbeddingConnectionSnapshot["embed"]): Promise<EmbeddingConnectionSnapshot> {
  const clients = makeFakeRoleClients({ embedDim: 8, embedModel: "embed-probe" });
  const resolved = await clients.resolved("embed");
  if (resolved === null) {
    throw new Error("the embed test connection must resolve");
  }
  return { ...resolved, api: "test", wire, baseUrl: null, features: {}, extras: null, transport: null, embed, imageEmbed: clients.imageEmbed };
}

/** Run the width probe on a fake clock advanced by `ms`, and say how it ended by then. */
async function probeAfter(target: EmbeddingConnectionSnapshot, ms: number): Promise<string> {
  const settled: { outcome?: string } = {};
  // @orb-waive test-determinism(vi.useFakeTimers): the subject is the probe's timeout, a setTimeout no clock seam reaches; faking only setTimeout keeps it deterministic.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    void probeWidth(target, "embed", 8).then(
      () => {
        settled.outcome = "answered";
      },
      (error: unknown) => {
        settled.outcome = error instanceof ProviderError ? `refused ${error.kind}` : String(error);
      },
    );
    await vi.advanceTimersByTimeAsync(ms);
  } finally {
    vi.useRealTimers();
  }
  return settled.outcome ?? "still waiting";
}

/** An embed that answers only when its caller gives up. */
const NEVER_ANSWERS: EmbeddingConnectionSnapshot["embed"] = (_input, opts) =>
  new Promise((_resolve, reject) => {
    opts?.signal?.addEventListener("abort", () => reject(new ProviderError({ kind: "aborted", retryable: false, message: "aborted" })), { once: true });
  });

// A write waits on the width probe, so a remote embedder that accepts the request and never answers must not hold it.
test("a remote embedder that never answers fails the width probe at its embed request deadline, after one attempt", async () => {
  let attempts = 0;
  const target = await probeTarget("openai-compat", async (input, opts) => {
    attempts += 1;
    return await NEVER_ANSWERS(input, opts);
  });

  expect(await probeAfter(target, embedRequestTimeoutMs({}))).toBe("refused aborted");
  expect(attempts).toBe(1);
});

// A running server still loading its model answers its first embed late; the probe waits as any embed request would.
test("a remote embedder still loading its model answers the width probe", async () => {
  const modelLoadMs = 15_000;
  const target = await probeTarget(
    "openai-compat",
    (_input, opts) =>
      new Promise((resolve, reject) => {
        setTimeout(() => resolve({ vectors: [new Float32Array(8)], model: "embed-probe", usage: { promptTokens: null, totalTokens: null } }), modelLoadMs);
        opts?.signal?.addEventListener("abort", () => reject(new ProviderError({ kind: "aborted", retryable: false, message: "aborted" })), { once: true });
      }),
  );

  expect(await probeAfter(target, modelLoadMs)).toBe("answered");
});

// The built-in encoder runs in this process: a first load from cold can outlast the network bound, and it still answers.
test("the built-in encoder's slow first load is not cut short by the probe's bound", async () => {
  const coldLoadMs = 3 * embedRequestTimeoutMs({});
  const target = await probeTarget(
    "local-light",
    (_input, opts) =>
      new Promise((resolve, reject) => {
        setTimeout(() => resolve({ vectors: [new Float32Array(8)], model: "embed-probe", usage: { promptTokens: null, totalTokens: null } }), coldLoadMs);
        opts?.signal?.addEventListener("abort", () => reject(new ProviderError({ kind: "aborted", retryable: false, message: "aborted" })), { once: true });
      }),
  );

  expect(await probeAfter(target, coldLoadMs)).toBe("answered");
});

// The owner's embedder writes wait their turn behind this probe, so a built-in worker that hung must not hold them.
test("a built-in encoder that never answers fails the width probe at its own, longer bound", async () => {
  const target = await probeTarget("local-light", NEVER_ANSWERS);

  expect(await probeAfter(target, LOCAL_ENCODER_PROBE_TIMEOUT_MS)).toBe("refused aborted");
});
