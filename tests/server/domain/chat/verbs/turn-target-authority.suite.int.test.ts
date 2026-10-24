// The room claim, presence and mute decide which seats a forced, natural or targeted turn may voice, without constructing domain context.
// @subject packages/server/src/domain/chat/verbs/turn.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { readRoomCanon } from "@orb/testkit/node/composed";
import { ChatNotFoundError } from "#server/domain/chat/contract/errors.ts";
import { textRoom } from "../scenario-physical.ts";
import { muteBryn, room } from "./turn-target-authority.fixtures.ts";

test("a MUTED-but-present member is still force-summonable (drives a turn voiced by them)", async () => {
  await using f = await room();
  await muteBryn(f);
  const outcome = await f.h.root.services.chat.forceCharacterTurn({ principal: f.h.owner, chatId: f.h.chatId, characterId: f.bryn.id });
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]).toMatchObject({ role: "assistant", characterId: f.bryn.id });
});

test("the SAME muted member is excluded from a `natural` auto-round (send picks only the enabled one)", async () => {
  await using f = await room();
  await muteBryn(f);
  const outcome = await f.h.root.services.chat.send({ principal: f.h.owner, chatId: f.h.chatId, content: "hi all" });
  const assistants = outcome.messages.filter(({ role }) => role === "assistant");
  expect(assistants.length).toBeGreaterThan(0);
  expect(assistants.map(({ characterId }) => characterId)).toEqual([f.aria.id]);
});

test("a member generating for a PRESENT character character succeeds (regression: the legitimate path stays open)", async () => {
  await using f = await room();
  const outcome = await f.h.root.services.chat.generate({ principal: f.member, chatId: f.h.chatId, speakerCharacterId: f.bryn.id });
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]).toMatchObject({ role: "assistant", characterId: f.bryn.id });
});

test("a member generating for a PRESENT-but-MUTED character character succeeds (mute gates arbitration, not manual targeting)", async () => {
  await using f = await room();
  await muteBryn(f);
  const outcome = await f.h.root.services.chat.generate({ principal: f.member, chatId: f.h.chatId, speakerCharacterId: f.bryn.id });
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]).toMatchObject({ role: "assistant", characterId: f.bryn.id });
});

test("abort with nothing in flight is a no-op", async () => {
  await using f = await room();
  await expect(f.h.root.services.chat.abort({ principal: f.h.owner, chatId: f.h.chatId })).resolves.toBeUndefined();
});

test("a forced first reply claims the unstarted room before its canon and accounting writes", async () => {
  await using h = await textRoom(["The forced opening."], {
    characters: [createCharacterSchema.parse({ handle: "aria", name: "aria", description: "aria has a public character card." })],
  });
  const aria = h.characters[0];
  if (aria === undefined) {
    throw new Error("the physical root did not create the character");
  }
  const listed = async (): Promise<boolean> => (await h.root.services.chat.listChats({ principal: h.owner })).items.some(({ id }) => id === h.chatId);
  expect(await listed()).toBe(false);
  expect(await h.root.services.stats.overview(h.owner.userId)).toBeNull();
  // The claim sits behind the host and seat gates: neither refusal may turn the husk into a real room.
  const stranger = await h.root.principalFor((await h.root.actor()).id);
  await expect(h.root.services.chat.forceCharacterTurn({ principal: stranger, chatId: h.chatId, characterId: aria.id })).rejects.toBeInstanceOf(
    ChatNotFoundError,
  );
  await expect(
    h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: mintTypeId(ID_PREFIX.character) }),
  ).rejects.toBeInstanceOf(ChatNotFoundError);
  expect(await listed()).toBe(false);

  const outcome = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: aria.id });

  expect(outcome).toMatchObject({ aborted: false, messages: [{ role: "assistant", characterId: aria.id, content: "The forced opening." }] });
  expect((await readRoomCanon(h.root, h.owner, h.chatId)).map(({ role }) => role)).toEqual(["assistant"]);
  expect(await listed()).toBe(true);
  const live = await h.root.services.stats.overview(h.owner.userId);
  expect(live).toMatchObject({ chats: 1, assistantTurns: 1 });
  await h.root.services.stats.reconcile(h.owner.userId);
  expect(await h.root.services.stats.overview(h.owner.userId)).toEqual(live);
});
