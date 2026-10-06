import { embedGenerationTargets } from "@orb/db";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import type { EmbeddingConnectionSnapshot } from "../../../../../packages/server/src/domain/embeddings/contract/service.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId } from "../../../../support/inference-identities.ts";
import { EMBED_DIM, fakeVector, makeStoreHarness, seedUser } from "../_support.ts";

test("sync proves both changed targets before either lands; preview/snapshots stay owner-scoped and never probe", async ({ db, ids }) => {
  const owner = await seedUser(db, { id: ids.next("user") });
  const other = await seedUser(db, { id: ids.next("user") });
  const h = makeStoreHarness(db);
  const base = h.ctx.resolveEmbeddingConnection;
  let moved = false;
  let imageWidth = EMBED_DIM - 1;
  const probes: string[] = [];
  const ctx = {
    ...h.ctx,
    resolveEmbeddingConnection: async (...args: Parameters<typeof base>): Promise<EmbeddingConnectionSnapshot | null> => {
      const connection = await base(...args);
      if (connection === null || !moved) {
        return connection;
      }
      return {
        ...connection,
        model: testModelId(`new-${args[1]}`),
        embed: () => {
          probes.push(args[1]);
          return Promise.resolve({ vectors: [fakeVector(EMBED_DIM)], model: "new-embed", usage: { promptTokens: null, totalTokens: null } });
        },
        imageEmbed: () => {
          probes.push(args[1]);
          return Promise.resolve({
            vectors: [fakeVector(imageWidth)],
            model: "new-imageEmbed",
            usage: { promptTokens: null, totalTokens: null },
          });
        },
      };
    },
  };
  const svc = createEmbeddingsService(ctx);
  await svc.resolveGeneration(owner, "embed");
  await svc.resolveGeneration(owner, "imageEmbed");
  await svc.resolveGeneration(other, "imageEmbed");
  await svc.resolveGeneration(other, "embed");
  const before = await db.select().from(embedGenerationTargets).where(eq(embedGenerationTargets.ownerId, owner));
  const ownerSnapshot = await svc.targetSnapshot(owner);
  const otherSnapshot = await svc.targetSnapshot(other);
  const connection = await base(owner, "embed");
  if (connection === null) {
    throw new Error("encoder fixture required");
  }
  expect(await svc.targetWouldMove({ ownerId: owner, task: "embed", via: "embed", connectionId: connection.connectionId })).toBe(false);
  moved = true;
  expect(await svc.targetWouldMove({ ownerId: owner, task: "embed", via: "embed", connectionId: connection.connectionId })).toBe(true);
  expect(probes).toEqual([]);
  expect(await svc.syncTargetGenerations(owner)).toMatchObject({ kind: "width", task: "imageEmbed", measured: EMBED_DIM - 1 });
  expect(await db.select().from(embedGenerationTargets).where(eq(embedGenerationTargets.ownerId, owner))).toEqual(before);
  expect(await svc.targetSnapshot(owner)).toBe(ownerSnapshot);
  expect(await svc.targetSnapshot(other)).toBe(otherSnapshot);
  imageWidth = EMBED_DIM;
  await expect(svc.syncTargetGenerations(owner)).resolves.toBeNull();
  expect(await svc.targetSnapshot(owner)).not.toBe(ownerSnapshot);
  expect(await svc.targetSnapshot(other)).toBe(otherSnapshot);
  const ownerAfter = await svc.targetSnapshot(owner);
  const bulkAfter = await svc.targetSnapshot(null);
  expect(bulkAfter).toBe([ownerAfter, otherSnapshot].toSorted().join("|"));
  await expect(svc.syncTargetGenerations(other)).resolves.toBeNull();
  expect(await svc.targetSnapshot(owner)).toBe(ownerAfter);
  expect(await svc.targetSnapshot(other)).not.toBe(otherSnapshot);
  expect(await svc.targetSnapshot(null)).not.toBe(bulkAfter);
  const noBinding = createEmbeddingsService({ ...ctx, resolveEmbeddingConnection: () => Promise.resolve(null) });
  const beforeAbsent = await noBinding.targetSnapshot(owner);
  const probeCount = probes.length;
  expect(await noBinding.targetWouldMove({ ownerId: owner, task: "embed", via: "embed", connectionId: connection.connectionId })).toBeNull();
  await expect(noBinding.syncTargetGenerations(owner)).resolves.toBeNull();
  expect(await noBinding.targetSnapshot(owner)).toBe(beforeAbsent);
  expect(probes).toHaveLength(probeCount);
});
