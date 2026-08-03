// verbs/authority — THE per-verb authority matrix (rpg-design/05 §4.4, §6.2). The cross-tenant trust boundary:
// host-gated verbs require the roster host; a member may write their OWN `user` row; shared planes are
// host-write; reads are member-gated. Refusals are LEAK-FREE — a non-member gets the SAME not-found a no-game
// chat gets (the not-a-member and no-game cases are indistinguishable). Every verb is probed here across the
// host / member-own / member-foreign / non-member grid; behavior detail lives in the per-verb suites.

import type { Db } from "@orb/db";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId, Handle, RpgJournalId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { findGameByChat } from "../../../../packages/server/src/domain/rpg/persistence/games";
import { listActiveJournal } from "../../../../packages/server/src/domain/rpg/persistence/journal";
import { freshDb } from "../../../support/db";
import { expect, makeRpgService, principal, seedChat, seedUser, test } from "./_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

/** The actor the two op-shaped actor verbs are probed against (the authority gate fires before the target is
 *  ever resolved, so the game need not carry the row). */
const CAST_REF = { kind: "cast", castKey: "mira" } as const;

/** Seed a game whose roster has a host + a member; return the harness with membership programmed. */
async function seedGameWithRoster(): Promise<{ chatId: ChatId; h: ReturnType<typeof makeRpgService> }> {
  const chatId = await seedChat(db, "a");
  await seedUser(db, castId<Handle>("host"));
  await seedUser(db, castId<Handle>("member"));
  const h = makeRpgService(db);
  h.fakes.membership.set("user_host", "host");
  h.fakes.membership.set("user_member", "member");
  await h.service.createGame({ principal: principal(castId<Handle>("host")), chatId, mode: "lite" });
  return { chatId, h };
}

