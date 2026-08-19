import type { UserId } from "@orb/kit/ids";
import type { PersonaUsageOpts } from "../contract/params.ts";
import type { StatsContext, StatsService } from "../contract/service.ts";
import type { PersonaUsageRow } from "../contract/views.ts";
import { readPersonaUsage } from "../persistence/rollups.ts";

// personaUsage — live per-persona usage (a cheap chat-level GROUP BY, always fresh, NOT rolled up — so a
// just-created persona shows immediately). D18: a persona is "used" via a chat's anchor persona OR a
// participant's active persona. `opts.characterId` narrows the chat set to one character's chats (the
// analytics CONTEXT panel's drilled state); ownership stays on `personas.owner_id` either way.

export function createPersonaUsage(ctx: StatsContext): Pick<StatsService, "personaUsage"> {
  async function personaUsage(ownerId: UserId, opts?: PersonaUsageOpts): Promise<PersonaUsageRow[]> {
    return await readPersonaUsage(ctx.db, ownerId, opts);
  }
  return { personaUsage };
}
