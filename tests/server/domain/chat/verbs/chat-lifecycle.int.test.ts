// The chat-ROW lifecycle + variables + persisted injections (chat.md Part III §11). Proves against a real
// libSQL db: the host-authority gate, the row writes, the variables round-trip (config plane), the injections
// CRUD, and the emitted bus events. Reached through the BUNDLE `createChatLifecycle(ctx, { emit })`.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { chatInjections, chats } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuditEntry } from "@orb/server/foundation/observability";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import { createChatLifecycle } from "../../../../../packages/server/src/domain/chat/verbs/chat-lifecycle";
import { freshDb } from "../../../../support/db";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  FROZEN_AT,
  makeChatContext,
  seedChat,
  seedParticipant,
  seedPersona,
  seedUser,
} from "../_support";

let db: Db;
let emitted: ChatBusEvent[];

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
});

const emit = (event: ChatBusEvent): Promise<void> => {
  emitted.push(event);
  return Promise.resolve();
};

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

/** Seed a room with a host + a plain member; returns their ids + the chat id. */
async function seedRoom(): Promise<{
  host: UserId;
  member: UserId;
  chatId: Awaited<ReturnType<typeof seedChat>>;
}> {
  const host = await seedUser(db, "host");
  const member = await seedUser(db, "member");
  const chatId = await seedChat(db, "a");
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
  return { host, member, chatId };
}

describe("chat-row flags (host-only)", () => {
  test("updateTitle writes the row + emits chatUpdated; a member is refused", async () => {
    const { host, member, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), { emit });

    await life.updateTitle({ principal: principal(host), chatId, title: "Renamed" });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.title).toBe("Renamed");
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);

    const err = await life
      .updateTitle({ principal: principal(member), chatId, title: "no" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
  });

  test("archive + star toggle the row flags", async () => {
    const { host, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), { emit });

    await life.archive({ principal: principal(host), chatId, archived: true });
    await life.star({ principal: principal(host), chatId, star: true });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.archived).toBe(true);
    expect(row?.star).toBe(true);
  });

  test("delete drops the chat + emits chatDeleted + writes the chat.delete audit row", async () => {
    const { host, chatId } = await seedRoom();
    const audits: AuditEntry[] = [];
    const life = createChatLifecycle(
      makeChatContext(db, {
        audit: (entry): Promise<void> => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      { emit },
    );

    await life.delete({ principal: principal(host), chatId });
    const rows = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(rows).toHaveLength(0);
    expect(emitted).toEqual([{ type: "chatDeleted", chatId }]);
    // The best-effort forensic row (entity_id is the D24-sanctioned soft ref — it outlives the chat).
    expect(audits).toEqual([
      { actorUserId: host, action: "chat.delete", entityType: "chat", entityId: chatId },
    ]);
  });

  test("a member's refused delete writes NO audit row (existence-before-audit order)", async () => {
    const { member, chatId } = await seedRoom();
    const audits: AuditEntry[] = [];
    const life = createChatLifecycle(
      makeChatContext(db, {
        audit: (entry): Promise<void> => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      { emit },
    );

    await life.delete({ principal: principal(member), chatId }).catch((e: unknown) => e);
    expect(audits).toEqual([]);
  });
});

describe("setChatAnchorPersona — the manual/host Anchor re-pin (#4, FINAL-Persona §A.6b gap #2)", () => {
  test("host re-pins to a present human's persona; emits chatUpdated; a member is refused", async () => {
    const { host, member, chatId } = await seedRoom();
    const hostPersona = await seedPersona(db, host, "host_p");
    const life = createChatLifecycle(makeChatContext(db), { emit });

    await life.setChatAnchorPersona({
      principal: principal(host),
      chatId,
      personaId: hostPersona,
    });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.anchorPersonaId).toBe(hostPersona);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);

    const err = await life
      .setChatAnchorPersona({ principal: principal(member), chatId, personaId: hostPersona })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
  });

  test("the host may pin to ANOTHER present human's persona (multi-human — the host freely picks it)", async () => {
    const { host, member, chatId } = await seedRoom();
    const memberPersona = await seedPersona(db, member, "member_p");
    const life = createChatLifecycle(makeChatContext(db), { emit });

    await life.setChatAnchorPersona({
      principal: principal(host),
      chatId,
      personaId: memberPersona,
    });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.anchorPersonaId).toBe(memberPersona);
  });

  test("a persona NOT owned by any present human participant is refused (not_persona_owner)", async () => {
    const { host, chatId } = await seedRoom();
    const outsider = await seedUser(db, "outsider");
    const foreignPersona = await seedPersona(db, outsider, "foreign_p");
    const life = createChatLifecycle(makeChatContext(db), { emit });

    const err = await life
      .setChatAnchorPersona({ principal: principal(host), chatId, personaId: foreignPersona })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_persona_owner");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.anchorPersonaId).toBeNull();
  });

  test("personaId: null clears an existing pin", async () => {
    const { host, chatId } = await seedRoom();
    const hostPersona = await seedPersona(db, host, "host_p");
    const life = createChatLifecycle(makeChatContext(db), { emit });
    await life.setChatAnchorPersona({
      principal: principal(host),
      chatId,
      personaId: hostPersona,
    });

    await life.setChatAnchorPersona({ principal: principal(host), chatId, personaId: null });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.anchorPersonaId).toBeNull();
  });
});

