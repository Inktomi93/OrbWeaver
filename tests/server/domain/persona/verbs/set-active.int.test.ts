import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPersonaService, PersonaNotFoundError } from "@orb/server/domain/persona";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
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

    const ownerId = await seedUser(db);
    const otherUserId = await seedUser(db);
    const created = await svc.create({
      principal: principal(otherUserId),
      input: { name: "other", description: "d" },
    });
    const personaId = created.id; // Owned by someone else
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
});
