// @subject tests/support/node/corpus-chat-lifecycle.ts
// @subject tests/support/node/corpus-chat-wire.ts
// @subject tests/support/node/corpus-imagery.ts
import { assertReferentialIntegrity, closeDb } from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { CHAT_OP_CODES } from "@orb/server/domain/chat";
import { seedCorpusActors } from "./corpus-actors.ts";
import { seedCorpusChatLifecycle } from "./corpus-chat-lifecycle.ts";
import { CORPUS_CHAT_MODEL, CORPUS_CHAT_REPLY, corpusImageryPhysicalBytes, createCorpusChatWire } from "./corpus-chat-wire.ts";
import { CORPUS_IMAGE_MODEL, seedCorpusImagery } from "./corpus-imagery.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "./corpus-provider.ts";
import { freshHeldDb } from "./db.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

test("native chat lifecycle preserves imported canon, exact reactions/spend/refusal and physically held owner, deferred and handoff snapshots", async () => {
  const wire = createCorpusChatWire();
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_CHAT_MODEL, CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: CORPUS_CHAT_REPLY,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: wire.completion,
  });
  const heldDb = await freshHeldDb();
  await using dbLifetime = new AsyncDisposableStack();
  dbLifetime.defer(() => closeDb(heldDb.db));
  await using root = await createServerHarness({ db: heldDb.db, providerFetch: wire.wrap(physical.execute) });
  const actors = await seedCorpusActors(root);
  const result = await seedCorpusChatLifecycle(root, wire, actors.secondUserId, heldDb);
  const imported = result.imported;
  expect(imported.imported.outcome).toMatchObject({ ok: true, created: true });
  expect(imported.imported.claims.map((row) => row.chatId)).toEqual(imported.imported.outcome.memoryChatIds);
  expect(imported.imported.injections).toMatchObject([{ ...imported.injection, chatId: imported.imported.outcome.memoryChatIds?.[0] }]);
  expect(imported.imported.attachments.map((row) => [row.assetId, row.origin])).toEqual([[imported.asset.assetId, "attached"]]);
  expect(imported.restored.messages.map((message) => message.content)).toEqual(imported.turn.messages.map((message) => message.content));
  expect(imported.repeated).toMatchObject({ outcome: { ok: true, created: false }, claims: [], injections: [], attachments: [] });
  expect(imported.foreign).toMatchObject({ outcome: { ok: false }, claims: [], injections: [], attachments: [] });
  expect(imported.foreign.outcome.error).toContain("no character on this account matches this chat");
  expect(imported.afterForeign).toEqual(imported.beforeForeign);
  expect(imported.whole.segmentIndex).toBeNull();
  expect(imported.segment.segmentIndex).toBe(0);
  expect(imported.segment.segmentSnippet).toBe(CORPUS_CHAT_REPLY);
  expect(imported.removed).toBe(false);
  expect(imported.remaining).toEqual([imported.segment]);
  expect(imported.reactions.groups).toMatchObject([
    { segmentIndex: 0, segmentSnippet: CORPUS_CHAT_REPLY, reactorParticipantIds: [imported.segment.reactorParticipantId] },
  ]);
  expect(result.compacted.compacted).toMatchObject({ updated: true, summary: CORPUS_CHAT_REPLY });
  expect(result.compacted.spend).toHaveLength(1);
  expect(result.compacted.spend[0]).toMatchObject({ ownerId: root.ownerId });
  expect(result.compacted.spend[0]?.costUsd).toBeGreaterThan(0);
  expect(result.compacted.repeated).toEqual({ ...result.compacted.compacted, updated: false });
  expect(result.compacted.repeatedSpend).toEqual(result.compacted.spend);
  expect(result.compacted.refusal).toBe(CHAT_OP_CODES.emptyGeneration);
  expect(result.compacted.observations).toMatchObject([
    {
      chatId: result.compacted.refusedRoom.room.chat.id,
      funderUserId: root.ownerId,
      connectionId: result.connection.id,
      model: CORPUS_CHAT_MODEL,
      tokensIn: 40,
      tokensOut: 0,
    },
  ]);
  expect(result.compacted.canon.messages.map((message) => message.role)).toEqual(["user"]);
  expect(result.held.during?.locks.map((row) => row.chatId)).toEqual([result.held.room.chat.id]);
  expect(result.held.during?.stream).toEqual([]);
  expect(result.held.foreignRefusal).toBe(CHAT_OP_CODES.notTurnOwner);
  expect(result.held.turn.aborted).toBe(false);
  expect(result.held.completed.locks).toEqual([]);
  expect(result.held.stream.map((row) => row.delta).join("")).toBe(CORPUS_CHAT_REPLY);
  expect(result.held.completed.stream.map((row) => row.delta).join("")).toBe(CORPUS_CHAT_REPLY);
  const assistant = result.held.turn.messages.find((message) => message.role === "assistant");
  expect(result.held.completed.stream.every((row) => row.messageId === assistant?.id && row.generationId !== null)).toBe(true);
  expect(result.held.events.some((row) => row.event.type === "turnCompleted" && row.event.messageId === assistant?.id)).toBe(true);
  expect(result.aborted.during?.locks.map((row) => row.chatId)).toEqual([result.aborted.room.chat.id]);
  expect(result.aborted.foreignRefusal).toBe(CHAT_OP_CODES.notTurnOwner);
  expect(result.aborted.turn).toMatchObject({ aborted: true, abortReason: "user" });
  expect(result.aborted.completed.locks).toEqual([]);
  expect(result.aborted.stream).toEqual([]);
  expect(result.aborted.canon.messages.map((message) => message.role)).toEqual(["user"]);
  expect(result.handoff.submitted.messages.map((message) => [message.role, message.authorUserId])).toEqual([["user", actors.secondUserId]]);
  expect(result.handoff.deferred.locks).toEqual([]);
  expect(result.handoff.deferred.pending).toMatchObject([
    { chatId: result.handoff.room.chat.id, triggeredBy: actors.secondUserId, runAsUserId: root.ownerId, timeZone: UTC_TIME_ZONE },
  ]);
  expect(result.handoff.drained).toEqual({ ran: 1, dropped: 0 });
  expect(result.handoff.drainRepeated).toEqual({ ran: 0, dropped: 0 });
  expect(result.handoff.completed.pending).toEqual([]);
  expect(result.handoff.completed.locks).toEqual([]);
  expect(result.handoff.completed.stream.map((row) => row.delta).join("")).toBe(CORPUS_CHAT_REPLY);
  expect(result.handoff.marker).toMatchObject({
    chatId: result.handoff.room.chat.id,
    acceptedByUserId: actors.secondUserId,
    actorRekeys: [{ sourceCharacterId: result.handoff.character.id }],
  });
  expect(result.handoff.accepted?.participants.filter((seat) => seat.role === "host").map((seat) => seat.userId)).toEqual([actors.secondUserId]);
  expect(result.handoff.oldHostRefusal).toBe(CHAT_OP_CODES.notTurnOwner);
  expect(result.handoff.finalMarker).toBeUndefined();
  expect(result.handoff.final.pendingHostUserId).toBeNull();
  const sourceSeat = result.handoff.room.chat.participants.find((seat) => seat.kind === "character" && seat.characterId === result.handoff.character.id);
  expect(result.handoff.acceptedSeat.id).toBe(sourceSeat?.id);
  expect(result.handoff.finalSeat.id).toBe(result.handoff.acceptedSeat.id);
  expect(result.handoff.acceptedSeat.characterId).not.toBeNull();
  expect(result.handoff.finalSeat.characterId).not.toBeNull();
  expect(result.handoff.final.participants.filter((seat) => seat.role === "host").map((seat) => seat.userId)).toEqual([actors.secondUserId]);
  expect(result.handoff.copiedCharacter.id).toBe(result.handoff.acceptedSeat.characterId);
  expect(result.handoff.finalSeat.characterId).toBe(result.handoff.copiedCharacter.id);
  expect(result.handoff.copiedCharacter.id).not.toBe(result.handoff.character.id);
  expect(wire.remaining()).toBe(0);
  expect(wire.requests).toHaveLength(5);
  await assertReferentialIntegrity(root.db);
});

