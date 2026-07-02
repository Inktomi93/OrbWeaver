// The roster / group-config / room-override / membership-lifecycle verbs (chat.md Part III §1/§9/§11). Proves
// against a real libSQL db: the host-authority gate (member denied with `not_host`), the persistence effect,
// the emitted `chatUpdated` bus event, and the kick `kicked` notification — with the REAL admin `can()`. The
// verbs are reached through the grouped-file BUNDLE (`createRoster(ctx, { emit })`).

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent, RoomOverrides } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import { chatParticipants, chats } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  ChatNotFoundError,
  ChatOperationError,
} from "../../../../../packages/server/src/domain/chat/contract/errors";
import { createRoster } from "../../../../../packages/server/src/domain/chat/verbs/roster";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeChatContext, seedCharacter, seedChat, seedParticipant, seedUser } from "../_support";

let db: Db;
let emitted: ChatBusEvent[];

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
});

/** A recording emit-op fake that HONORS the PD-24 contract: it records the event AND commits the producer's
 *  unexecuted co-statements (the op owns the commit — without this the membership transition never lands). */
function recordingEmit(
  notes: NotificationEvent[],
): (event: NotificationEvent, coStatements?: readonly unknown[]) => Promise<void> {
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
  return { userId, role: "user", handle: castId<Handle>("h"), externalId: null, via: "cookie" };
}

const card = (name: string): CharacterCard =>
  ({ name, avatarAssetId: null }) as unknown as CharacterCard;

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
    const roster = createRoster(
      makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) }),
      {
        emit,
      },
    );

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
      .where(
        and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)),
      );
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
    // No ghost roster seat; no bus event.
    const rows = await db
      .select()
      .from(chatParticipants)
      .where(eq(chatParticipants.kind, "character"));
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
    const roster = createRoster(
      makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) }),
      {
        emit,
      },
    );

    const view = await roster.setParticipantDisabled({
      principal: principal(host),
      chatId,
      characterId,
      disabled: true,
    });
    expect(view.disabled).toBe(true);
    const [row] = await db
      .select()
      .from(chatParticipants)
      .where(eq(chatParticipants.characterId, characterId));
    expect(row?.disabled).toBe(true);
  });

  test("a character that is not a present participant is refused with participant_not_found", async () => {
    const host = await seedUser(db, "host");
    const characterId = await seedCharacter(db, host, "aria"); // owned, but never added to the roster
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster
      .setParticipantDisabled({ principal: principal(host), chatId, characterId, disabled: true })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("participant_not_found");
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

    const [row] = await db
      .select()
      .from(chatParticipants)
      .where(eq(chatParticipants.userId, member));
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

    const err = await roster
      .nominateHostHandoff({ principal: principal(member), chatId, userId: other })
      .catch((e: unknown) => e);
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

    const err = await roster
      .nominateHostHandoff({ principal: principal(host), chatId, userId: stranger })
      .catch((e: unknown) => e);
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

    const rows = await db
      .select()
      .from(chatParticipants)
      .where(eq(chatParticipants.chatId, chatId));
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

    const err = await roster
      .acceptHostHandoff({ principal: principal(attacker), chatId })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_turn_owner");
    // Roles untouched; the nomination still stands for the real nominee; nothing emitted.
    const rows = await db
      .select()
      .from(chatParticipants)
      .where(eq(chatParticipants.chatId, chatId));
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

    const err = await roster
      .acceptHostHandoff({ principal: principal(member), chatId })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_turn_owner");
  });
});
