// The `csls` workload scores every embedded kind, not just cards: digests and segments carry a
// computed hub_score after a run, and the story-time backfill runs with it.
// @subject packages/server/src/domain/discovery/workload-contributions.ts
// @subject packages/server/src/domain/discovery/verbs/compute-hub-scores.ts

import { chatDigests, chatSegments } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, seedCorpusConnections, seedRecallCorpus } from "@orb/testkit/node/composed";
import { executeAdmitted, physicalWire } from "../../workloads/funding.fixtures.ts";

test("a csls run scores memory digests and segments", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const owner = await root.principalFor(root.ownerId);
  const connections = await seedCorpusConnections(root, owner);
  const recall = await seedRecallCorpus(root, {
    chatConnectionId: connections.text.id,
    embedConnectionId: connections.embed.id,
    summarizeConnectionId: connections.text.id,
  });
  expect(recall.chatId).toBeDefined();
  const memory = await root.services.workloads.start({
    caller: owner,
    mode: "singular",
    ownerId: owner.userId,
    input: { kind: "memory-backfill", params: {} },
  });
  await executeAdmitted(root, memory.id);
  const digestsBefore = await root.db.select({ score: chatDigests.hubScore }).from(chatDigests);
  const segmentsBefore = await root.db.select({ score: chatSegments.hubScore }).from(chatSegments);
  expect(digestsBefore.length).toBeGreaterThan(0);
  expect(segmentsBefore.length).toBeGreaterThan(0);
  expect(digestsBefore.every((row) => row.score === null)).toBe(true);

  const ref = await root.services.workloads.start({ caller: owner, mode: "singular", ownerId: owner.userId, input: { kind: "csls", params: {} } });
  await executeAdmitted(root, ref.id);
  expect(await root.services.workloads.get({ caller: owner, id: ref.id })).toMatchObject({ status: "succeeded" });
  expect((await root.db.select({ score: chatDigests.hubScore }).from(chatDigests)).every((row) => row.score !== null)).toBe(true);
  expect((await root.db.select({ score: chatSegments.hubScore }).from(chatSegments)).every((row) => row.score !== null)).toBe(true);
});
