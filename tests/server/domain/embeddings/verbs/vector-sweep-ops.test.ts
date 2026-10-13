// The production sweep completion binds one covered-owner set, never an incidental owner in the receipts.

import type { GenerationReceipt, MemoryEmbedSpace } from "@orb/contracts/embeddings";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createVectorSweepOps } from "@orb/server/domain/embeddings";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { vi } from "vitest";

test("a single-owner completion never purges a neighbor's supplied space; a bulk completion fills only covered empty owners", async (): Promise<void> => {
  const owner = mintTypeId(ID_PREFIX.user);
  const neighbor = mintTypeId(ID_PREFIX.user);
  const bystander = mintTypeId(ID_PREFIX.user);
  const generation: GenerationReceipt = { id: mintTypeId(ID_PREFIX.embedGeneration), task: "embed", via: "embed", epoch: 7, space: "frozen-space" };
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
