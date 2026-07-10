import type { ChatBusEvent } from "@orb/contracts/chat";
import { chatParticipants } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { can } from "@orb/server/domain/admin";
import { createPersonaService, PersonaNotFoundError } from "@orb/server/domain/persona";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import {
  requireAuthorOrHost,
  setParticipantActivePersona,
} from "../../../../../packages/server/src/domain/chat/index.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedChat, seedParticipant } from "../../chat/_support.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("setActivePersona", () => {
  test("updates active persona when valid", async () => {
    const db = await freshDb();
    let requireCalled = false;
    let setCalledWith: { targetUserId: string; personaId: string | null } | null = null;

    const harness = makeHarness(db, {
      requireChatAuthorOrHost: (): Promise<void> => {
        requireCalled = true;
        return Promise.resolve();
      },
      setChatActivePersona: (_chatId, targetUserId, pId): Promise<void> => {
        setCalledWith = { targetUserId, personaId: pId };
        return Promise.resolve();
      },
    });
    const svc = createPersonaService(harness.ctx);

    const ownerId = await seedUser(db);
    const created = await svc.create({
      principal: principal(ownerId),
      input: { name: "x", description: "d" },
    });
    const personaId = created.id;
    const p = principal(ownerId);

    await svc.setActivePersona({
      principal: p,
      chatId: castId<ChatId>("c1"),
      targetUserId: ownerId,
      personaId,
    });

    expect(requireCalled).toBe(true);
    expect(setCalledWith).toEqual({ targetUserId: ownerId, personaId });
  });

  test("throws PersonaNotFoundError when persona does not exist or is not owned by target", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createPersonaService(harness.ctx);

    const ownerId = await seedUser(db, { handle: "owner" });
    const otherUserId = await seedUser(db, { handle: "other" });
    const created = await svc.create({
      principal: principal(otherUserId),
      input: { name: "other", description: "d" },
    });
    const personaId = created.id;
    const p = principal(ownerId);

    await expect(
      svc.setActivePersona({
        principal: p,
        chatId: castId<ChatId>("c1"),
        targetUserId: ownerId,
        personaId,
      }),
    ).rejects.toThrow(PersonaNotFoundError);
  });

  test("allows null personaId to clear active persona", async () => {
    const db = await freshDb();
    let setCalledWith: { targetUserId: string; personaId: string | null } | null = null;
    const harness = makeHarness(db, {
      setChatActivePersona: (_chatId, targetUserId, pId): Promise<void> => {
        setCalledWith = { targetUserId, personaId: pId };
        return Promise.resolve();
      },
    });
    const svc = createPersonaService(harness.ctx);

    const ownerId = await seedUser(db);
    const p = principal(ownerId);

    await svc.setActivePersona({
      principal: p,
      chatId: castId<ChatId>("c1"),
      targetUserId: ownerId,
      personaId: null,
    });

    expect(setCalledWith).toEqual({ targetUserId: ownerId, personaId: null });
  });

  test("omitted targetUserId defaults to the caller (self-case)", async () => {
    const db = await freshDb();
    let requireCalledWith: string | null = null;
    let setCalledWith: { targetUserId: string; personaId: string | null } | null = null;
    const harness = makeHarness(db, {
      requireChatAuthorOrHost: (_principal, _chatId, targetUserId): Promise<void> => {
        requireCalledWith = targetUserId;
        return Promise.resolve();
      },
      setChatActivePersona: (_chatId, targetUserId, pId): Promise<void> => {
        setCalledWith = { targetUserId, personaId: pId };
        return Promise.resolve();
      },
    });
    const svc = createPersonaService(harness.ctx);

    const ownerId = await seedUser(db);
    const created = await svc.create({
      principal: principal(ownerId),
      input: { name: "self", description: "d" },
    });

    await svc.setActivePersona({
      principal: principal(ownerId),
      chatId: castId<ChatId>("c1"),
      personaId: created.id,
    });

    expect(requireCalledWith).toBe(ownerId);
    expect(setCalledWith).toEqual({ targetUserId: ownerId, personaId: created.id });
  });

  test("host with an explicit targetUserId stamps the TARGET, not the caller", async () => {
    const db = await freshDb();
    let setCalledWith: { targetUserId: string; personaId: string | null } | null = null;
    const harness = makeHarness(db, {
      requireChatAuthorOrHost: () => Promise.resolve(),
      setChatActivePersona: (_chatId, targetUserId, pId): Promise<void> => {
        setCalledWith = { targetUserId, personaId: pId };
        return Promise.resolve();
      },
    });
    const svc = createPersonaService(harness.ctx);

    const hostId = await seedUser(db, { handle: "host" });
    const targetId = await seedUser(db, { handle: "target" });
    const created = await svc.create({
      principal: principal(targetId),
      input: { name: "target-persona", description: "d" },
    });

    await svc.setActivePersona({
      principal: principal(hostId),
      chatId: castId<ChatId>("c1"),
      targetUserId: targetId,
      personaId: created.id,
    });

    expect(setCalledWith).toEqual({ targetUserId: targetId, personaId: created.id });
  });

  test("a non-host/non-self caller is refused (requireChatAuthorOrHost gate propagates)", async () => {
    const db = await freshDb();
    const harness = makeHarness(db, {
      requireChatAuthorOrHost: () => Promise.reject(new Error("not_author_or_host")),
    });
    const svc = createPersonaService(harness.ctx);

    const callerId = await seedUser(db, { handle: "caller" });
    const targetId = await seedUser(db, { handle: "target" });

    await expect(
      svc.setActivePersona({
        principal: principal(callerId),
        chatId: castId<ChatId>("c1"),
        targetUserId: targetId,
        personaId: null,
      }),
    ).rejects.toThrow("not_author_or_host");
  });

  // ── REAL chat-wire (the two ops the composition root binds to chat's own gate + roster write) ──
  test("REAL wire, happy: the self-host caller's persona lands on chat_participants.activePersonaId", async () => {
    const db = await freshDb();
    const events: ChatBusEvent[] = [];
    // Bind the REAL chat fns exactly as compose does: the guard over {db, can}; the roster write over db + emit.
    const harness = makeHarness(db, {
      requireChatAuthorOrHost: (p, cid, target) =>
        requireAuthorOrHost({ db, can }, p, cid, target).then(() => undefined),
      setChatActivePersona: (cid, target, pid) =>
        setParticipantActivePersona(
          db,
          (e) => {
            events.push(e);
            return Promise.resolve();
          },
          { chatId: cid, targetUserId: target, personaId: pid },
        ),
    });
    const svc = createPersonaService(harness.ctx);

    const ownerId = await seedUser(db);
    const created = await svc.create({
      principal: principal(ownerId),
      input: { name: "x", description: "d" },
    });
    // The owner must be a PRESENT host participant for the real guard to pass + the real write to hit a row.
    const chatId = await seedChat(db, "rw");
    await seedParticipant(db, { chatId, key: "host", userId: ownerId, role: "host" });

    await svc.setActivePersona({
      principal: principal(ownerId),
      chatId,
      targetUserId: ownerId,
      personaId: created.id,
    });

    // The write actually landed on the participant row (not a stubbed resolve).
    const [row] = await db
      .select({ activePersonaId: chatParticipants.activePersonaId })
      .from(chatParticipants)
      .where(eq(chatParticipants.chatId, chatId));
    expect(row?.activePersonaId).toBe(created.id);
    // The real roster write emits personaSwitched (from null → the new persona).
    expect(events).toEqual([{ type: "personaSwitched", chatId, from: null, to: created.id }]);
  });

  test("REAL wire, refused: a non-participant caller is rejected by chat's real requireAuthorOrHost", async () => {
    const db = await freshDb();
    let wrote = false;
    const harness = makeHarness(db, {
      requireChatAuthorOrHost: (p, cid, target) =>
        requireAuthorOrHost({ db, can }, p, cid, target).then(() => undefined),
      setChatActivePersona: () => {
        wrote = true;
        return Promise.resolve();
      },
    });
    const svc = createPersonaService(harness.ctx);

    const ownerId = await seedUser(db);
    const created = await svc.create({
      principal: principal(ownerId),
      input: { name: "x", description: "d" },
    });
    // A chat the caller is NOT a participant of (only some other user is seated).
    const chatId = await seedChat(db, "rw2");
    const otherId = await seedUser(db, { handle: "seated" });
    await seedParticipant(db, { chatId, key: "seated", userId: otherId, role: "host" });

    await expect(
      svc.setActivePersona({
        principal: principal(ownerId),
        chatId,
        targetUserId: ownerId,
        personaId: created.id,
      }),
    ).rejects.toThrow();
    // The write never ran — the real gate refused before the roster op.
    expect(wrote).toBe(false);
  });
});
