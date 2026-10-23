// @subject tests/support/node/corpus-rpg-recursion.ts
// @subject tests/support/node/corpus-rpg-flight-wire.ts
// @subject tests/support/node/corpus-rpg-members.ts
// @subject tests/support/node/corpus-rpg-rounds.ts
import { CHAT_REACT_TOOL_NAME } from "@orb/contracts/chat";
import { RPG_NO_CHANGES_TOOL } from "@orb/contracts/rpg";
import { assertReferentialIntegrity } from "@orb/db";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import { CHAT_OP_CODES } from "@orb/server/domain/chat";
import { createFrozenClock } from "../iso/clock.ts";
import { createControlledTimers } from "../iso/timers.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "./corpus-provider.ts";
import {
  createRpgFlightTimers,
  createRpgFlightWire,
  RPG_DEPTH_ONE_LOCATION,
  RPG_DEPTH_TEXT,
  RPG_JOURNAL_TITLES,
  RPG_RECURSION_MODEL,
  RPG_ROUND_LOCATION,
  RPG_ROUND_MODEL,
} from "./corpus-rpg-flight-wire.ts";
import { RPG_HOST_STEERING, RPG_MEMBER_HIDDEN, RPG_MEMBER_SECRET, seedCorpusRpgMembers } from "./corpus-rpg-members.ts";
import { seedCorpusRpgRecursion } from "./corpus-rpg-recursion.ts";
import { seedCorpusRpgRounds } from "./corpus-rpg-rounds.ts";
import { CORPUS_RPG_JOURNAL_TOOL, CORPUS_RPG_SCENE_TOOL } from "./corpus-rpg-wire.ts";
import { seedCorpusActors } from "./corpus-seed.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

test("native registry recursion retains terminal state and journal calls from both actual request depths on one committed variant", async () => {
  const wire = createRpgFlightWire();
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL, RPG_RECURSION_MODEL, RPG_ROUND_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The keeper remembers the ledger.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: wire.completion,
  });
  await using root = await createServerHarness({ providerFetch: wire.wrap(physical.execute), rpgTrace: true });
  await seedCorpusActors(root);
  const result = await seedCorpusRpgRecursion(root);
  const assistant = result.turn.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("native recursive turn has no assistant identity");
  }
  expect(assistant.content).toBe(RPG_DEPTH_TEXT.join(""));
  expect(result.tracker.ambient?.location).toBe(RPG_DEPTH_ONE_LOCATION);
  expect(result.rows.journal.map((row) => [row.title, row.variantId, row.sourceMessageId])).toEqual(
    RPG_JOURNAL_TITLES.slice(0, 2).map((title) => [title, assistant.selectedVariantId, assistant.id]),
  );
  expect(result.rows.snapshots).toMatchObject([{ gameId: result.game.id, messageId: assistant.id, variantId: assistant.selectedVariantId, committed: 0 }]);
  expect(result.calls).toMatchObject([{ variantId: assistant.selectedVariantId, messageId: assistant.id, failure: null }]);
  expect(result.calls.flatMap((row) => row.calls.map((call) => call.name))).toEqual([
    CORPUS_RPG_SCENE_TOOL,
    CORPUS_RPG_JOURNAL_TOOL,
    CORPUS_RPG_SCENE_TOOL,
    CORPUS_RPG_JOURNAL_TOOL,
  ]);
  const canon = result.canon.find((row) => row.slot.id === assistant.id);
  expect(canon?.variant.tokensIn).toBe(100);
  expect(canon?.variant.tokensOut).toBe(35);
  expect(canon?.variant.toolCalls).toMatchObject([{ name: CHAT_REACT_TOOL_NAME, result: expect.stringContaining('"reacted":true') }]);
  const registryResult = canon?.variant.toolCalls?.[0]?.result;
  if (registryResult === undefined || registryResult === null) {
    throw new Error("native recursion has no executed registry result");
  }
  expect(result.reactions.groups).toHaveLength(1);
  expect(result.reactions.groups[0]?.reactorParticipantIds).toEqual(
    result.room.chat.participants.filter((seat) => seat.characterId === result.character.id).map((seat) => seat.id),
  );
  expect(wire.recursionRequests).toHaveLength(2);
  expect(wire.recursionRequests[0]).not.toContain('"role":"tool"');
  expect(wire.recursionRequests[1]).toContain('"role":"tool"');
  expect(wire.recursionRequests[1]).toContain("alreadyReacted");
  expect(wire.recursionRequests[1]).toContain(JSON.stringify(registryResult));
  expect(physical.requests.filter((request) => request === "POST /v1/chat/completions")).toHaveLength(2);
  expect(result.trace.filter((row) => row.event.phase === "flushed").map((row) => row.event)).toMatchObject([{ outcome: "wrote", droppedReason: null }]);
  await assertReferentialIntegrity(root.db);
});