describe("host-gated shared-plane verbs — member FORBIDDEN, non-member leak-free NOT-FOUND", () => {
  test("updateConfig", async () => {
    const { chatId, h } = await seedGameWithRoster();
    await expect(h.service.updateConfig({ principal: principal(castId<Handle>("member")), chatId, patch: { steeringNote: "x" } })).rejects.toThrow(
      DomainForbiddenError,
    );
    await expect(h.service.updateConfig({ principal: principal(castId<Handle>("ghost")), chatId, patch: { steeringNote: "x" } })).rejects.toThrow(
      DomainNotFoundError,
    );
  });

  test("upsertQuest", async () => {
    const { chatId, h } = await seedGameWithRoster();
    await expect(h.service.upsertQuest({ principal: principal(castId<Handle>("member")), chatId, name: "Q" })).rejects.toThrow(DomainForbiddenError);
    await expect(h.service.upsertQuest({ principal: principal(castId<Handle>("ghost")), chatId, name: "Q" })).rejects.toThrow(DomainNotFoundError);
  });

  test("addJournalEntry", async () => {
    const { chatId, h } = await seedGameWithRoster();
    await expect(h.service.addJournalEntry({ principal: principal(castId<Handle>("member")), chatId, type: "note", title: "t", content: "c" })).rejects.toThrow(
      DomainForbiddenError,
    );
    await expect(h.service.addJournalEntry({ principal: principal(castId<Handle>("ghost")), chatId, type: "note", title: "t", content: "c" })).rejects.toThrow(
      DomainNotFoundError,
    );
  });

  test("createCheckpoint", async () => {
    const { chatId, h } = await seedGameWithRoster();
    await expect(h.service.createCheckpoint({ principal: principal(castId<Handle>("member")), chatId, label: "L" })).rejects.toThrow(DomainForbiddenError);
    await expect(h.service.createCheckpoint({ principal: principal(castId<Handle>("ghost")), chatId, label: "L" })).rejects.toThrow(DomainNotFoundError);
  });

  test("editSnapshot", async () => {
    const { chatId, h } = await seedGameWithRoster();
    await expect(h.service.editSnapshot({ principal: principal(castId<Handle>("member")), chatId, patch: { location: "x" } })).rejects.toThrow(
      DomainForbiddenError,
    );
    await expect(h.service.editSnapshot({ principal: principal(castId<Handle>("ghost")), chatId, patch: { location: "x" } })).rejects.toThrow(
      DomainNotFoundError,
    );
  });

  // R1 — the op-shaped actor door + its removal gesture. The member-own-volatile arm stays DEFERRED (the
  // doorway is `assertOwnUserRef` on `targetRef`, `verbs/patch-actor.ts` header): a member gets a FORBIDDEN
  // here, which is a refusal, not a lie about the plane.
  test("patchActor", async () => {
    const { chatId, h } = await seedGameWithRoster();
    const ops = [{ op: "setStatus", status: "x" }] as const;
    await expect(h.service.patchActor({ principal: principal(castId<Handle>("member")), chatId, targetRef: CAST_REF, ops: [...ops] })).rejects.toThrow(
      DomainForbiddenError,
    );
    await expect(h.service.patchActor({ principal: principal(castId<Handle>("ghost")), chatId, targetRef: CAST_REF, ops: [...ops] })).rejects.toThrow(
      DomainNotFoundError,
    );
  });

  test("dismissActor", async () => {
    const { chatId, h } = await seedGameWithRoster();
    await expect(h.service.dismissActor({ principal: principal(castId<Handle>("member")), chatId, targetRef: CAST_REF })).rejects.toThrow(DomainForbiddenError);
    await expect(h.service.dismissActor({ principal: principal(castId<Handle>("ghost")), chatId, targetRef: CAST_REF })).rejects.toThrow(DomainNotFoundError);
  });

  // R4 — the promotion doorway. It is the ONE rpg verb whose write reaches OUTSIDE the game (a durable
  // character card + a chat roster seat), so its host floor is the gate that keeps a mere member from minting
  // library rows into the host's account. Both refusals land BEFORE any mint.
  test("promoteActor", async () => {
    const { chatId, h } = await seedGameWithRoster();
    await expect(h.service.promoteActor({ principal: principal(castId<Handle>("member")), chatId, targetRef: CAST_REF })).rejects.toThrow(DomainForbiddenError);
    await expect(h.service.promoteActor({ principal: principal(castId<Handle>("ghost")), chatId, targetRef: CAST_REF })).rejects.toThrow(DomainNotFoundError);
    expect(h.fakes.promoteMints).toHaveLength(0);
  });

  // THE REFUSAL TEXT IS PART OF THE CONTRACT (pinned 2026-08-03, lane LENS). Each host-gated verb raises its
  // OWN sentence — the reason a verb ever spelled `role !== "host"` inline instead of calling `resolveHost`.
  // Those inline compares are now collapsed onto the ONE rpg chokepoint (`guard.ts::assertHostRole`, which
  // takes the sentence as its argument), so this pin is what proves the collapse is BYTE-IDENTICAL and not a
  // silent flattening of six refusals into one generic "host authority required".
  test("each host-gated verb keeps its OWN refusal sentence (the chokepoint collapse is behavior-free)", async () => {
    const { chatId, h } = await seedGameWithRoster();
    const member = principal(castId<Handle>("member"));
    const expectMessage = async (promise: Promise<unknown>, message: string): Promise<void> => {
      await expect(promise).rejects.toThrow(new DomainForbiddenError(message));
    };
    await expectMessage(h.service.editSnapshot({ principal: member, chatId, patch: { location: "x" } }), "host authority required to hand-edit the snapshot");
    await expectMessage(
      h.service.patchActor({ principal: member, chatId, targetRef: CAST_REF, ops: [{ op: "setStatus", status: "x" }] }),
      "host authority required to hand-edit an actor",
    );
    await expectMessage(h.service.dismissActor({ principal: member, chatId, targetRef: CAST_REF }), "host authority required to dismiss an actor");
    await expectMessage(
      h.service.promoteActor({ principal: member, chatId, targetRef: CAST_REF }),
      "host authority required to promote an actor to the roster",
    );
    // createGame gates BEFORE a game exists (membership read direct, no game gate) — a second chat, no game.
    const bareChatId = await seedChat(db, "b");
    h.fakes.membership.set("user_member", "member");
    await expectMessage(h.service.createGame({ principal: member, chatId: bareChatId, mode: "lite" }), "host authority required to create a game");
    // detachDanglingPointer gates on chat MEMBERSHIP directly (the game is gone by definition) — the bare
    // chokepoint sentence, no verb-specific tail.
    await expectMessage(h.service.detachDanglingPointer({ principal: member, chatId: bareChatId }), "host authority required");
  });
});