test("native imagery keeps equal-clock calls separate, reuses the later cohort exactly and admits only owned native import claims", async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_IMAGE_MODEL, CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "a portrait witness stands beside the orbital loom",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: await corpusImageryPhysicalBytes(),
  });
  await using root = await createServerHarness({ providerFetch: physical.execute });
  const actors = await seedCorpusActors(root);
  const result = await seedCorpusImagery(root, actors.secondUserId);
  expect(result.first.generations).toHaveLength(2);
  expect(result.tied.generations).toHaveLength(2);
  expect(new Set([...result.first.generations, ...result.tied.generations].map((row) => row.createdAt)).size).toBe(1);
  expect(new Set([...result.first.generations, ...result.tied.generations].map((row) => row.callId)).size).toBe(2);
  expect([result.first.generations, result.tied.generations]).toContainEqual(result.equalReuse.generations);
  expect(result.equalReuse.picture.reused).toBe(true);
  expect(result.newest.generations[0]?.createdAt).toBeGreaterThan(result.tied.generations[0]?.createdAt ?? 0);
  expect(result.newerReuse.generations).toEqual(result.newest.generations);
  expect(result.newerReuse.picture).toMatchObject({ reused: true, images: result.newest.picture.images });
  expect(result.rows).toEqual(
    [...result.first.generations, ...result.tied.generations, ...result.newest.generations].toSorted((a, b) => a.id.localeCompare(b.id)),
  );
  expect(result.imported.outcome).toMatchObject({ ok: true, created: false });
  expect(result.repeated).toEqual(result.imported);
  expect(result.imported.claim).toMatchObject({ id: result.newest.generations[0]?.callId, ownerId: root.ownerId });
  expect(result.foreign).toMatchObject({ ok: false });
  expect(result.foreignClaims).toEqual([]);
  expect(result.provenance.map((row) => row?.generationId)).toEqual(result.newest.generations.map((row) => row.id));
  expect(physical.requests.filter((request) => request === "POST /v1/images/generations")).toHaveLength(3);
  await assertReferentialIntegrity(root.db);
});
