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
    // Omitted targetUserId = the self-case (you shouldn't have to name yourself); a host targeting
    // someone else passes it explicitly. `requireChatAuthorOrHost` still gates either way.
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