describe("member-gated reads — a member is ALLOWED, a non-member leak-free NOT-FOUND", () => {
  test("getGame / getTrackerView / listJournal allow a member, refuse a non-member identically", async () => {
    const { chatId, h } = await seedGameWithRoster();
    await expect(h.service.getGame({ principal: principal(castId<Handle>("member")), chatId })).resolves.toBeDefined();
    await expect(h.service.getGame({ principal: principal(castId<Handle>("ghost")), chatId })).rejects.toThrow(DomainNotFoundError);
    await expect(h.service.getTrackerView({ principal: principal(castId<Handle>("member")), chatId })).resolves.toBeDefined();
    await expect(h.service.getTrackerView({ principal: principal(castId<Handle>("ghost")), chatId })).rejects.toThrow(DomainNotFoundError);
    await expect(h.service.listJournal({ principal: principal(castId<Handle>("member")), chatId })).resolves.toBeDefined();
    await expect(h.service.listJournal({ principal: principal(castId<Handle>("ghost")), chatId })).rejects.toThrow(DomainNotFoundError);
  });

  test("getConfigView is HOST-gated — a member is FORBIDDEN, a non-member NOT-FOUND", async () => {
    const { chatId, h } = await seedGameWithRoster();
    await expect(h.service.getConfigView({ principal: principal(castId<Handle>("host")), chatId })).resolves.toBeDefined();
    await expect(h.service.getConfigView({ principal: principal(castId<Handle>("member")), chatId })).rejects.toThrow(DomainForbiddenError);
    await expect(h.service.getConfigView({ principal: principal(castId<Handle>("ghost")), chatId })).rejects.toThrow(DomainNotFoundError);
  });
});

describe("patchSheet — a member may write their OWN user row, never a foreign one", () => {
  test("member writes own user sheet; a foreign user ref is FORBIDDEN; a non-member NOT-FOUND", async () => {
    const { chatId, h } = await seedGameWithRoster();
    const member = principal(castId<Handle>("member"));
    // Own row — allowed.
    await expect(
      h.service.patchSheet({ principal: member, chatId, actorRef: { kind: "user", userId: member.userId }, patch: { className: "Rogue" } }),
    ).resolves.toBeUndefined();
    // A foreign user's row — forbidden.
    await expect(
      h.service.patchSheet({
        principal: member,
        chatId,
        actorRef: { kind: "user", userId: principal(castId<Handle>("host")).userId },
        patch: { className: "x" },
      }),
    ).rejects.toThrow(DomainForbiddenError);
    // A non-member — leak-free not-found.
    await expect(
      h.service.patchSheet({
        principal: principal(castId<Handle>("ghost")),
        chatId,
        actorRef: { kind: "user", userId: principal(castId<Handle>("ghost")).userId },
        patch: { className: "x" },
      }),
    ).rejects.toThrow(DomainNotFoundError);
  });
});

