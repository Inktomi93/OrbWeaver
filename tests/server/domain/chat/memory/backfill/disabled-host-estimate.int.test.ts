// A memory backfill estimate spends nothing on a disabled room host: the box-wide count leaves that host's room out
// and never resolves the host's embedding space, and re-enabling the host counts the room again.
// @subject packages/server/src/domain/chat/memory/backfill/estimate.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  MEMORY_BACKFILL_BLOCK_SIZE,
  memoryBackfillLines,
  seedCorpusActors,
  seedTranscript,
} from "@orb/testkit/node/composed";
import { vi } from "vitest";

// Blocks of two with no verbatim window: each room's transcript ages out whole, one summary per block.
const OWNER_LINES = 8;
const HOST_LINES = 4;

interface EstimateRoom extends AsyncDisposable {
  readonly root: ServerTestHarness;
  readonly admin: Principal;
  readonly host: Principal;
  readonly setHostEnabled: (enabled: boolean) => Promise<unknown>;
}

// The box owner cannot be disabled, so a second account hosts the room the case disables. The owner hosts a room of
// its own, so a bulk count that dropped every room would not pass for one that dropped only the disabled host's.
async function estimateRoom(): Promise<EstimateRoom> {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The keeper nods.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using construction = new AsyncDisposableStack();
  const root = construction.use(await createServerHarness({ startJobs: false, providerFetch: physical.execute }));
  const { owner: admin, secondUserId } = await seedCorpusActors(root);
  const host = await root.principalFor(secondUserId);
  const adminCaller = await root.internalCallerFor(admin.userId);
  await adminCaller.settings.updateAppSettings({
    partial: { memoryDefaults: { mode: "mixC", blockSize: MEMORY_BACKFILL_BLOCK_SIZE, verbatimWindow: 0, maxTier: 0 } },
  });
  for (const [principal, lines] of [
    [admin, OWNER_LINES],
    [host, HOST_LINES],
  ] as const) {
    const caller = await root.internalCallerFor(principal.userId);
    await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
    const card = await caller.character.create({ input: createCharacterSchema.parse({ handle: "iris", name: "iris", description: "iris keeps the ledger." }) });
    await seedTranscript(root, { ownerId: principal.userId, characterHandles: [card.handle], lines: memoryBackfillLines(lines, "Earlier") });
  }
  await root.settleBackground();
  const lifetime = construction.move();
  return {
    root,
    admin,
    host,
    setHostEnabled: (enabled) => root.services.admin.setEnabled({ principal: admin, userId: host.userId, enabled }),
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

interface BulkEstimate {
  readonly calls: number | null;
  /** The accounts whose embedding generation the estimate resolved; a resolve can width-probe that encoder. */
  readonly resolved: readonly UserId[];
}

// The box owner's confirm count for a bulk memory backfill over every chat.
async function bulkEstimate(room: EstimateRoom): Promise<BulkEstimate> {
  const caller = await room.root.internalCallerFor(room.admin.userId);
  using resolve = vi.spyOn(room.root.app.embeddings, "resolveGeneration");
  const { calls } = await caller.workloads.estimateModelCalls({ input: { kind: "memory-backfill", params: {} }, mode: "bulk" });
  return { calls, resolved: resolve.mock.calls.map(([ownerId]) => ownerId) };
}

test("a bulk estimate leaves a disabled host's room out and resolves nothing on that host, and counts it once re-enabled", async () => {
  await using room = await estimateRoom();

  await room.setHostEnabled(false);
  const disabled = await bulkEstimate(room);
  expect(disabled.calls).toBe(OWNER_LINES / MEMORY_BACKFILL_BLOCK_SIZE);
  expect(disabled.resolved).toContain(room.admin.userId);
  expect(disabled.resolved).not.toContain(room.host.userId);

  await room.setHostEnabled(true);
  const enabled = await bulkEstimate(room);
  expect(enabled.calls).toBe((OWNER_LINES + HOST_LINES) / MEMORY_BACKFILL_BLOCK_SIZE);
  expect(enabled.resolved).toContain(room.host.userId);
});
