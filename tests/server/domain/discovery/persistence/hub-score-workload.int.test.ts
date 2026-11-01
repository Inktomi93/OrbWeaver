// The `csls` workload scores every embedded kind, not just cards: digests and segments carry a computed hub_score
// after a run, search reads it, the digest story-time backfill runs with it, and a cancelled run stops between passes.
// @subject packages/server/src/domain/discovery/workload-contributions.ts
// @subject packages/server/src/domain/discovery/verbs/compute-hub-scores.ts

import { chatDigests, chatSegments, digestThemeAssignments } from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusConnections,
  seedRecallCorpus,
} from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { executeAdmitted } from "../../workloads/funding.fixtures.ts";

const QUERY = "orbital ledger";
const HASH_MODULUS = 1_000_003;

/** A distinct, positive vector per input text, so hub scores differ between rows instead of all being 1. */
function embeddingOf(input: string): readonly number[] {
  let hash = 7;
  for (const char of input) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % HASH_MODULUS;
  }
  return CORPUS_EMBEDDING_VECTOR.map((_, index) => Math.abs(Math.sin(hash * (index + 1))) + 0.25);
}

async function memoryWorld(): Promise<{
  readonly root: Awaited<ReturnType<typeof createServerHarness>>;
  readonly chatId: Awaited<ReturnType<typeof seedRecallCorpus>>["chatId"];
}> {
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: embeddingOf,
    chatText: "The traveller repairs the loom.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const root = await createServerHarness({ providerFetch: wire.execute });
  const owner = await root.principalFor(root.ownerId);
  const connections = await seedCorpusConnections(root, owner);
  const recall = await seedRecallCorpus(root, {
    chatConnectionId: connections.text.id,
    embedConnectionId: connections.embed.id,
    summarizeConnectionId: connections.text.id,
  });
  const caller = await root.internalCallerFor(owner.userId);
  for (let index = 0; index < 16; index += 1) {
    await caller.chat.commitMessage({
      chatId: recall.chatId,
      timeZone: UTC_TIME_ZONE,
      content: `Another authored scene ${index}: the loom keeps witness ${index * 7}.`,
    });
  }
  const memory = await root.services.workloads.start({
    caller: owner,
    mode: "singular",
    ownerId: owner.userId,
    input: { kind: "memory-backfill", params: {} },
  });
  await executeAdmitted(root, memory.id);
  const themes = await root.services.workloads.start({
    caller: owner,
    mode: "singular",
    ownerId: owner.userId,
    input: { kind: "compute-themes", params: { k: 1 } },
  });
  await executeAdmitted(root, themes.id);
  return { root, chatId: recall.chatId };
}

test("a csls run scores digests and segments, search reads the scores, and the story-time backfill runs", async () => {
  const { root, chatId } = await memoryWorld();
  await using _root = root;
  const owner = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(owner.userId);
  const digestsBefore = await root.db.select({ score: chatDigests.hubScore }).from(chatDigests);
  const segmentsBefore = await root.db.select({ score: chatSegments.hubScore }).from(chatSegments);
  expect(digestsBefore.length).toBeGreaterThan(1);
  expect(segmentsBefore.length).toBeGreaterThan(1);
  expect(digestsBefore.every((row) => row.score === null)).toBe(true);
  const search = async (): Promise<readonly number[]> => {
    const result = await caller.search.search({ query: QUERY, over: "digests", scope: { kind: "chat", chatId }, topN: 20, rerank: false });
    if (result.over !== "digests") {
      throw new Error("the digests search answered another arm");
    }
    return result.hits.map((hit) => hit.score);
  };
  const scoresBefore = await search();
  expect(scoresBefore.length).toBeGreaterThan(1);

  using backfill = vi.spyOn(root.services.discovery, "backfillDigestStoryTime");
  const ref = await root.services.workloads.start({ caller: owner, mode: "singular", ownerId: owner.userId, input: { kind: "csls", params: {} } });
  await executeAdmitted(root, ref.id);

  expect(await root.services.workloads.get({ caller: owner, id: ref.id })).toMatchObject({ status: "succeeded" });
  expect((await root.db.select({ score: chatDigests.hubScore }).from(chatDigests)).every((row) => row.score !== null)).toBe(true);
  expect((await root.db.select({ score: chatSegments.hubScore }).from(chatSegments)).every((row) => row.score !== null)).toBe(true);
  expect(backfill).toHaveBeenCalledTimes(1);
  const assignments = await root.db.select({ at: digestThemeAssignments.msgMidAt }).from(digestThemeAssignments);
  expect(assignments.length).toBeGreaterThan(0);
  expect(assignments.every((row) => row.at !== null)).toBe(true);
  // The ranking signal the search reads moves once the scores are computed.
  expect(await search()).not.toEqual(scoresBefore);
});

test("a cancelled csls run stops between passes without scoring the later kinds", async () => {
  const { root } = await memoryWorld();
  await using _root = root;
  const owner = await root.principalFor(root.ownerId);
  const controller = new AbortController();
  const characters = root.services.discovery.computeCharacterHubScores.bind(root.services.discovery);
  using first = vi.spyOn(root.services.discovery, "computeCharacterHubScores").mockImplementationOnce(async (scope) => {
    const stats = await characters(scope);
    controller.abort();
    return stats;
  });
  using digests = vi.spyOn(root.services.discovery, "computeDigestHubScores");
  using segments = vi.spyOn(root.services.discovery, "computeSegmentHubScores");
  using backfill = vi.spyOn(root.services.discovery, "backfillDigestStoryTime");
  const ref = await root.services.workloads.start({ caller: owner, mode: "singular", ownerId: owner.userId, input: { kind: "csls", params: {} } });
  await executeAdmitted(root, ref.id, controller.signal);

  expect(first).toHaveBeenCalledTimes(1);
  expect(digests).not.toHaveBeenCalled();
  expect(segments).not.toHaveBeenCalled();
  expect(backfill).not.toHaveBeenCalled();
  expect((await root.db.select({ score: chatDigests.hubScore }).from(chatDigests)).every((digest) => digest.score === null)).toBe(true);
});
