// The roster / group-config / room-override / membership-lifecycle verbs (chat.md Part III §1/§9/§11). Proves
// against a real libSQL db: the host-authority gate (member denied with `not_host`), the persistence effect,
// the emitted `chatUpdated` bus event, and the kick `kicked` notification — with the REAL admin `can()`. The
// verbs are reached through the grouped-file BUNDLE (`createRoster(ctx, { emit })`).

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent, ParticipantView, RoomOverrides } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import { characters, chatParticipants, chats } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuditEntry } from "@orb/server/foundation/observability";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { ChatNotFoundError, ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import { createRoster, setParticipantActivePersona } from "../../../../../packages/server/src/domain/chat/verbs/roster";
import { freshDb } from "../../../../support/db";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeChatContext, seedAgent, seedCharacter, seedChat, seedParticipant, seedPersona, seedUser } from "../_support";

let db: Db;
let emitted: ChatBusEvent[];

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
});

/** A recording emit-op fake that HONORS the PD-24 contract: it records the event AND commits the producer's
 *  unexecuted co-statements (the op owns the commit — without this the membership transition never lands). */
function recordingEmit(notes: NotificationEvent[]): (event: NotificationEvent, coStatements?: readonly unknown[]) => Promise<void> {
  return async (event, coStatements) => {
    notes.push(event);
    if (coStatements !== undefined && coStatements.length > 0) {
      await db.batch(batchMany(coStatements as BatchStmt[]));
    }
  };
}

const emit = (event: ChatBusEvent): Promise<void> => {
  emitted.push(event);
  return Promise.resolve();
};

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

const card = (name: string): CharacterCard => ({ name, avatarAssetId: null }) as unknown as CharacterCard;

/** An owner-scoped `getCard` fake mirroring the REAL one (D28 — `loadOwnedCharacterRow`): the card resolves
 *  only for its OWNER, `null` for a non-owner. The handoff cast-drop resolver (D64 / F4) calls this per seated
 *  character to decide which seats the NEW host doesn't own (→ dropped); the harness default is a bare `null`. */
function ownedCard(): (params: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<CharacterCard | null> {
  return async ({ ownerId, characterId }) => {
    const [row] = await db.select().from(characters).where(eq(characters.id, characterId));
    return row !== undefined && row.ownerId === ownerId ? card(row.name) : null;
  };
}

describe("setGroupConfig — host-only metadata write", () => {
  test("the host writes a fully-defaulted GroupConfig + emits chatUpdated", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    const result = await roster.setGroupConfig({
      principal: principal(host),
      chatId,
      config: { output: "per-speaker", policy: "natural" },
    });

    expect(result.output).toBe("per-speaker");
    // cardScope only exists on the per-speaker arm — narrow in the expect arg (no conditional-expect).
    expect(result.output === "per-speaker" ? result.cardScope : undefined).toBe("merged");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.group?.output).toBe("per-speaker");
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("a plain member is refused with not_host", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster
      .setGroupConfig({
        principal: principal(member),
        chatId,
        config: { output: "per-speaker", policy: "natural" },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    expect(emitted).toEqual([]);
  });
});

describe("setRoomOverrides — the four-field allowlist", () => {
  test("the host writes the allowed fields", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    const result = await roster.setRoomOverrides({
      principal: principal(host),
      chatId,
      overrides: { scenario: "a tavern" },
    });
    expect(result).toEqual({ scenario: "a tavern" });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.roomOverrides).toEqual({ scenario: "a tavern" });
  });

  test("a stray field is default-denied with forbidden_override", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster
      .setRoomOverrides({
        principal: principal(host),
        chatId,
        overrides: { scenario: "ok", evil: "system prompt" } as unknown as RoomOverrides,
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("forbidden_override");
  });
});

describe("get group config for chat — member read", () => {
  test("an absent group sub-blob resolves to the canonical default", async () => {
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });

    const cfg = await roster.getGroupConfigForChat({ principal: principal(member), chatId });
    expect(cfg.output).toBe("per-speaker");
    expect(cfg.policy).toBe("natural");
  });
});

