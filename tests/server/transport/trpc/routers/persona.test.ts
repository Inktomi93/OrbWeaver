// persona.setActivePersona — the PD-99 wire-through (core/Tier-4-Transport.md). The router is a THIN
// driver: validate the branded-id triple (personaId NULLABLE — null clears the slot) → delegate to
// `ctx.services.persona.setActivePersona` with `principal = ctx.auth` (the verb owns the host-or-self
// gate + the owner-scoped persona existence check). Driven through the real ladder via `createCaller`.

import type { ChatId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PersonaService } from "@orb/server/domain/persona";
import type { Context } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures";
import { caller, makeContext, principal } from "../_support.ts";

const ACTOR = castId<UserId>("user_actor");
const TARGET = castId<UserId>("user_target");
const CHAT = castId<ChatId>("chat_1");
const PERSONA = castId<PersonaId>("persona_1");

function ctxWith(persona: Partial<PersonaService>): Context {
  return makeContext({ auth: principal("user", { userId: ACTOR }), services: { persona } });
}

describe("persona.setActivePersona — wire-through", () => {
  test("delegates the parsed triple to the verb with the acting principal", async () => {
    const setActivePersona = vi.fn<PersonaService["setActivePersona"]>(async () => {
      // resolves void — the verb owns the write; the router only delegates.
    });
    await caller(ctxWith({ setActivePersona })).persona.setActivePersona({
      chatId: CHAT,
      targetUserId: TARGET,
      personaId: PERSONA,
    });
    expect(setActivePersona).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: ACTOR }),
      chatId: CHAT,
      targetUserId: TARGET,
      personaId: PERSONA,
    });
  });

  test("passes personaId null verbatim (the clear-the-slot arm)", async () => {
    const setActivePersona = vi.fn<PersonaService["setActivePersona"]>(async () => {
      // resolves void.
    });
    await caller(ctxWith({ setActivePersona })).persona.setActivePersona({
      chatId: CHAT,
      targetUserId: TARGET,
      personaId: null,
    });
    expect(setActivePersona).toHaveBeenCalledWith(expect.objectContaining({ personaId: null }));
  });

  test("an omitted targetUserId is accepted at the wire boundary and passed through undefined (the verb defaults it to self)", async () => {
    const setActivePersona = vi.fn<PersonaService["setActivePersona"]>(async () => {
      // resolves void.
    });
    await caller(ctxWith({ setActivePersona })).persona.setActivePersona({
      chatId: CHAT,
      personaId: PERSONA,
    });
    expect(setActivePersona).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: ACTOR }),
      chatId: CHAT,
      targetUserId: undefined,
      personaId: PERSONA,
    });
  });
});
