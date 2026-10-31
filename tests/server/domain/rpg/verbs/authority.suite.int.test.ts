// The per-verb authority grid across host, member and non-member. A host-gated verb refuses a member as forbidden and
// a non-member as the same not-found a chat without a game gives, so a foreigner cannot learn the chat is a game.
// A refused write leaves its plane untouched; the host's own call is the positive control for every refusal.
// @subject packages/server/src/domain/rpg/guard.ts
// @subject packages/server/src/domain/rpg/service.ts

import type { Principal } from "@orb/contracts/identity";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { seedRecallRoom, seedRpgGame } from "@orb/testkit/node/composed";

type RpgService = ServerTestHarness["services"]["rpg"];
type ChatId = Awaited<ReturnType<typeof seedRecallRoom>>;

interface Grid {
  readonly host: Principal;
  readonly member: Principal;
  readonly ghost: Principal;
  readonly chatId: ChatId;
  readonly rpg: RpgService;
}

async function memberOf(root: ServerTestHarness, host: Principal, chatId: ChatId): Promise<Principal> {
  const member = await root.principalFor((await root.actor()).id);
  const invite = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  return member;
}

async function grid(root: ServerTestHarness, withGame = true): Promise<Grid> {
  const host = await root.principalFor(root.ownerId);
  const chatId = await seedRecallRoom(await root.internalCallerFor(host.userId));
  const member = await memberOf(root, host, chatId);
  const ghost = await root.principalFor((await root.actor()).id);
  if (withGame) {
    await seedRpgGame(root, { principal: host, chatId, mode: "lite" });
    // A checkpoint labels a resolved snapshot, and a fresh game has none until its first write.
    await root.services.rpg.editSnapshot({ principal: host, chatId, patch: { location: "the gate" } });
  }
  return { host, member, ghost, chatId, rpg: root.services.rpg };
}

const NPC = { kind: "npc", npcKey: "mira" } as const;

type Call = (g: Grid, who: Principal) => Promise<unknown>;
// Every service verb has one row, so a verb the service gains fails `tsc` until it is classified. `own-case` names a
// verb whose gate has a case of its own below, because its setup or its refusal differs from the grid.
// `hostRefusedWith` is the verb's own refusal code for a host whose call passes the gate but has no subject to act on.
type Gate = { readonly gate: "host" | "member"; readonly call: Call; readonly hostRefusedWith?: string } | { readonly gate: "own-case" };

const questFor = (g: Grid): Promise<Awaited<ReturnType<RpgService["upsertQuest"]>>> => g.rpg.upsertQuest({ principal: g.host, chatId: g.chatId, name: "Q" });
const checkpointFor = (g: Grid): Promise<Awaited<ReturnType<RpgService["createCheckpoint"]>>> =>
  g.rpg.createCheckpoint({ principal: g.host, chatId: g.chatId, label: "L" });

const GATES: Readonly<Record<keyof RpgService, Gate>> = {
  createGame: { gate: "own-case" },
  detachDanglingPointer: { gate: "own-case" },
  patchSheet: { gate: "own-case" },
  editJournalEntry: { gate: "own-case" },
  deleteJournalEntry: { gate: "own-case" },
  updateConfig: { gate: "host", call: (g, who) => g.rpg.updateConfig({ principal: who, chatId: g.chatId, patch: { steeringNote: "x" } }) },
  getConfigView: { gate: "host", call: (g, who) => g.rpg.getConfigView({ principal: who, chatId: g.chatId }) },
  upsertQuest: { gate: "host", call: (g, who) => g.rpg.upsertQuest({ principal: who, chatId: g.chatId, name: "Q" }) },
  editQuestObjective: {
    gate: "host",
    call: async (g, who) => g.rpg.editQuestObjective({ principal: who, chatId: g.chatId, questId: await questFor(g), op: { kind: "add", text: "o" } }),
  },
  deleteQuest: { gate: "host", call: async (g, who) => g.rpg.deleteQuest({ principal: who, chatId: g.chatId, questId: await questFor(g) }) },
  addJournalEntry: { gate: "host", call: (g, who) => g.rpg.addJournalEntry({ principal: who, chatId: g.chatId, type: "note", title: "t", content: "c" }) },
  createCheckpoint: { gate: "host", call: (g, who) => g.rpg.createCheckpoint({ principal: who, chatId: g.chatId, label: "L" }) },
  restoreCheckpoint: {
    gate: "host",
    call: async (g, who) => g.rpg.restoreCheckpoint({ principal: who, chatId: g.chatId, checkpointId: await checkpointFor(g) }),
  },
  editSnapshot: { gate: "host", call: (g, who) => g.rpg.editSnapshot({ principal: who, chatId: g.chatId, patch: { location: "x" } }) },
  patchActor: {
    gate: "host",
    call: (g, who) => g.rpg.patchActor({ principal: who, chatId: g.chatId, targetRef: NPC, ops: [{ op: "setStatus", status: "x" }] }),
  },
  dismissActor: { gate: "host", call: (g, who) => g.rpg.dismissActor({ principal: who, chatId: g.chatId, targetRef: NPC }) },
  promoteActor: { gate: "host", call: (g, who) => g.rpg.promoteActor({ principal: who, chatId: g.chatId, targetRef: NPC }) },
  revealHidden: { gate: "host", call: (g, who) => g.rpg.revealHidden({ principal: who, chatId: g.chatId }) },
  resyncFromStory: { gate: "host", call: (g, who) => g.rpg.resyncFromStory({ principal: who, chatId: g.chatId }) },
  populateFromCharacter: {
    gate: "host",
    call: (g, who) => g.rpg.populateFromCharacter({ principal: who, chatId: g.chatId, actorRef: NPC }),
    hostRefusedWith: "rpg_actor_has_no_card",
  },
  getGame: { gate: "member", call: (g, who) => g.rpg.getGame({ principal: who, chatId: g.chatId }) },
  getTrackerView: { gate: "member", call: (g, who) => g.rpg.getTrackerView({ principal: who, chatId: g.chatId }) },
  listJournal: { gate: "member", call: (g, who) => g.rpg.listJournal({ principal: who, chatId: g.chatId }) },
  listTurnToolCalls: { gate: "member", call: (g, who) => g.rpg.listTurnToolCalls({ principal: who, chatId: g.chatId }) },
  listCheckpoints: { gate: "member", call: (g, who) => g.rpg.listCheckpoints({ principal: who, chatId: g.chatId }) },
  rollDice: { gate: "member", call: (g, who) => g.rpg.rollDice({ principal: who, chatId: g.chatId, notation: "1d20" }) },
};

