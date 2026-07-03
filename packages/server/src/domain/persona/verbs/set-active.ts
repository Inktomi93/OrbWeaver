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
    await ctx.requireChatAuthorOrHost(principal, chatId, targetUserId);

    if (personaId !== null) {
      const row = await ctx.db
        .select({ id: personas.id })
        .from(personas)
        .where(and(eq(personas.id, personaId), eq(personas.ownerId, targetUserId)))
        .limit(1);

      if (row.length === 0) {
        throw new PersonaNotFoundError(personaId);
      }
    }

    await ctx.setChatActivePersona(chatId, targetUserId, personaId);
  };
}
