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
    // 1. Authorize: Host or Self (delegated to chat domain via injected op)
    await ctx.requireChatAuthorOrHost(principal, chatId, targetUserId);

    // 2. Validate persona ownership if one is provided
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

    // 3. Update the chat participant (delegated to chat domain via injected op)
    await ctx.setChatActivePersona(chatId, targetUserId, personaId);
  };
}
