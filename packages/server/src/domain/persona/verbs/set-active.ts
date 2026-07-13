// verb: setActivePersona — set/clear the active persona for ONE participant in a chat. Writes
// chat_participants.activePersonaId via the injected setChatActivePersona op (persona sideways-imports
// nothing). A non-null personaId must be owned by the TARGET (not the principal) — a host can never assign
// their own persona onto another participant; foreign/absent collapses to PersonaNotFoundError.

import { personas } from "@orb/db";
import { and, eq } from "drizzle-orm";
import { PersonaNotFoundError } from "../contract/errors";
import type { SetActivePersonaParams } from "../contract/params";
import type { PersonaContext, PersonaService } from "../contract/service";

export function createSetActive(ctx: PersonaContext): PersonaService["setActivePersona"] {
  return async ({
    principal,
    chatId,
    targetUserId,
    personaId,
  }: SetActivePersonaParams): Promise<void> => {
    const target = targetUserId ?? principal.userId;
    await ctx.requireChatAuthorOrHost(principal, chatId, target);

    if (personaId !== null) {
      const row = await ctx.db
        .select({ id: personas.id })
        .from(personas)
        .where(and(eq(personas.id, personaId), eq(personas.ownerId, target)))
        .limit(1);

      if (row.length === 0) {
        throw new PersonaNotFoundError(personaId);
      }
    }

    await ctx.setChatActivePersona(chatId, target, personaId);
  };
}