describe("add character to chat — the participant-insert chokepoint", () => {
  test("the host adds a character; the row is inserted + the view resolves the card", async () => {
    const host = await seedUser(db, "host");
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) }), {
      emit,
    });

    const view = await roster.addCharacterToChat({
      principal: principal(host),
      chatId,
      characterId,
    });

    expect(view.kind).toBe("character");
    expect(view.characterId).toBe(characterId);
    expect(view.role).toBe("member");
    expect(view.displayName).toBe("Aria");
    const rows = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(rows).toHaveLength(1);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("a foreign/unknown character is refused NOT_FOUND — no ghost seat (PD-21)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    // The owner-scoped card read: a foreign character resolves null (foreign == missing, leak-free).
    const roster = createRoster(makeChatContext(db, { getCard: () => Promise.resolve(null) }), {
      emit,
    });

    await expect(
      roster.addCharacterToChat({
        principal: principal(host),
        chatId,
        characterId: castId<CharacterId>("character_foreign"),
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.kind, "character"));
    expect(rows).toHaveLength(0);
    expect(emitted).toEqual([]);
  });
});

describe("setParticipantDisabled — host mute", () => {
  test("the host mutes a present character participant", async () => {
    const host = await seedUser(db, "host");
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "c", characterId, role: "member" });
    const roster = createRoster(makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) }), {
      emit,
    });

    const view = await roster.setParticipantDisabled({
      principal: principal(host),
      chatId,
      characterId,
      disabled: true,
    });
    expect(view.disabled).toBe(true);
    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.characterId, characterId));
    expect(row?.disabled).toBe(true);
  });

  test("a character that is not a present participant is refused with participant_not_found", async () => {
    const host = await seedUser(db, "host");
    const characterId = await seedCharacter(db, host, "aria"); // owned, but never added to the roster
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster.setParticipantDisabled({ principal: principal(host), chatId, characterId, disabled: true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("participant_not_found");
    expect(emitted).toEqual([]);
  });
});

describe("setParticipantTalkativeness — host sets the 0–1 arbitration weight", () => {
  test("the host sets a present character's talkativeness; the column + view reflect it", async () => {
    const host = await seedUser(db, "host");
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "c", characterId, role: "member" });
    const roster = createRoster(makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) }), {
      emit,
    });

    const view = await roster.setParticipantTalkativeness({
      principal: principal(host),
      chatId,
      characterId,
      talkativeness: 0.8,
    });
    expect(view.talkativeness).toBe(0.8);
    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.characterId, characterId));
    expect(row?.talkativeness).toBe(0.8);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("a non-host member is refused with not_host", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "c", characterId, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });

    await expect(
      roster.setParticipantTalkativeness({
        principal: principal(member),
        chatId,
        characterId,
        talkativeness: 0.9,
      }),
    ).rejects.toMatchObject({ code: "not_host" });
    expect(emitted).toEqual([]);
  });
});

describe("kick — host removes a member", () => {
  test("the member's leftSeq is stamped + a kicked notification is delivered", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createRoster(
      makeChatContext(db, {
        emitNotification: recordingEmit(notes),
      }),
      { emit },
    );

    await roster.kick({ principal: principal(host), chatId, userId: member });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, member));
    expect(row?.leftSeq).not.toBeNull();
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
    expect(notes).toEqual([{ type: "kicked", recipientUserId: member, chatId }]);
  });
});

describe("selfLeave — a sole-host self-leave archives the room", () => {
  test("a host leaving with no successor archives (never refused)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    await roster.selfLeave({ principal: principal(host), chatId });

    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.archived).toBe(true);
    const [p] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, host));
    expect(p?.leftSeq).not.toBeNull();
  });
});

