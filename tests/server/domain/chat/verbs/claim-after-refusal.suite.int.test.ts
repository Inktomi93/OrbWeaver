// Every claiming verb family claims an unstarted room after its last refusal: a refused request leaves the room
// unlisted, with no creation stats and no list event, and a valid call of the same family claims it once (D166).
// @subject packages/server/src/domain/chat/verbs/participants.ts
// @subject packages/server/src/domain/chat/verbs/invites.ts
// @subject packages/server/src/domain/chat/verbs/chat-lifecycle.ts
// @subject packages/server/src/domain/chat/verbs/edit.ts
// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/rpg/snapshot-edit.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { handleSchema } from "@orb/contracts/identity";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { makeAssetBytes } from "@orb/testkit/node/composed";
import { CHAT_OP_CODES } from "#server/domain/chat/contract/errors.ts";
import { RPG_OP_CODES } from "#server/domain/rpg/contract/op-codes.ts";
import { textRoom } from "../scenario-physical.ts";
import { GAME_MOOD } from "./turn-rpg-macro-data.ts";

const HEARD_END: UserBusEvent = { type: "charactersChanged" };
const NOT_FOUND = { code: "NOT_FOUND" } as const;
const PNG = "image/png";

/** The room's claim witnesses: the stored state through the library list and the stats rollup, and the host's live
 *  list channel, drained up to a sentinel so each read returns only what the act before it published. */
interface ClaimWatch {
  readonly expectUnclaimed: () => Promise<void>;
  readonly expectClaimedOnce: () => Promise<void>;
}

function watchClaims(h: ChatRoot, chatId: ChatId, stack: DisposableStack): ClaimWatch {
  const stop = new AbortController();
  stack.defer(() => stop.abort());
  const events = h.root.app.liveBuses.user.subscribeUserEvents(h.owner.userId, stop.signal)[Symbol.asyncIterator]();
  const heard = async (): Promise<UserBusEvent[]> => {
    h.root.app.liveBuses.user.publishUserEvent(h.owner.userId, HEARD_END);
    const out: UserBusEvent[] = [];
    for (let next = await events.next(); !next.done && next.value !== HEARD_END; next = await events.next()) {
      out.push(next.value);
    }
    return out;
  };
  const listed = async (): Promise<boolean> => (await h.root.services.chat.listChats({ principal: h.owner })).items.some(({ id }) => id === chatId);
  const claims = (published: readonly UserBusEvent[]): UserBusEvent[] => published.filter((event) => event.type === "chatsChanged" && event.chatId === chatId);
  return {
    expectUnclaimed: async (): Promise<void> => {
      expect(await listed()).toBe(false);
      expect(await h.root.services.stats.overview(h.owner.userId)).toBeNull();
      expect(claims(await heard())).toEqual([]);
    },
    expectClaimedOnce: async (): Promise<void> => {
      expect(await listed()).toBe(true);
      expect(claims(await heard())).toEqual([{ type: "chatsChanged", chatId }]);
      const live = await h.root.services.stats.overview(h.owner.userId);
      expect(live).toMatchObject({ chats: 1 });
      await h.root.services.stats.reconcile(h.owner.userId);
      expect(await h.root.services.stats.overview(h.owner.userId)).toEqual(live);
    },
  };
}

async function strangerOf(h: ChatRoot): Promise<Awaited<ReturnType<ChatRoot["root"]["principalFor"]>>> {
  return await h.root.principalFor((await h.root.actor()).id);
}

test("generate: a speaker the room does not seat is refused before the claim, and a reply then claims", async () => {
  await using h = await textRoom(["The first reply."]);
  using stack = new DisposableStack();
  const watch = watchClaims(h, h.chatId, stack);
  const foreign = await h.root.services.character.create({
    principal: await strangerOf(h),
    input: createCharacterSchema.parse({ handle: "foreign", name: "Foreign", description: "A stranger-owned character." }),
  });

  await expect(h.caller.chat.generate({ chatId: h.chatId, speakerCharacterId: foreign.id, timeZone: UTC_TIME_ZONE })).rejects.toMatchObject(NOT_FOUND);
  await watch.expectUnclaimed();

  await h.caller.chat.generate({ chatId: h.chatId, timeZone: UTC_TIME_ZONE });
  await watch.expectClaimedOnce();
});

test("host config: a background on a foreign asset is refused before the claim, and a valid background then claims", async () => {
  await using h = await textRoom([]);
  using stack = new DisposableStack();
  const watch = watchClaims(h, h.chatId, stack);
  const stranger = await strangerOf(h);
  const foreign = await h.root.services.assets.store({
    principal: stranger,
    bytes: makeAssetBytes(h.root.idSource.typeId(ID_PREFIX.asset)),
    kind: "attachment",
    mime: PNG,
  });

  await expect(
    h.caller.chat.setChatBackground({ chatId: h.chatId, background: { kind: "asset", assetId: foreign.assetId, assetHash: foreign.hash, mime: PNG } }),
  ).rejects.toMatchObject({ cause: { code: CHAT_OP_CODES.forbiddenOverride } });
  await watch.expectUnclaimed();

  await h.caller.chat.setChatBackground({ chatId: h.chatId, background: { kind: "none" } });
  await watch.expectClaimedOnce();
});