describe("cross-tenant IDOR — a host may NOT reach another game's by-id rows (leak-free)", () => {
  // The by-id host verbs (updateWidget/deleteWidget/editJournalEntry/deleteJournalEntry) operate on a
  // caller-supplied entity id. Without game-scoping, host-of-A could mutate/delete game B's rows — a
  // cross-tenant write IDOR (chat A's roster ≠ chat B's roster). The refusal MUST be a leak-free not-found
  // (never Forbidden): a foreign host must not learn the id names a real row in another game. The victim
  // row is read back to prove it is UNTOUCHED.
  async function seedTwoGames(): Promise<{
    chatA: ChatId;
    chatB: ChatId;
    h: ReturnType<typeof makeRpgService>;
    entryB: RpgJournalId;
  }> {
    const chatA = await seedChat(db, "a");
    const chatB = await seedChat(db, "b");
    await seedUser(db, castId<Handle>("hostA"));
    await seedUser(db, castId<Handle>("hostB"));
    const h = makeRpgService(db);
    // hostA hosts BOTH chats' membership fakes only where relevant: hostA is host of A; hostB is host of B.
    // (getMembership's fake keys on userId; the game each verb resolves comes from its chatId param.)
    h.fakes.membership.set("user_hostA", "host");
    h.fakes.membership.set("user_hostB", "host");
    await h.service.createGame({ principal: principal(castId<Handle>("hostA")), chatId: chatA, mode: "lite" });
    await h.service.createGame({ principal: principal(castId<Handle>("hostB")), chatId: chatB, mode: "lite" });
    // Game B's own host creates a journal entry in B.
    const entryB = await h.service.addJournalEntry({
      principal: principal(castId<Handle>("hostB")),
      chatId: chatB,
      type: "note",
      title: "B-title",
      content: "B-content",
    });
    return { chatA, chatB, h, entryB };
  }

  test("editJournalEntry with a foreign game's entryId → leak-free NOT-FOUND, victim row untouched", async () => {
    const { chatA, chatB, h, entryB } = await seedTwoGames();
    const gameB = await findGameByChat(db, chatB);
    if (!gameB) {
      throw new Error("no game B");
    }
    await expect(
      h.service.editJournalEntry({ principal: principal(castId<Handle>("hostA")), chatId: chatA, entryId: entryB, patch: { content: "hijacked" } }),
    ).rejects.toThrow(DomainNotFoundError);
    // B's entry is UNTOUCHED (content unchanged).
    expect((await listActiveJournal(db, gameB.id, { limit: 50 })).find((e) => e.id === entryB)?.content).toBe("B-content");
  });

  test("deleteJournalEntry with a foreign game's entryId → leak-free NOT-FOUND, victim row survives", async () => {
    const { chatA, chatB, h, entryB } = await seedTwoGames();
    const gameB = await findGameByChat(db, chatB);
    if (!gameB) {
      throw new Error("no game B");
    }
    await expect(h.service.deleteJournalEntry({ principal: principal(castId<Handle>("hostA")), chatId: chatA, entryId: entryB })).rejects.toThrow(
      DomainNotFoundError,
    );
    // B's entry still exists.
    expect((await listActiveJournal(db, gameB.id, { limit: 50 })).some((e) => e.id === entryB)).toBe(true);
  });
});

describe("member-gated rollDice + listCheckpoints", () => {
  test("a member may roll + list; a non-member is leak-free refused", async () => {
    const { chatId, h } = await seedGameWithRoster();
    await expect(h.service.rollDice({ principal: principal(castId<Handle>("member")), chatId, notation: "1d20" })).resolves.toBeDefined();
    await expect(h.service.listCheckpoints({ principal: principal(castId<Handle>("member")), chatId })).resolves.toBeDefined();
    await expect(h.service.rollDice({ principal: principal(castId<Handle>("ghost")), chatId, notation: "1d20" })).rejects.toThrow(DomainNotFoundError);
    await expect(h.service.listCheckpoints({ principal: principal(castId<Handle>("ghost")), chatId })).rejects.toThrow(DomainNotFoundError);
  });
});