describe("nominateHostHandoff — host nominates a present member (step 1)", () => {
  test("the host nominates a member: pendingHostUserId is set + the nominee is notified", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createRoster(
      makeChatContext(db, {
        emitNotification: recordingEmit(notes),
      }),
      { emit },
    );

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });

    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.pendingHostUserId).toBe(member);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
    expect(notes).toEqual([{ type: "handoff-nominated", recipientUserId: member, chatId }]);
  });

  test("a plain member nominating is refused with not_host (no nomination written)", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const other = await seedUser(db, "other");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "o", userId: other, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster.nominateHostHandoff({ principal: principal(member), chatId, userId: other }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.pendingHostUserId).toBeNull();
    expect(emitted).toEqual([]);
  });

  test("nominating a non-member is rejected leak-free (not found); no nomination written", async () => {
    const host = await seedUser(db, "host");
    const stranger = await seedUser(db, "stranger");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: stranger }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatNotFoundError);
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.pendingHostUserId).toBeNull();
    expect(emitted).toEqual([]);
  });
});

describe("acceptHostHandoff — the nominee self-action (step 2)", () => {
  test("the nominee accepts: roles swap, the nomination clears, the old host is notified", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createRoster(
      makeChatContext(db, {
        emitNotification: recordingEmit(notes),
      }),
      { emit },
    );
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });
    emitted.length = 0;
    notes.length = 0;

    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    expect(rows.find((r) => r.userId === host)?.role).toBe("member");
    expect(rows.find((r) => r.userId === member)?.role).toBe("host");
    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.pendingHostUserId).toBeNull();
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
    expect(notes).toEqual([
      {
        type: "handoff-accepted",
        recipientUserId: host,
        chatId,
        newHostHandle: principal(member).handle,
      },
    ]);
  });

  test("a non-nominee accept is refused with not_turn_owner (the self-promotion hole stays closed)", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const attacker = await seedUser(db, "attacker");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "x", userId: attacker, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });
    emitted.length = 0;

    const err = await roster.acceptHostHandoff({ principal: principal(attacker), chatId }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_turn_owner");
    // Roles untouched; the nomination still stands for the real nominee; nothing emitted.
    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    expect(rows.find((r) => r.userId === host)?.role).toBe("host");
    expect(rows.find((r) => r.userId === attacker)?.role).toBe("member");
    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.pendingHostUserId).toBe(member);
    expect(emitted).toEqual([]);
  });

  test("accept with no pending nomination is refused with not_turn_owner", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster.acceptHostHandoff({ principal: principal(member), chatId }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_turn_owner");
  });

  // D64 (F4/PD-21 ruling): host authority MOVES to a non-card-owner — the handoff SUCCEEDS, transferring the
  // room + history but DROPPING the outgoing host's character seats (leaving the humans; the new owner adds
  // their own). Driven at the verb layer with seeded non-owner principals (multi-human membership is unwired).
  test("handoff to a non-owner SUCCEEDS: the outgoing host's characters are dropped, the owner's kept, humans remain", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    // Single-owner cast (D28): aria belongs to the OUTGOING host, bella to the NOMINEE. After the handoff the
    // new host (member) resolves bella but NOT aria → aria's seat drops, bella's stays.
    const aria = await seedCharacter(db, host, "aria");
    const bella = await seedCharacter(db, member, "bella");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "ca", characterId: aria, role: "member" });
    await seedParticipant(db, { chatId, key: "cb", characterId: bella, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createRoster(makeChatContext(db, { getCard: ownedCard(), emitNotification: recordingEmit(notes) }), { emit });
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });
    emitted.length = 0;
    notes.length = 0;

    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    // Host authority transferred; both humans remain present.
    expect(rows.find((r) => r.userId === host)?.role).toBe("member");
    expect(rows.find((r) => r.userId === host)?.leftSeq).toBeNull();
    expect(rows.find((r) => r.userId === member)?.role).toBe("host");
    expect(rows.find((r) => r.userId === member)?.leftSeq).toBeNull();
    // The outgoing host's character seat is DROPPED (leftSeq stamped); the new host's is KEPT present.
    expect(rows.find((r) => r.characterId === aria)?.leftSeq).not.toBeNull();
    expect(rows.find((r) => r.characterId === bella)?.leftSeq).toBeNull();
    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.pendingHostUserId).toBeNull();
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("a nominee who owns the WHOLE seated cast keeps every character seat on handoff", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    // The nominee owns the seated character → the new host resolves it, so no seat drops.
    const characterId = await seedCharacter(db, member, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "c", characterId, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createRoster(makeChatContext(db, { getCard: ownedCard(), emitNotification: recordingEmit(notes) }), { emit });
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });

    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    expect(rows.find((r) => r.userId === host)?.role).toBe("member");
    expect(rows.find((r) => r.userId === member)?.role).toBe("host");
    // The nominee-owned character seat is retained (present).
    expect(rows.find((r) => r.characterId === characterId)?.leftSeq).toBeNull();
    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.pendingHostUserId).toBeNull();
  });
});

