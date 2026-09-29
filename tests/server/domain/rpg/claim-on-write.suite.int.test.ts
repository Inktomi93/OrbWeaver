// Every rpg write door claims its room (R0 F4(a): authored game content is "doing something with" the chat).
// The mutation list is read from the rpg ROUTER, so a new write verb fails here until it claims or is excluded
// with a reason.

import type { Db } from "@orb/db";
import type { ChatId, Handle, RpgCheckpointId, RpgJournalId, RpgQuestId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { rpgRouter } from "../../../../packages/server/src/transport/trpc/routers/rpg.ts";
import { freshDb } from "../../../support/db.ts";
import type { RpgHarness } from "./_support.ts";
import { expect, makeRpgService, principal, seedChat, seedLiteGame, test } from "./_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const HOST = principal(castId<Handle>("host"));
const NPC = { kind: "npc", npcKey: "mira" } as const;

type WriteCall = (h: RpgHarness, chatId: ChatId) => Promise<unknown>;

/** One host call per claiming mutation. The claim runs right after the authority gate, so a call the verb later
 *  refuses as data (no such quest, no such actor) still proves the claim; the argument only has to pass the gate. */
const CLAIMING: Readonly<Record<string, WriteCall>> = {
  updateConfig: (h, chatId) => h.service.updateConfig({ principal: HOST, chatId, patch: { steeringNote: "keep it grim" } }),
  patchSheet: (h, chatId) => h.service.patchSheet({ principal: HOST, chatId, actorRef: { kind: "user", userId: HOST.userId }, patch: { className: "Warden" } }),
  editSnapshot: (h, chatId) => h.service.editSnapshot({ principal: HOST, chatId, patch: { location: "the ford" } }),
  patchActor: (h, chatId) => h.service.patchActor({ principal: HOST, chatId, targetRef: NPC, ops: [{ op: "setStatus", status: "wary" }] }),
  dismissActor: (h, chatId) => h.service.dismissActor({ principal: HOST, chatId, targetRef: NPC }),
  promoteActor: (h, chatId) => h.service.promoteActor({ principal: HOST, chatId, targetRef: NPC }),
  upsertQuest: (h, chatId) => h.service.upsertQuest({ principal: HOST, chatId, name: "Reach the vault" }),
  editQuestObjective: (h, chatId) =>
    h.service.editQuestObjective({ principal: HOST, chatId, questId: castId<RpgQuestId>("q_none"), op: { kind: "add", text: "Turn the wheel" } }),
  deleteQuest: (h, chatId) => h.service.deleteQuest({ principal: HOST, chatId, questId: castId<RpgQuestId>("q_none") }),
  addJournalEntry: (h, chatId) => h.service.addJournalEntry({ principal: HOST, chatId, type: "note", title: "t", content: "c" }),
  editJournalEntry: (h, chatId) =>
    h.service.editJournalEntry({ principal: HOST, chatId, entryId: mintTypeId(ID_PREFIX.rpgJournal) as RpgJournalId, patch: { content: "c" } }),
  deleteJournalEntry: (h, chatId) => h.service.deleteJournalEntry({ principal: HOST, chatId, entryId: mintTypeId(ID_PREFIX.rpgJournal) as RpgJournalId }),
  createCheckpoint: (h, chatId) => h.service.createCheckpoint({ principal: HOST, chatId, label: "before the fight" }),
  restoreCheckpoint: (h, chatId) =>
    h.service.restoreCheckpoint({ principal: HOST, chatId, checkpointId: mintTypeId(ID_PREFIX.rpgCheckpoint) as RpgCheckpointId }),
  resyncFromStory: (h, chatId) => h.service.resyncFromStory({ principal: HOST, chatId }),
  populateFromCharacter: (h, chatId) =>
    h.service.populateFromCharacter({ principal: HOST, chatId, actorRef: { kind: "character", characterId: mintTypeId(ID_PREFIX.character) } }),
};

/** The mutations that deliberately do not claim, each with its reason. `createGame` claims too, but has no game
 *  to seed first, so it is proved by its own case below. */
const NOT_CLAIMING: Readonly<Record<string, { readonly reason: string; readonly call: WriteCall }>> = {
  rollDice: {
    reason: "writes nothing: it returns a composer stamp, and the member's send that carries it is the claim",
    call: (h, chatId) => h.service.rollDice({ principal: HOST, chatId, notation: "1d20" }),
  },
  detachDanglingPointer: {
    reason: "a heal of a pointer at a vanished game, not authored content",
    call: (h, chatId) => h.service.detachDanglingPointer({ principal: HOST, chatId }),
  },
};

const mutations = Object.entries(
  // @orb-waive no-test-fabrication(unknown): the tRPC `_def.procedures` introspection seam (no public enumeration API in v11). Ends when tRPC exposes one.
  (rpgRouter as unknown as { _def: { procedures: Record<string, { _def: { type: string } }> } })._def.procedures,
)
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
    await h.service.createGame({ principal: HOST, chatId, mode: "lite" });
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
    await expect(h.service.upsertQuest({ principal: principal(castId<Handle>("member")), chatId, name: "Q" })).rejects.toThrow();
    await expect(h.service.upsertQuest({ principal: principal(castId<Handle>("ghost")), chatId, name: "Q" })).rejects.toThrow();
    expect(h.fakes.claims).toStrictEqual([]);
  });
});
