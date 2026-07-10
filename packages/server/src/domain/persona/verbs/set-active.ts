// verb: setActivePersona — set (or clear, `personaId:null`) the active persona for ONE participant in a chat.
// The write lands in `chat_participants.activePersonaId` — a CHAT-domain column — via the INJECTED
// `setChatActivePersona` op (persona sideways-imports nothing; the runtime is wired at `entry/compose`).
//
// AUTHORITY — host-or-self (the subtle part). The target is `targetUserId ?? principal.userId`: omit it for
// the self-case (you needn't name yourself), a host passes it explicitly to set someone else's. Either way the
// INJECTED `requireChatAuthorOrHost` gates it (chat's guard → the `{kind:'chat', roster}` `can()` arm — the
// spine's only host/role comparison site; persona never reads the roster). The persona pins to the TARGET's
// ownership, NOT the principal's: a non-null `personaId` must be a persona owned by `target` (the WHERE scopes
// `ownerId = target`) — so a host can never assign THEIR own persona onto another participant, and a
// foreign/absent persona collapses to `PersonaNotFoundError` (no existence leak). `null` clears with no such
// check. No audit + no user-bus emit: this mutates a chat-participant column, not a persona-CRUD row (the
// `personasChanged` freshness lane covers the persona LIST, which is untouched here).

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