describe("audit wiring — the membership/config mutations write best-effort audit rows", () => {
  interface RecordedAudit {
    readonly entry: AuditEntry;
    readonly at: number;
  }

  function auditRecorder(rows: RecordedAudit[]): (entry: AuditEntry, at: number) => Promise<void> {
    return (entry, at) => {
      rows.push({ entry, at });
      return Promise.resolve();
    };
  }

  test("kick writes chat.kick with the target AFTER the transition committed", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const rows: RecordedAudit[] = [];
    const notes: NotificationEvent[] = [];
    const roster = createRoster(makeChatContext(db, { emitNotification: recordingEmit(notes), audit: auditRecorder(rows) }), { emit });

    await roster.kick({ principal: principal(host), chatId, userId: member });

    expect(rows).toEqual([
      {
        entry: {
          actorUserId: host,
          action: "chat.kick",
          entityType: "chat",
          entityId: chatId,
          metadata: { targetUserId: member },
        },
        at: expect.any(Number),
      },
    ]);
  });

  test("an idempotent no-op kick (target not present) writes NO audit row", async () => {
    const host = await seedUser(db, "host");
    const ghost = await seedUser(db, "ghost");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const rows: RecordedAudit[] = [];
    const roster = createRoster(makeChatContext(db, { audit: auditRecorder(rows) }), { emit });

    await roster.kick({ principal: principal(host), chatId, userId: ghost });

    expect(rows).toEqual([]);
  });

  test("nominate + accept write the two handoff rows (nominee / previous host)", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const rows: RecordedAudit[] = [];
    const notes: NotificationEvent[] = [];
    const roster = createRoster(makeChatContext(db, { emitNotification: recordingEmit(notes), audit: auditRecorder(rows) }), { emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });
    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    expect(rows.map((r) => r.entry.action)).toEqual(["chat.nominateHostHandoff", "chat.acceptHostHandoff"]);
    expect(rows.at(0)?.entry.metadata).toEqual({ nomineeUserId: member });
    expect(rows.at(1)?.entry.metadata).toEqual({ previousHostUserId: host });
    expect(rows.at(1)?.entry.actorUserId).toBe(member);
  });

  test("setGroupConfig logs output/policy; setRoomOverrides logs FIELD LABELS only (never bodies)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const rows: RecordedAudit[] = [];
    const roster = createRoster(makeChatContext(db, { audit: auditRecorder(rows) }), { emit });

    await roster.setGroupConfig({
      principal: principal(host),
      chatId,
      config: { output: "per-speaker", policy: "natural" },
    });
    await roster.setRoomOverrides({
      principal: principal(host),
      chatId,
      overrides: { scenario: "a SECRET scenario body" },
    });

    expect(rows.at(0)?.entry.action).toBe("chat.setGroupConfig");
    expect(rows.at(0)?.entry.metadata).toEqual({ output: "per-speaker", policy: "natural" });
    expect(rows.at(1)?.entry.action).toBe("chat.setRoomOverrides");
    // The override BODY must never reach the log row — labels only (Part III §9).
    expect(rows.at(1)?.entry.metadata).toEqual({ fields: ["scenario"] });
    expect(JSON.stringify(rows.at(1)?.entry)).not.toContain("SECRET");
  });

  test("a refused write (member calling a host verb) writes NO audit row", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const rows: RecordedAudit[] = [];
    const roster = createRoster(makeChatContext(db, { audit: auditRecorder(rows) }), { emit });

    await roster.kick({ principal: principal(member), chatId, userId: host }).catch((e: unknown) => e);

    expect(rows).toEqual([]);
  });
});