function gated(gate: "host" | "member"): readonly { readonly name: string; readonly call: Call; readonly hostRefusedWith?: string }[] {
  return Object.entries(GATES).flatMap(([name, row]) =>
    row.gate !== "own-case" && row.gate === gate
      ? [{ name, call: row.call, ...(row.hostRefusedWith === undefined ? {} : { hostRefusedWith: row.hostRefusedWith }) }]
      : [],
  );
}

for (const verb of gated("host")) {
  test(`${verb.name} is host-gated: a member is forbidden, a non-member gets not-found, the host is admitted`, async ({ harness }) => {
    const g = await grid(harness);
    await expect(verb.call(g, g.member)).rejects.toThrow(DomainForbiddenError);
    await expect(verb.call(g, g.ghost)).rejects.toThrow(DomainNotFoundError);
    // The host passes the gate: the call resolves, or it reaches the verb's own refusal and says which.
    const host = await verb.call(g, g.host).then(
      () => "resolved",
      (error: unknown) => (error instanceof Error && "code" in error ? error.code : error),
    );
    expect(host).toBe(verb.hostRefusedWith ?? "resolved");
  });
}

test("a refused member write leaves every plane untouched and promotion mints no seat", async ({ harness }) => {
  const g = await grid(harness);
  const seats = async (): Promise<number> => (await harness.services.chat.listParticipants({ principal: g.host, chatId: g.chatId })).length;
  const before = { seats: await seats(), config: await g.rpg.getConfigView({ principal: g.host, chatId: g.chatId }) };
  await expect(g.rpg.upsertQuest({ principal: g.member, chatId: g.chatId, name: "Q" })).rejects.toThrow(DomainForbiddenError);
  await expect(g.rpg.addJournalEntry({ principal: g.member, chatId: g.chatId, type: "note", title: "t", content: "c" })).rejects.toThrow(DomainForbiddenError);
  await expect(g.rpg.createCheckpoint({ principal: g.member, chatId: g.chatId, label: "L" })).rejects.toThrow(DomainForbiddenError);
  await expect(g.rpg.promoteActor({ principal: g.member, chatId: g.chatId, targetRef: NPC })).rejects.toThrow(DomainForbiddenError);
  await expect(g.rpg.updateConfig({ principal: g.member, chatId: g.chatId, patch: { steeringNote: "must-not-land" } })).rejects.toThrow(DomainForbiddenError);

  expect((await g.rpg.getTrackerView({ principal: g.host, chatId: g.chatId })).quests).toEqual([]);
  expect(await g.rpg.listJournal({ principal: g.host, chatId: g.chatId })).toEqual([]);
  expect(await g.rpg.listCheckpoints({ principal: g.host, chatId: g.chatId })).toEqual([]);
  expect(await seats()).toBe(before.seats);
  expect(await g.rpg.getConfigView({ principal: g.host, chatId: g.chatId })).toEqual(before.config);

  // The same writes land for the host, so the refusals above were the gate and not a dead write path.
  await g.rpg.upsertQuest({ principal: g.host, chatId: g.chatId, name: "Q" });
  await g.rpg.addJournalEntry({ principal: g.host, chatId: g.chatId, type: "note", title: "t", content: "c" });
  await g.rpg.createCheckpoint({ principal: g.host, chatId: g.chatId, label: "L" });
  expect((await g.rpg.getTrackerView({ principal: g.host, chatId: g.chatId })).quests).toHaveLength(1);
  expect(await g.rpg.listJournal({ principal: g.host, chatId: g.chatId })).toHaveLength(1);
  expect(await g.rpg.listCheckpoints({ principal: g.host, chatId: g.chatId })).toHaveLength(1);
});

