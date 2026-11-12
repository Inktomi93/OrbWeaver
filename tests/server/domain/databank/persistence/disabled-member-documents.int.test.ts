// A disabled member's global documents stop crediting the rooms they sit in, in the room's panel and in its
// retrieval alike, the way a departed member's do; re-enabling the account restores both.
// @subject packages/server/src/domain/databank/persistence/scope.ts

import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusActors,
  seedRecallRoom,
} from "@orb/testkit/node/composed";

const SEARCH_K = 10;
const SWEEP_STEP_MS = 2000;

test("a disabled member's global document leaves the room's panel and retrieval, and returns once re-enabled", async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A completed corpus response.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: provider.execute });
  const { owner: host, secondUserId } = await seedCorpusActors(root);
  const member = await root.principalFor(secondUserId);
  const hostCaller = await root.internalCallerFor(host.userId);
  const memberCaller = await root.internalCallerFor(member.userId);
  const chatId = await seedRecallRoom(hostCaller);
  const invite = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  const hostAttached = await root.services.databank.createFromText({ principal: host, name: "host-attached.txt", text: "Host attached marker." });
  const memberGlobal = await root.services.databank.createFromText({ principal: member, name: "member-global.txt", text: "Member global marker." });
  await root.services.databank.attachToChat({ principal: host, chatId, documentId: hostAttached.document.id });
  await root.services.databank.attachGlobal({ principal: member, documentId: memberGlobal.document.id });
  for (const produced of [hostAttached, memberGlobal]) {
    const ingested = await root.app.databankIngest.ingestDocument({ documentId: produced.document.id, signal: new AbortController().signal });
    expect(ingested.chunksUpserted).toBeGreaterThan(0);
  }
  await root.settleBackground();
  // Both owners' embedding spaces settle through their own sweeps before the host's room is searched; the memory
  // sweep has to run too, and it refuses an owner with Memory off or nothing to fold.
  await hostCaller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "mixB", blockSize: 2, verbatimWindow: 0, maxTier: 0 } } });
  const memberRoom = await seedRecallRoom(memberCaller);
  for (const [actor, room] of [
    [hostCaller, chatId],
    [memberCaller, memberRoom],
  ] as const) {
    await actor.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
    await actor.chat.commitMessage({ chatId: room, timeZone: UTC_TIME_ZONE, content: "The first recorded scope witness." });
    await actor.chat.commitMessage({ chatId: room, timeZone: UTC_TIME_ZONE, content: "The second recorded scope witness." });
  }
  const sweeps: Awaited<ReturnType<typeof hostCaller.workloads.start>>[] = [];
  for (const actor of [hostCaller, memberCaller]) {
    sweeps.push(
      await actor.workloads.start({ input: { kind: "index", params: { source: "text" } }, mode: "singular" }),
      await actor.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" }),
      await actor.workloads.start({ input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } }, mode: "singular" }),
    );
  }
  // The box owner hosts the room, so the host's job list holds every sweep.
  await expect
    .poll(async () => {
      root.timers.advance(SWEEP_STEP_MS);
      const jobs = (await hostCaller.workloads.list()).filter((job) => sweeps.some((sweep) => sweep.id === job.id));
      expect(jobs.filter((job) => job.status === "failed" || job.status === "cancelled")).toEqual([]);
      return jobs.length === sweeps.length && jobs.every((job) => job.status === "succeeded");
    })
    .toBe(true);
  const panel = async (): Promise<string[]> => (await root.services.databank.listActiveForChat({ principal: host, chatId })).map((row) => row.id).toSorted();
  const retrieved = async (): Promise<string[]> =>
    (await root.services.search.documents({ ownerId: host.userId, scope: { chatId }, queryText: "room document markers", k: SEARCH_K }))
      .map((hit) => hit.documentId)
      .toSorted();
  const setMemberEnabled = (enabled: boolean): Promise<unknown> => root.services.admin.setEnabled({ principal: host, userId: member.userId, enabled });
  const both = [hostAttached.document.id, memberGlobal.document.id].toSorted();

  expect(await panel()).toEqual(both);
  expect(await retrieved()).toEqual(both);

  await setMemberEnabled(false);
  expect(await panel()).toEqual([hostAttached.document.id]);
  expect(await retrieved()).toEqual([hostAttached.document.id]);

  await setMemberEnabled(true);
  expect(await panel()).toEqual(both);
  expect(await retrieved()).toEqual(both);
});
