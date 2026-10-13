// The production sweep completion binds one covered-owner set, never an incidental owner in the receipts.

import "@orb/testkit/node/composed-real.ts";
import type { MemoryEmbedSpace } from "@orb/contracts/embeddings";
import { createVectorSweepOps } from "@orb/server/domain/embeddings";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { vi } from "vitest";

test("a single-owner completion never purges a neighbor's supplied space; a bulk completion fills only covered empty owners", async ({
  db,
  app,
}): Promise<void> => {
  const owner = (await seedUser(db)).id;
  const neighbor = (await seedUser(db)).id;
  const bystander = (await seedUser(db)).id;
  await app.seedUserConnections(owner);
  const generation = await app.embeddings.resolveGeneration(owner, "embed");
  if (generation === null) {
    throw new Error("the seeded owner has no embedding generation");
  }
  const space: MemoryEmbedSpace = { ownerId: owner, generationId: generation.id, generationEpoch: generation.epoch, model: generation.space };
  const resolveGeneration = vi.fn<Parameters<typeof createVectorSweepOps>[0]["embeddings"]["resolveGeneration"]>(async () => generation);
  const purgeMemoryVectors = vi.fn<Parameters<typeof createVectorSweepOps>[0]["embeddings"]["purgeMemoryVectors"]>();
  const purgeDocumentVectors = vi.fn<Parameters<typeof createVectorSweepOps>[0]["embeddings"]["purgeDocumentVectors"]>();
  const listCorpusOwners = vi.fn(async () => [owner, neighbor]);
  const vacuousMemoryReceipt = vi.fn(async () => ({ ...space, ownerId: neighbor }));
  const ops = createVectorSweepOps({ embeddings: { resolveGeneration, purgeMemoryVectors, purgeDocumentVectors }, listCorpusOwners, vacuousMemoryReceipt });
  await ops.purgeMemoryVectors([space, { ...space, ownerId: bystander }], owner);
  expect(purgeMemoryVectors.mock.calls.map(([args]) => args.ownerId)).toEqual([owner]);
  expect(listCorpusOwners).not.toHaveBeenCalled();
  expect(vacuousMemoryReceipt).not.toHaveBeenCalled();
  purgeMemoryVectors.mockClear();
  await ops.purgeMemoryVectors([space, { ...space, ownerId: bystander }], null);
  expect(purgeMemoryVectors.mock.calls.map(([args]) => args.ownerId)).toEqual([owner, neighbor]);
  expect(vacuousMemoryReceipt).toHaveBeenCalledWith(neighbor);
  const receipts = await ops.beginDocumentVectorSweep(owner);
  expect(receipts).toEqual([{ ownerId: owner, generation }]);
  await ops.purgeDocumentVectors(receipts);
  expect(purgeDocumentVectors).toHaveBeenCalledWith(receipts[0]);
});