test("member-gated reads and dice admit a member and refuse a non-member as not-found", async ({ harness }) => {
  const g = await grid(harness);
  for (const read of gated("member")) {
    await expect(read.call(g, g.member), read.name).resolves.toBeDefined();
    await expect(read.call(g, g.ghost), read.name).rejects.toThrow(DomainNotFoundError);
  }
});

test("game birth and the dangling-pointer heal are host-gated before any game exists", async ({ harness }) => {
  const g = await grid(harness, false);
  await expect(g.rpg.createGame({ principal: g.member, chatId: g.chatId, mode: "lite" })).rejects.toThrow(DomainForbiddenError);
  await expect(g.rpg.createGame({ principal: g.ghost, chatId: g.chatId, mode: "lite" })).rejects.toThrow(DomainNotFoundError);
  await expect(g.rpg.detachDanglingPointer({ principal: g.member, chatId: g.chatId })).rejects.toThrow(DomainForbiddenError);
  await expect(g.rpg.detachDanglingPointer({ principal: g.ghost, chatId: g.chatId })).rejects.toThrow(DomainNotFoundError);
  await expect(g.rpg.getGame({ principal: g.host, chatId: g.chatId })).rejects.toThrow(DomainNotFoundError);
  await expect(g.rpg.createGame({ principal: g.host, chatId: g.chatId, mode: "lite" })).resolves.toBeDefined();
  await expect(g.rpg.getGame({ principal: g.member, chatId: g.chatId })).resolves.toBeDefined();
});

test("a member writes only their own sheet row, and the tracker exceptions stay a host-only field", async ({ harness }) => {
  const g = await grid(harness);
  const own = { kind: "user", userId: g.member.userId } as const;
  const hosts = { kind: "user", userId: g.host.userId } as const;
  await expect(g.rpg.patchSheet({ principal: g.member, chatId: g.chatId, actorRef: own, patch: { className: "Rogue" } })).resolves.toBeUndefined();
  await expect(g.rpg.patchSheet({ principal: g.member, chatId: g.chatId, actorRef: hosts, patch: { className: "x" } })).rejects.toThrow(DomainForbiddenError);
  await expect(
    g.rpg.patchSheet({ principal: g.ghost, chatId: g.chatId, actorRef: { kind: "user", userId: g.ghost.userId }, patch: { className: "x" } }),
  ).rejects.toThrow(DomainNotFoundError);

  // The row gate answers whose row; a grant or revoke on the member's own row still needs the host.
  await expect(g.rpg.patchSheet({ principal: g.member, chatId: g.chatId, actorRef: own, patch: { trackerGrants: ["bound_will"] } })).rejects.toThrow(
    DomainForbiddenError,
  );
  await expect(g.rpg.patchSheet({ principal: g.member, chatId: g.chatId, actorRef: own, patch: { trackerRevokes: ["mana"] } })).rejects.toThrow(
    DomainForbiddenError,
  );
  const view = async (): Promise<readonly string[] | undefined> =>
    (await g.rpg.getTrackerView({ principal: g.host, chatId: g.chatId })).actors.find(
      (a) => a.actorRef.kind === "user" && a.actorRef.userId === g.member.userId,
    )?.sheet.trackerGrants;
  expect(await view()).toEqual([]);
  await expect(
    g.rpg.patchSheet({ principal: g.host, chatId: g.chatId, actorRef: own, patch: { trackerGrants: ["bound_will"], trackerRevokes: [] } }),
  ).resolves.toBeUndefined();
  expect(await view()).toEqual(["bound_will"]);
});

test("a host cannot reach another game's journal entry by id, and the refusal is the same not-found", async ({ harness }) => {
  const a = await grid(harness);
  // The grid's host is the owner of both rooms; the foreign-game caller is the member who hosts room B.
  const hostB = a.member;
  const roomB = await seedRecallRoom(await harness.internalCallerFor(hostB.userId));
  await seedRpgGame(harness, { principal: hostB, chatId: roomB, mode: "lite" });
  const entry = await harness.services.rpg.addJournalEntry({ principal: hostB, chatId: roomB, type: "note", title: "B-title", content: "B-content" });
  const read = async (): Promise<readonly { readonly id: string; readonly content: string }[]> =>
    await harness.services.rpg.listJournal({ principal: hostB, chatId: roomB });

  await expect(harness.services.rpg.editJournalEntry({ principal: a.host, chatId: a.chatId, entryId: entry, patch: { content: "hijacked" } })).rejects.toThrow(
    DomainNotFoundError,
  );
  await expect(harness.services.rpg.deleteJournalEntry({ principal: a.host, chatId: a.chatId, entryId: entry })).rejects.toThrow(DomainNotFoundError);
  expect((await read()).find((row) => row.id === entry)?.content).toBe("B-content");

  // Control: the entry's own host reaches it, so the refusals above were the game scope.
  await harness.services.rpg.editJournalEntry({ principal: hostB, chatId: roomB, entryId: entry, patch: { content: "edited" } });
  expect((await read()).find((row) => row.id === entry)?.content).toBe("edited");
});
