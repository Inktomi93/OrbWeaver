// The room claim, presence and mute decide which seats a forced, natural or targeted turn may voice, without constructing domain context.
// A refused send leaves an unstarted room unclaimed; only a committed line claims it.
// @subject packages/server/src/domain/chat/verbs/turn.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { createPersonaSchema } from "@orb/contracts/persona";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { AssetId, PersonaId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { makeAssetBytes, readRoomCanon } from "@orb/testkit/node/composed";
import { CHAT_OP_CODES, ChatNotFoundError } from "#server/domain/chat/contract/errors.ts";
import { textRoom } from "../scenario-physical.ts";
import { muteBryn, room } from "./turn-target-authority.fixtures.ts";

test("a MUTED-but-present member is still force-summonable (drives a turn voiced by them)", async () => {
  await using f = await room(["Hi there"]);
  await muteBryn(f);
  const outcome = await f.h.root.services.chat.forceCharacterTurn({ principal: f.h.owner, chatId: f.h.chatId, characterId: f.bryn.id });
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]).toMatchObject({ role: "assistant", characterId: f.bryn.id });
});

test("the SAME muted member is excluded from a `natural` auto-round (send picks only the enabled one)", async () => {
  await using f = await room(["Hi there"]);
  await muteBryn(f);
  const outcome = await f.h.root.services.chat.send({ principal: f.h.owner, chatId: f.h.chatId, content: "hi all" });
  const assistants = outcome.messages.filter(({ role }) => role === "assistant");
  expect(assistants.length).toBeGreaterThan(0);
  expect(assistants.map(({ characterId }) => characterId)).toEqual([f.aria.id]);
});

test("a member generating for a PRESENT character character succeeds (regression: the legitimate path stays open)", async () => {
  await using f = await room(["Hi there"]);
  const outcome = await f.h.root.services.chat.generate({ principal: f.member, chatId: f.h.chatId, speakerCharacterId: f.bryn.id });
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]).toMatchObject({ role: "assistant", characterId: f.bryn.id });
});

test("a member generating for a PRESENT-but-MUTED character character succeeds (mute gates arbitration, not manual targeting)", async () => {
  await using f = await room(["Hi there"]);
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
    h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: h.root.ids.typeId(ID_PREFIX.character) }),
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

type SendInput = Parameters<ChatRoot["caller"]["chat"]["send"]>[0];

interface SendRefusal {
  readonly name: string;
  readonly code: (typeof CHAT_OP_CODES)[keyof typeof CHAT_OP_CODES];
  readonly request: (ids: { readonly foreignAsset: AssetId; readonly foreignPersona: PersonaId; readonly ownAsset: AssetId }) => Omit<SendInput, "chatId">;
}

const PNG = "image/png";
const imageBlock = (assetId: AssetId): NonNullable<SendInput["blocks"]>[number] => ({
  kind: "media",
  media: "image",
  src: { kind: "asset", assetId },
  alt: "x",
});

// One room per case: a refusal that claimed would hide whether the next refusal claims too.
const SEND_REFUSALS: readonly SendRefusal[] = [
  {
    name: "an attachment the sender does not own",
    code: CHAT_OP_CODES.attachmentNotOwned,
    request: ({ foreignAsset }) => ({ content: "hi", attachmentAssetIds: [foreignAsset], timeZone: UTC_TIME_ZONE }),
  },
  {
    name: "a persona the sender does not own",
    code: CHAT_OP_CODES.notPersonaOwner,
    request: ({ foreignPersona }) => ({ content: "hi", personaId: foreignPersona, timeZone: UTC_TIME_ZONE }),
  },
  {
    // The last refusal before the row: it runs after the context build, so the claim must follow it too.
    name: "a block picture the wire would lose",
    code: CHAT_OP_CODES.blockPictureLost,
    request: ({ ownAsset }) => ({
      content: "",
      blocks: [{ kind: "markdown", md: "{{//" }, imageBlock(ownAsset), { kind: "markdown", md: "}}" }],
      timeZone: UTC_TIME_ZONE,
    }),
  },
];

const HEARD_END: UserBusEvent = { type: "charactersChanged" };

test.for(SEND_REFUSALS)("a send refused for $name leaves the unstarted room unclaimed, and a valid send then claims it", async ({ code, request }) => {
  await using h = await textRoom(["The first reply."]);
  const stranger = await h.root.principalFor((await h.root.actor()).id);
  const store = async (principal: typeof h.owner): Promise<AssetId> =>
    (await h.root.services.assets.store({ principal, bytes: makeAssetBytes(h.root.idSource.typeId(ID_PREFIX.asset)), kind: "attachment", mime: PNG })).assetId;
  const ids = {
    foreignAsset: await store(stranger),
    ownAsset: await store(h.owner),
    foreignPersona: (
      await h.root.services.persona.create({
        principal: stranger,
        input: createPersonaSchema.parse({ name: "Private stranger", description: "A stranger-owned private persona." }),
      })
    ).id,
  };
  const listed = async (): Promise<boolean> => (await h.root.services.chat.listChats({ principal: h.owner })).items.some(({ id }) => id === h.chatId);

  using subscriptions = new DisposableStack();
  const roomEvents: ChatBusEvent[] = [];
  subscriptions.defer(h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => roomEvents.push(event)));
  const stop = new AbortController();
  subscriptions.defer(() => stop.abort());
  const userEvents = h.root.app.liveBuses.user.subscribeUserEvents(h.owner.userId, stop.signal)[Symbol.asyncIterator]();
  // The bus is live-only: a sentinel published after the act marks where the act's own events end.
  const heard = async (): Promise<UserBusEvent[]> => {
    h.root.app.liveBuses.user.publishUserEvent(h.owner.userId, HEARD_END);
    const events: UserBusEvent[] = [];
    for (let next = await userEvents.next(); !next.done && next.value !== HEARD_END; next = await userEvents.next()) {
      events.push(next.value);
    }
    return events;
  };
  expect(await listed()).toBe(false);

  await expect(h.caller.chat.send({ chatId: h.chatId, ...request(ids) })).rejects.toMatchObject({ cause: { code } });

  expect(await listed()).toBe(false);
  expect(await h.root.services.stats.overview(h.owner.userId)).toBeNull();
  expect(await heard()).toEqual([]);
  expect(roomEvents).toEqual([]);
  expect(await readRoomCanon(h.root, h.owner, h.chatId)).toEqual([]);
  expect(await h.root.services.assets.resolveChatAssetRefs(h.owner.userId, h.chatId, [ids.foreignAsset, ids.ownAsset])).toEqual([]);

  // Control: the same room claims on a valid send, before its row, and the host's list hears the claim.
  const outcome = await h.caller.chat.send({ chatId: h.chatId, content: "hello", timeZone: UTC_TIME_ZONE });

  expect(outcome.messages.map(({ role }) => role)).toEqual(["user", "assistant"]);
  expect(await listed()).toBe(true);
  expect((await heard()).filter((event) => event.type === "chatsChanged" && event.chatId !== undefined)).toEqual([{ type: "chatsChanged", chatId: h.chatId }]);
  expect(roomEvents.filter(({ type }) => type === "messageCommitted")).toHaveLength(2);
  const live = await h.root.services.stats.overview(h.owner.userId);
  expect(live).toMatchObject({ chats: 1, assistantTurns: 1 });
  await h.root.services.stats.reconcile(h.owner.userId);
  expect(await h.root.services.stats.overview(h.owner.userId)).toEqual(live);
});
