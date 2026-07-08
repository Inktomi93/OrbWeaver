import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPersonaService, PersonaNotFoundError } from "@orb/server/domain/persona";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
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
});
