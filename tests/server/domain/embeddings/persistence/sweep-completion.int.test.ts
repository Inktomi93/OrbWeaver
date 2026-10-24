// Sweep completion follows the admitted row's covered owners, including empty memory scopes: each owner's
// embed_space_state row completes exactly once and document rows are preserved.
// @subject packages/server/src/domain/embeddings/verbs/vector-sweep-ops.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { GenerationReceipt } from "@orb/contracts/embeddings";
import { embedSpaceState } from "@orb/db";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { vi } from "vitest";

// The root's own manual workload driver: the engine's claim and run, with no worker racing the case.
async function executeAdmitted(root: ServerTestHarness, id: WorkloadId): Promise<void> {
  const run = root.runAdmittedWorkload;
  if (run === undefined) {
    throw new Error("the harness owns its workload execution only with startJobs: false");
  }
  await run(id, new AbortController().signal);
  expect(await root.services.workloads.get({ caller: null, id })).toMatchObject({ status: "succeeded" });
}

test("actual owned and bulk vector sweeps complete exactly their covered owners and preserve document generation receipts", async () => {
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A completed corpus response.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: wire.execute, startJobs: false });
  const owner = await root.principalFor(root.ownerId);
  const neighbor = await root.principalFor((await root.actor()).id);
  const bystander = await root.principalFor((await root.actor()).id);
  for (const principal of [owner, neighbor, bystander]) {
    await seedCorpusConnections(root, principal);
  }
  for (const principal of [owner, neighbor]) {
    await root.services.character.create({
      principal,
      input: createCharacterSchema.parse({ name: "Sweep subject", handle: "sweep-subject", description: "A genuine paragraph to embed." }),
    });
    await root.app.embeddings.embedCorpus({ ownerId: principal.userId, force: true, signal: new AbortController().signal });
  }
  await root.settleBackground();
  const coveredOwners = [owner.userId, neighbor.userId].toSorted();
  const generations = new Map<UserId, GenerationReceipt>();
  for (const principal of [owner, neighbor]) {
    const generation = await root.app.embeddings.resolveGeneration(principal.userId, "embed");
    if (generation === null) {
      throw new Error("the real corpus owner has no embedding generation");
    }
    const { id, task, via, epoch, space } = generation;
    generations.set(principal.userId, { id, task, via, epoch, space });
  }
  const caller = await root.internalCallerFor(owner.userId);
  const neighborBefore = await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, neighbor.userId));
  const bystanderBefore = await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, bystander.userId));
  const purgeMemoryVectors = vi.spyOn(root.app.embeddings, "purgeMemoryVectors");
  const purgeDocumentVectors = vi.spyOn(root.app.embeddings, "purgeDocumentVectors");
  const resolveGeneration = vi.spyOn(root.app.embeddings, "resolveGeneration");

  await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  const ownedMemory = await caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" });
  // The queued job observes the live switch; the real empty-scope receipt completes only its admitted owner.
  await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: false } });
  purgeMemoryVectors.mockClear();
  await executeAdmitted(root, ownedMemory.id);
  expect(purgeMemoryVectors.mock.calls).toEqual([[{ ownerId: owner.userId, generation: generations.get(owner.userId) }]]);
  expect(await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, neighbor.userId))).toEqual(neighborBefore);
  expect(await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, bystander.userId))).toEqual(bystanderBefore);

  const neighborCaller = await root.internalCallerFor(neighbor.userId);
  await neighborCaller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: false } });
  const beforeEmptySweeps = [...wire.requests];
  const bulkMemory = await caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "bulk" });
  purgeMemoryVectors.mockClear();
  resolveGeneration.mockClear();
  await executeAdmitted(root, bulkMemory.id);
  expect(purgeMemoryVectors.mock.calls.map(([args]) => args.ownerId).toSorted()).toEqual(coveredOwners);
  expect(resolveGeneration.mock.calls.map(([ownerId]) => ownerId).toSorted()).toEqual(coveredOwners);
  for (const [args] of purgeMemoryVectors.mock.calls) {
    expect(args.generation).toEqual(generations.get(args.ownerId));
    expect(await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, args.ownerId))).toContainEqual(
      expect.objectContaining({ scope: "memory", candidateGenerationId: args.generation.id, candidateEpoch: args.generation.epoch }),
    );
  }

  for (const mode of ["singular", "bulk"] as const) {
    const documents = await caller.workloads.start({
      input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } },
      mode,
    });
    purgeDocumentVectors.mockClear();
    resolveGeneration.mockClear();
    await executeAdmitted(root, documents.id);
    const expectedOwners = mode === "singular" ? [owner.userId] : coveredOwners;
    expect(purgeDocumentVectors.mock.calls.map(([args]) => args.ownerId).toSorted()).toEqual(expectedOwners);
    expect(resolveGeneration.mock.calls.map(([ownerId]) => ownerId).toSorted()).toEqual(expectedOwners);
    for (const [args] of purgeDocumentVectors.mock.calls) {
      expect(args).toMatchObject({ generation: generations.get(args.ownerId) });
      const states = await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, args.ownerId));
      expect(states).toContainEqual(expect.objectContaining({ scope: "documents", activeGenerationId: args.generation.id }));
    }
  }
  expect(await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, bystander.userId))).toEqual(bystanderBefore);
  expect(wire.requests).toEqual(beforeEmptySweeps);
});