test("roster: a character the host does not own is refused before the claim, and the host's own character then claims", async () => {
  await using h = await textRoom([]);
  using stack = new DisposableStack();
  const watch = watchClaims(h, h.chatId, stack);
  const foreign = await h.root.services.character.create({
    principal: await strangerOf(h),
    input: createCharacterSchema.parse({ handle: "foreign", name: "Foreign", description: "A stranger-owned character." }),
  });
  const own = await h.caller.character.create({ input: createCharacterSchema.parse({ handle: "bryn", name: "Bryn", description: "A second knight." }) });

  await expect(h.caller.chat.addCharacterToChat({ chatId: h.chatId, characterId: foreign.id })).rejects.toMatchObject(NOT_FOUND);
  await watch.expectUnclaimed();

  await h.caller.chat.addCharacterToChat({ chatId: h.chatId, characterId: own.id });
  await watch.expectClaimedOnce();
});

test("roster: a re-add of a seated character and an empty knob patch write nothing and claim nothing", async () => {
  await using h = await textRoom([]);
  using stack = new DisposableStack();
  const watch = watchClaims(h, h.chatId, stack);
  const [seated] = h.characters;
  if (seated === undefined) {
    throw new Error("the room seated no character");
  }

  const seat = await h.caller.chat.addCharacterToChat({ chatId: h.chatId, characterId: seated.id });
  expect(seat).toMatchObject({ characterId: seated.id });
  await h.caller.chat.setSeatKnobs({ chatId: h.chatId, participantId: seat.id, patch: {} });
  await watch.expectUnclaimed();

  await h.caller.chat.setSeatKnobs({ chatId: h.chatId, participantId: seat.id, patch: { talkativeness: 0.9 } });
  await watch.expectClaimedOnce();
});

test("invite: an unknown target handle is refused before the claim, and a share link then claims", async () => {
  await using h = await textRoom([]);
  using stack = new DisposableStack();
  const watch = watchClaims(h, h.chatId, stack);
  // The service door: the transport's multi-human gate is not the ordering under test.
  const createInvite = h.root.services.chat.createInvite;

  await expect(
    createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: handleSchema.parse("nobody-holds-this-handle") } }),
  ).rejects.toMatchObject({
    code: "invite_target_unknown",
  });
  await watch.expectUnclaimed();

  await createInvite({ principal: h.owner, chatId: h.chatId, input: {} });
  await watch.expectClaimedOnce();
});

test("lifecycle: an off-vocabulary user-macro pick is refused before the claim, and a declared pick then claims", async () => {
  await using h = await textRoom([], { promptConfig: makePromptConfig({ userMacros: [GAME_MOOD] }) });
  using stack = new DisposableStack();
  const watch = watchClaims(h, h.chatId, stack);

  await expect(h.caller.chat.setUserMacroValues({ chatId: h.chatId, values: { mood: { tone: "grim" } } })).rejects.toMatchObject({
    cause: { code: CHAT_OP_CODES.unknownMacroPick },
  });
  await watch.expectUnclaimed();

  await h.caller.chat.setUserMacroValues({ chatId: h.chatId, values: { mood: { tone: "hopeful" } } });
  await watch.expectClaimedOnce();
});

test("rpg: a second game and an unknown snapshot plane are refused before the claim, and a valid hand edit then claims", async () => {
  await using h = await textRoom([]);
  const room = (await h.caller.chat.startChat({ characterIds: h.characters.map(({ id }) => id), opening: "none", startAsGame: {} })).chat.id;
  using stack = new DisposableStack();
  const watch = watchClaims(h, room, stack);

  await expect(h.caller.rpg.createGame({ chatId: room, mode: "lite" })).rejects.toMatchObject({ cause: { code: RPG_OP_CODES.alreadyAGame } });
  expect(await h.caller.rpg.editSnapshot({ chatId: room, patch: { ambient: null } })).toMatchObject({ ok: false });
  await watch.expectUnclaimed();

  expect(await h.caller.rpg.editSnapshot({ chatId: room, patch: { location: "the undercroft" } })).toEqual({ ok: true });
  await watch.expectClaimedOnce();
});

test("edit: a greeting alternate the card does not have is refused before the claim, and a real alternate then claims", async () => {
  // One character in the whole root: the stats rollup then compares against a rebuild of the same population.
  await using h = await textRoom([], {
    characters: [
      createCharacterSchema.parse({
        handle: "keeper",
        name: "Keeper",
        description: "A keeper of doors.",
        greetings: [{ text: "The door is shut." }, { text: "The door stands open." }],
      }),
    ],
  });
  const room = (await h.caller.chat.startChat({ characterIds: h.characters.map(({ id }) => id), opening: "first-message" })).chat.id;
  const greeting = (await h.caller.chat.listMessages({ chatId: room })).messages[0];
  if (greeting === undefined) {
    throw new Error("the first-message opening seeded no greeting");
  }
  using stack = new DisposableStack();
  const watch = watchClaims(h, room, stack);

  await expect(h.caller.chat.setSeededGreeting({ chatId: room, messageId: greeting.id, greetingIndex: 7 })).rejects.toMatchObject({
    cause: { code: CHAT_OP_CODES.greetingAlternateNotFound },
  });
  await watch.expectUnclaimed();

  await h.caller.chat.setSeededGreeting({ chatId: room, messageId: greeting.id, greetingIndex: 1 });
  await watch.expectClaimedOnce();
});
