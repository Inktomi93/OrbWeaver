// Every rpg write door claims its room (R0 F4(a): authored game content is "doing something with" the chat).
// The mutation list is read from the rpg ROUTER, so a new write verb fails here until it claims or is excluded
// with a reason.

import type { Db } from "@orb/db";
import type { ChatId, Handle, RpgCheckpointId, RpgJournalId, RpgQuestId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { beforeEach, describe } from "vitest";
import { rpgRouter } from "#server/transport/trpc/routers/rpg.ts";
import type { RpgHarness } from "./_support.ts";
import { expect, makeRpgService, principal, seedChat, seedLiteGame, test } from "./_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const NPC = { kind: "npc", npcKey: "mira" } as const;

type WriteCall = (h: RpgHarness, chatId: ChatId) => Promise<unknown>;

/** One host call per claiming mutation. The claim runs right after the authority gate, so a call the verb later
 *  refuses as data (no such quest, no such actor) still proves the claim; the argument only has to pass the gate. */
const CLAIMING: Readonly<Record<string, WriteCall>> = {
  updateConfig: async (h, chatId) =>
    h.service.updateConfig({ principal: await principal(db, castId<Handle>("host")), chatId, patch: { steeringNote: "keep it grim" } }),
  patchSheet: async (h, chatId) =>
    h.service.patchSheet({
      principal: await principal(db, castId<Handle>("host")),
      chatId,
      actorRef: { kind: "user", userId: (await principal(db, castId<Handle>("host"))).userId },
      patch: { className: "Warden" },
    }),
  editSnapshot: async (h, chatId) =>
    h.service.editSnapshot({ principal: await principal(db, castId<Handle>("host")), chatId, patch: { location: "the ford" } }),
  patchActor: async (h, chatId) =>
    h.service.patchActor({ principal: await principal(db, castId<Handle>("host")), chatId, targetRef: NPC, ops: [{ op: "setStatus", status: "wary" }] }),
  dismissActor: async (h, chatId) => h.service.dismissActor({ principal: await principal(db, castId<Handle>("host")), chatId, targetRef: NPC }),
  promoteActor: async (h, chatId) => h.service.promoteActor({ principal: await principal(db, castId<Handle>("host")), chatId, targetRef: NPC }),
  upsertQuest: async (h, chatId) => h.service.upsertQuest({ principal: await principal(db, castId<Handle>("host")), chatId, name: "Reach the vault" }),
  editQuestObjective: async (h, chatId) =>
    h.service.editQuestObjective({
      principal: await principal(db, castId<Handle>("host")),
      chatId,
      questId: castId<RpgQuestId>("q_none"),
      op: { kind: "add", text: "Turn the wheel" },
    }),
  deleteQuest: async (h, chatId) =>
    h.service.deleteQuest({ principal: await principal(db, castId<Handle>("host")), chatId, questId: castId<RpgQuestId>("q_none") }),
  addJournalEntry: async (h, chatId) =>
    h.service.addJournalEntry({ principal: await principal(db, castId<Handle>("host")), chatId, type: "note", title: "t", content: "c" }),
  editJournalEntry: async (h, chatId) =>
    h.service.editJournalEntry({
      principal: await principal(db, castId<Handle>("host")),
      chatId,
      entryId: mintTypeId(ID_PREFIX.rpgJournal) as RpgJournalId,
      patch: { content: "c" },
    }),
  deleteJournalEntry: async (h, chatId) =>
    h.service.deleteJournalEntry({ principal: await principal(db, castId<Handle>("host")), chatId, entryId: mintTypeId(ID_PREFIX.rpgJournal) as RpgJournalId }),
  createCheckpoint: async (h, chatId) =>
    h.service.createCheckpoint({ principal: await principal(db, castId<Handle>("host")), chatId, label: "before the fight" }),
  restoreCheckpoint: async (h, chatId) =>
    h.service.restoreCheckpoint({
      principal: await principal(db, castId<Handle>("host")),
      chatId,
      checkpointId: mintTypeId(ID_PREFIX.rpgCheckpoint) as RpgCheckpointId,
    }),
  resyncFromStory: async (h, chatId) => h.service.resyncFromStory({ principal: await principal(db, castId<Handle>("host")), chatId }),
  populateFromCharacter: async (h, chatId) =>
    h.service.populateFromCharacter({
      principal: await principal(db, castId<Handle>("host")),
      chatId,
      actorRef: { kind: "character", characterId: mintTypeId(ID_PREFIX.character) },
    }),
};

/** The mutations that deliberately do not claim, each with its reason. `createGame` claims too, but has no game
 *  to seed first, so it is proved by its own case below. */
const NOT_CLAIMING: Readonly<Record<string, { readonly reason: string; readonly call: WriteCall }>> = {
  rollDice: {
    reason: "writes nothing: it returns a composer stamp, and the member's send that carries it is the claim",
    call: async (h, chatId) => h.service.rollDice({ principal: await principal(db, castId<Handle>("host")), chatId, notation: "1d20" }),
  },
  detachDanglingPointer: {
    reason: "a heal of a pointer at a vanished game, not authored content",
    call: async (h, chatId) => h.service.detachDanglingPointer({ principal: await principal(db, castId<Handle>("host")), chatId }),
  },
};

const mutations = Object.entries((rpgRouter as unknown as { _def: { procedures: Record<string, { _def: { type: string } }> } })._def.procedures)
  .filter(([, proc]) => proc._def.type === "mutation")
  .map(([name]) => name);

describe("rpg write doors claim the room", () => {
  test("every router mutation is classified: claiming, createGame, or excluded with a reason", () => {
    const classified = new Set([...Object.keys(CLAIMING), ...Object.keys(NOT_CLAIMING), "createGame"]);
    expect(mutations.filter((name) => !classified.has(name))).toStrictEqual([]);
    expect([...classified].filter((name) => !mutations.includes(name))).toStrictEqual([]);
  });

  test.for(Object.keys(CLAIMING))("%s claims the chat", async (name) => {
    const { chatId, h } = await seedLiteGame(db, {}, name);
    h.fakes.claims.length = 0;
    const call = CLAIMING[name];
    if (call === undefined) {
      throw new Error(`no call for ${name}`);
    }
    await call(h, chatId).catch(() => undefined);
    expect(h.fakes.claims).toContain(chatId);
  });

  test("createGame claims the chat", async () => {
    const chatId = await seedChat(db, "create", { id: mintTypeId(ID_PREFIX.chat) });
    const h = makeRpgService(db);
    h.fakes.membership.set("user_host", "host");
    await h.service.createGame({ principal: await principal(db, castId<Handle>("host")), chatId, mode: "lite" });
    expect(h.fakes.claims).toContain(chatId);
  });

  test.for(Object.keys(NOT_CLAIMING))("%s does not claim", async (name) => {
    const { chatId, h } = await seedLiteGame(db, {}, name);
    h.fakes.claims.length = 0;
    await NOT_CLAIMING[name]?.call(h, chatId).catch(() => undefined);
    expect(h.fakes.claims).toStrictEqual([]);
  });

  test("a refused caller claims nothing: the claim runs after the authority gate", async () => {
    const { chatId, h } = await seedLiteGame(db, {}, "refused");
    h.fakes.claims.length = 0;
    h.fakes.membership.set("user_member", "member");
    await expect(h.service.upsertQuest({ principal: await principal(db, castId<Handle>("member")), chatId, name: "Q" })).rejects.toThrow();
    await expect(h.service.upsertQuest({ principal: await principal(db, castId<Handle>("ghost")), chatId, name: "Q" })).rejects.toThrow();
    expect(h.fakes.claims).toStrictEqual([]);
  });
});