describe("variables — the config-plane round-trip (member)", () => {
  test("setVariables persists; get/getStored read them back; clearVariables empties", async () => {
    const { member, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), { emit });

    await life.setVariables({ principal: principal(member), chatId, values: { mood: "tense" } });
    expect(await life.getStoredVariables({ principal: principal(member), chatId })).toEqual({
      mood: "tense",
    });
    expect(await life.getVariables({ principal: principal(member), chatId })).toEqual({
      mood: "tense",
    });

    await life.clearVariables({ principal: principal(member), chatId });
    expect(await life.getStoredVariables({ principal: principal(member), chatId })).toEqual({});
  });
});

describe("injections — CRUD (write host, list member)", () => {
  test("create → list → update → delete", async () => {
    const { host, member, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), { emit });

    const created = await life.setChatInjection({
      principal: principal(host),
      chatId,
      position: "in_prompt",
      depth: 2,
      role: "system",
      content: "be terse",
    });
    expect(created.content).toBe("be terse");
    const listed = await life.listChatInjections({ principal: principal(member), chatId });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);

    const updated = await life.setChatInjection({
      principal: principal(host),
      chatId,
      id: created.id,
      position: "in_prompt",
      depth: 2,
      role: "system",
      content: "be verbose",
    });
    expect(updated.id).toBe(created.id);
    const [row] = await db.select().from(chatInjections).where(eq(chatInjections.id, created.id));
    expect(row?.content).toBe("be verbose");

    await life.deleteChatInjection({ principal: principal(host), chatId, injectionId: created.id });
    expect(await life.listChatInjections({ principal: principal(member), chatId })).toHaveLength(0);
  });

  test("a member cannot write an injection (host-only)", async () => {
    const { member, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), { emit });
    const err = await life
      .setChatInjection({
        principal: principal(member),
        chatId,
        position: "in_prompt",
        depth: 0,
        role: "system",
        content: "x",
      })
      .catch((e: unknown) => e);
    expect((err as ChatOperationError).code).toBe("not_host");
  });
});

describe("reapTemporaryChats — the caller's expired temp chats (PD-65)", () => {
  // The verb's 24h TTL against the frozen clock: a chat born just past the horizon is reap-eligible.
  const ttlMs = 86_400_000;
  const expiredAt = FROZEN_AT - ttlMs - 1;

  test("reaps only expired+temporary+caller-hosted; fresh / non-temp / foreign-hosted survive", async () => {
    const host = await seedUser(db, "host");
    const other = await seedUser(db, "other");
    // 1. expired temporary hosted by the caller → REAPED.
    const reapable = await seedChat(db, "reapable", { temporary: true, createdAt: expiredAt });
    await seedParticipant(db, { chatId: reapable, key: "r_h", userId: host, role: "host" });
    // 2. FRESH temporary hosted by the caller → survives (inside the TTL).
    const fresh = await seedChat(db, "fresh", { temporary: true });
    await seedParticipant(db, { chatId: fresh, key: "f_h", userId: host, role: "host" });
    // 3. expired NON-temporary hosted by the caller → survives (never reap a real chat).
    const persistent = await seedChat(db, "persistent", { createdAt: expiredAt });
    await seedParticipant(db, { chatId: persistent, key: "p_h", userId: host, role: "host" });
    // 4. expired temporary hosted by SOMEONE ELSE (caller is a mere member) → survives (host-only sweep).
    const foreign = await seedChat(db, "foreign", { temporary: true, createdAt: expiredAt });
    await seedParticipant(db, { chatId: foreign, key: "x_h", userId: other, role: "host" });
    await seedParticipant(db, { chatId: foreign, key: "x_m", userId: host, role: "member" });

    const life = createChatLifecycle(makeChatContext(db), { emit });
    expect(await life.reapTemporaryChats({ principal: principal(host) })).toEqual({ reaped: 1 });

    const surviving = (await db.select({ id: chats.id }).from(chats)).map((r) => r.id);
    expect(surviving).not.toContain(reapable);
    expect(surviving).toEqual(expect.arrayContaining([fresh, persistent, foreign]));
    // No bus event for reaped ephemera (neo parity — see the verb header).
    expect(emitted).toEqual([]);
    // Idempotent: a second sweep finds nothing.
    expect(await life.reapTemporaryChats({ principal: principal(host) })).toEqual({ reaped: 0 });
  });
});