test("native member and host game lifecycle preserves scoped sheets, projections, host fork lineage and offered handoff identities", async () => {
  const wire = createRpgFlightWire();
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL, RPG_RECURSION_MODEL, RPG_ROUND_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The keeper remembers the ledger.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: wire.completion,
  });
  await using root = await createServerHarness({ providerFetch: wire.wrap(physical.execute), rpgTrace: true });
  const actors = await seedCorpusActors(root);
  const recursion = await seedCorpusRpgRecursion(root);
  const result = await seedCorpusRpgMembers(root, recursion, actors.secondUserId);
  expect(result.recovery.imported.outcome.ok).toBe(true);
  expect(result.recovery.before.rpg).not.toBeNull();
  expect(result.recovery.before.rpg?.gameId).toBe(result.forkGame.id);
  expect(result.recovery.missingGame).toBeInstanceOf(DomainNotFoundError);
  expect(result.recovery.healed.rpg).toBeNull();
  expect(result.recovery.repeated).toEqual(result.recovery.healed);
  expect(result.checkpointBefore.location).toBe(`Open observatory ${RPG_MEMBER_HIDDEN}`);
  expect(result.checkpointAfter).toEqual(result.checkpointBefore);
  expect(result.hostTracker.ambient?.location).toBe(`Open observatory ${RPG_MEMBER_HIDDEN}`);
  expect(result.memberTracker.ambient?.location).toBe("Open observatory ");
  expect(JSON.stringify(result.hostTracker)).toContain(RPG_MEMBER_SECRET);
  expect(JSON.stringify(result.memberTracker)).not.toContain(RPG_MEMBER_SECRET);
  expect(JSON.stringify(result.memberJournal)).not.toContain(RPG_MEMBER_SECRET);
  expect(result.memberJournal.find((row) => row.id === result.journal.id)?.content).toBe("An open record ");
  const memberActor = result.memberTracker.actors.find((row) => row.actorRef.kind === "user" && row.actorRef.userId === actors.secondUserId);
  expect(memberActor?.sheet.attributes[result.attributeKey]).toBe(result.attributeValue);
  expect(result.configRefusal).toBeInstanceOf(DomainForbiddenError);
  expect(result.actorRefusal).toBeInstanceOf(DomainForbiddenError);
  expect(result.sheetRefusal).toBeInstanceOf(DomainForbiddenError);
  expect(result.resyncRefusal).toBeInstanceOf(DomainForbiddenError);
  expect(result.forkRefusal).toMatchObject({ code: CHAT_OP_CODES.notHost });
  expect(result.fullRefusal).toMatchObject({ code: "rpg_mode_unbuilt" });
  expect(result.detachRefusal).toMatchObject({ code: "rpg_pointer_not_dangling" });
  expect(result.forkGame.id).not.toBe(recursion.game.id);
  expect(result.forkGame.chatId).toBe(result.fork.chat.id);
  expect(result.forkRows.snapshots).toHaveLength(result.beforeFork.snapshots.length);
  expect(result.forkRows.sheets).toHaveLength(result.beforeFork.sheets.length);
  expect(result.forkRows.journal).toHaveLength(result.beforeFork.journal.length);
  expect(result.forkCheckpoints).toHaveLength(1);
  expect(result.forkCalls).toEqual([]);
  expect(result.forkTracker.ambient?.location).toBe(result.hostTracker.ambient?.location);
  const forkAssistant = result.forkMessages.messages.find((message) => message.role === "assistant");
  if (forkAssistant === undefined) {
    throw new Error("native host game fork lost the assistant variant");
  }
  expect(result.forkRows.journal.filter((row) => row.variantId !== null).map((row) => [row.title, row.variantId, row.sourceMessageId])).toEqual(
    RPG_JOURNAL_TITLES.slice(0, 2).map((title) => [title, forkAssistant.selectedVariantId, forkAssistant.id]),
  );
  expect(result.forkJournal.map((row) => row.title).toSorted()).toEqual([...RPG_JOURNAL_TITLES.slice(0, 2), result.journal.title].toSorted());
  expect(result.handedChat.participants.filter((seat) => seat.role === "host").map((seat) => seat.userId)).toEqual([actors.secondUserId]);
  expect(result.copiedCharacter.id).not.toBe(recursion.character.id);
  expect(result.handedChat.participants.find((seat) => seat.kind === "character")?.characterId).toBe(result.copiedCharacter.id);
  expect(result.handedConfig.gmPresetId).toBe(result.copiedPreset.id);
  expect(result.copiedPreset.id).not.toBe(result.preset.id);
  expect(result.handedConfig.steeringNote).toBe(RPG_HOST_STEERING);
  expect(result.oldHostRefusal).toBeInstanceOf(DomainForbiddenError);
  const sourceSheet = result.beforeFork.sheets.find((row) => row.characterId === recursion.character.id);
  const copiedSheet = result.handedRows.sheets.find((row) => row.characterId === result.copiedCharacter.id);
  if (sourceSheet === undefined || copiedSheet === undefined) {
    throw new Error("native RPG handoff lost its source or copied sheet");
  }
  expect(sourceSheet.sheet).toMatchObject({ className: "Observatory warden", level: 3 });
  expect(copiedSheet.sheet).toEqual(sourceSheet.sheet);
  expect(result.handedRows.sheets.some((row) => row.characterId === recursion.character.id)).toBe(false);
  const beforeActor = result.hostTracker.actors.find((row) => row.actorRef.kind === "character" && row.actorRef.characterId === recursion.character.id);
  const afterActor = result.handedTracker.actors.find((row) => row.actorRef.kind === "character" && row.actorRef.characterId === result.copiedCharacter.id);
  expect(beforeActor?.volatile?.inventory).toHaveLength(1);
  expect(afterActor?.volatile?.inventory).toEqual(beforeActor?.volatile?.inventory);
  expect(result.hostTracker.lockedPaths.some((path) => path.includes(recursion.character.id))).toBe(true);
  expect(result.handedTracker.lockedPaths.some((path) => path.includes(recursion.character.id))).toBe(false);
  expect(result.handedTracker.lockedPaths.some((path) => path.includes(result.copiedCharacter.id))).toBe(true);
  expect(physical.requests.filter((request) => request === "POST /v1/chat/completions")).toHaveLength(2);
  await assertReferentialIntegrity(root.db);
});