describe("seatAgent — the ONE agent-seat chokepoint (D60, doc 04 §3)", () => {
  const Agent = castId<UserId>("user_buddy");

  /** A roster bundle whose agent ops are stubbed (the real mint is tested in sessions' provision-agent
   *  int-test; here we exercise the VERB — owner-presence, containment, the seat upsert, the view). */
  function seatRoster(opts: { enabled?: boolean } = {}): ReturnType<typeof createRoster> {
    const ctx = makeChatContext(db, {
      provisionAgentPrincipal: () => Promise.resolve({ agentUserId: Agent, created: true }),
      // The ONE agent kill-switch read: an AgentActor whose `enabled` drives the seat containment refusal
      // (ownerUserId is unread by seatAgent — a placeholder in this double).
      resolveAgentActor: () => Promise.resolve({ kind: "agent", userId: Agent, ownerUserId: Agent, enabled: opts.enabled ?? true }),
    });
    return createRoster(ctx, { emit });
  }

  const agentRows = async (chatId: ChatId): Promise<(typeof chatParticipants.$inferSelect)[]> =>
    await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "agent")));

  test("the host seats their OWN agent (owner==host): a kind='agent' member row + chatUpdated", async () => {
    const host = await seedUser(db, "host");
    await seedAgent(db, host, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });

    const view = await seatRoster().seatAgent({
      principal: principal(host),
      chatId,
      ownerUserId: host,
      sourceKind: "buddy",
    });

    expect(view.kind).toBe("agent");
    expect(view.userId).toBe(Agent);
    expect(view.characterId).toBeNull();
    expect(view.role).toBe("member");
    const rows = await agentRows(chatId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(Agent);
    expect(rows[0]?.leftSeq).toBeNull();
    expect(emitted).toContainEqual({ type: "chatUpdated", chatId });
  });

  test("the host seats a present member's agent when the owner is not the host", async () => {
    const host = await seedUser(db, "host");
    const friend = await seedUser(db, "friend");
    await seedAgent(db, friend, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "f", userId: friend, role: "member" });

    const view = await seatRoster().seatAgent({
      principal: principal(host),
      chatId,
      ownerUserId: friend,
      sourceKind: "buddy",
    });
    expect(view.userId).toBe(Agent);
    expect(await agentRows(chatId)).toHaveLength(1);
  });

  test("a non-host member is refused (not_host) — no seat", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    await seedAgent(db, member, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });

    await expect(
      seatRoster().seatAgent({
        principal: principal(member),
        chatId,
        ownerUserId: member,
        sourceKind: "buddy",
      }),
    ).rejects.toMatchObject({ code: "not_host" });
    expect(await agentRows(chatId)).toHaveLength(0);
  });

  test("an owner who is NOT a present member is refused (owner_not_present)", async () => {
    const host = await seedUser(db, "host");
    const stranger = await seedUser(db, "stranger");
    await seedAgent(db, stranger, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });

    await expect(
      seatRoster().seatAgent({
        principal: principal(host),
        chatId,
        ownerUserId: stranger, // owns an agent but is not in the room
        sourceKind: "buddy",
      }),
    ).rejects.toMatchObject({ code: "owner_not_present" });
    expect(await agentRows(chatId)).toHaveLength(0);
  });

  test("a DISABLED agent principal is refused the seat (agent_disabled) — containment", async () => {
    const host = await seedUser(db, "host");
    await seedAgent(db, host, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });

    await expect(
      seatRoster({ enabled: false }).seatAgent({
        principal: principal(host),
        chatId,
        ownerUserId: host,
        sourceKind: "buddy",
      }),
    ).rejects.toMatchObject({ code: "agent_disabled" });
    expect(await agentRows(chatId)).toHaveLength(0);
  });

  test("re-seat of a KICKED agent re-joins (leftSeq cleared); a double-seat is idempotent", async () => {
    const host = await seedUser(db, "host");
    await seedAgent(db, host, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = seatRoster();
    const seat = (): Promise<ParticipantView> =>
      roster.seatAgent({
        principal: principal(host),
        chatId,
        ownerUserId: host,
        sourceKind: "buddy",
      });

    await seat();
    // Double-seat while present → idempotent (still exactly one row, present).
    await seat();
    expect(await agentRows(chatId)).toHaveLength(1);

    // Kick the agent (stamp leftSeq), then re-seat → the SAME row re-joins (leftSeq cleared), no duplicate.
    await db
      .update(chatParticipants)
      .set({ leftSeq: 5 })
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, Agent)));
    await seat();
    const rows = await agentRows(chatId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.leftSeq).toBeNull();
  });
});