test("native post-commit round cancellation keeps its gather barrier until physical unwind while a member Stop leaves the owner's round intact", async () => {
  const wire = createRpgFlightWire();
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL, RPG_RECURSION_MODEL, RPG_ROUND_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The keeper remembers the ledger.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: wire.completion,
  });
  const clock = createFrozenClock();
  const timers = createRpgFlightTimers(createControlledTimers(clock));
  await using root = await createServerHarness({ providerFetch: wire.wrap(physical.execute), clock, timers: timers.timers, rpgTrace: true });
  const actors = await seedCorpusActors(root);
  const result = await seedCorpusRpgRounds(root, wire, timers, actors.secondUserId);
  expect(result.cancelled.turn.aborted).toBe(false);
  expect(result.cancelled.signalAborted).toBe(true);
  expect(result.cancelled.waitMs).not.toBeNull();
  expect(result.cancelled.waitMs).toBeGreaterThan(0);
  expect(result.cancelled.attemptsWhileWaiting).toBe(result.cancelled.attemptsBeforeNext);
  expect(result.cancelled.after).toEqual(result.cancelled.before);
  expect(result.cancelled.cancelledCalls).toEqual([]);
  expect(result.cancelled.nextCalls).toHaveLength(1);
  expect(result.cancelled.nextCalls.flatMap((row) => row.calls.map((call) => call.name))).toEqual([RPG_NO_CHANGES_TOOL]);
  expect(result.cancelled.trace.filter((row) => row.event.phase === "flushed").map((row) => row.event)).toMatchObject([
    { outcome: "cancelled", droppedReason: null },
    { outcome: "no-writes", droppedReason: null },
  ]);
  expect(result.foreignStop.turn.aborted).toBe(false);
  expect(result.foreignStop.signalAborted).toBe(false);
  expect(result.foreignStop.before.snapshots).toEqual([]);
  expect(result.foreignStop.after.snapshots).toHaveLength(1);
  expect(result.foreignStop.after.journal.map((row) => row.title)).toEqual([RPG_JOURNAL_TITLES[2]]);
  expect(result.foreignStop.tracker.ambient?.location).toBe(RPG_ROUND_LOCATION);
  const assistant = result.foreignStop.turn.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("native owner round has no assistant anchor");
  }
  expect(result.foreignStop.calls).toMatchObject([
    { gameId: result.foreignStop.game.id, messageId: assistant.id, variantId: assistant.selectedVariantId, failure: null },
  ]);
  expect(result.foreignStop.after.journal).toMatchObject([{ sourceMessageId: assistant.id, variantId: assistant.selectedVariantId }]);
  expect(result.foreignStop.trace.filter((row) => row.event.phase === "flushed").map((row) => row.event)).toMatchObject([
    { outcome: "wrote", droppedReason: null },
  ]);
  expect(wire.roundRequests).toHaveLength(5);
  expect(wire.attempts).toHaveLength(6);
  expect(physical.requests.filter((request) => request === "POST /v1/chat/completions")).toHaveLength(5);
  await assertReferentialIntegrity(root.db);
});