describe("setParticipantActivePersona — the chat-domain write persona.setActivePersona calls (PD-120)", () => {
  test("flips a present human's activePersonaId + emits personaSwitched with from/to", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const personaId = await seedPersona(db, host, "a");

    await setParticipantActivePersona(db, emit, { chatId, targetUserId: host, personaId });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, host));
    expect(row?.activePersonaId).toBe(personaId);
    expect(emitted).toEqual([{ type: "personaSwitched", chatId, from: null, to: personaId }]);
  });

  test("reports the prior persona as `from` on a second switch", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const first = await seedPersona(db, host, "a");
    const second = await seedPersona(db, host, "b");
    await seedParticipant(db, {
      chatId,
      key: "h",
      userId: host,
      role: "host",
      activePersonaId: first,
    });

    await setParticipantActivePersona(db, emit, { chatId, targetUserId: host, personaId: second });

    expect(emitted).toEqual([{ type: "personaSwitched", chatId, from: first, to: second }]);
  });

  test("clearing back to null is a valid switch (to: null)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const personaId = await seedPersona(db, host, "a");
    await seedParticipant(db, {
      chatId,
      key: "h",
      userId: host,
      role: "host",
      activePersonaId: personaId,
    });

    await setParticipantActivePersona(db, emit, { chatId, targetUserId: host, personaId: null });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, host));
    expect(row?.activePersonaId).toBeNull();
    expect(emitted).toEqual([{ type: "personaSwitched", chatId, from: personaId, to: null }]);
  });

  test("a target that is not a PRESENT participant is refused with participant_not_found — no emit", async () => {
    const host = await seedUser(db, "host");
    const stranger = await seedUser(db, "stranger");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const personaId = await seedPersona(db, host, "a");

    const err = await setParticipantActivePersona(db, emit, {
      chatId,
      targetUserId: stranger,
      personaId,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("participant_not_found");
    expect(emitted).toEqual([]);
  });

  test("a LEFT participant (leftSeq set) is treated as not-present — refused, no emit", async () => {
    const host = await seedUser(db, "host");
    const former = await seedUser(db, "former");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "f", userId: former, role: "member", leftSeq: 3 });
    const personaId = await seedPersona(db, former, "a");

    const err = await setParticipantActivePersona(db, emit, {
      chatId,
      targetUserId: former,
      personaId,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("participant_not_found");
    expect(emitted).toEqual([]);
  });
});
