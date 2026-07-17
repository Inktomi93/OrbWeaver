// The compose-root AGENT-AUTHOR provenance resolver (D60; PD-17). Export voices an agent-authored assistant
// row (AP2 self-attribution) through ONE injected op (`ExportContext.resolveAgentAuthor`) that takes only the
// agent's userId — export must stay source-blind AND may not read `users`/`agent_principals` directly (the
// no-direct-users-read gate) nor consume chat's `resolveAgentSpeaker`. This walks the FK chain
// (`agent_principals.userId → users.ownerUserId`; D18/D20 — owner derived, never re-stamped) to
// `(sourceKind, ownerUserId)`, dispatches to the SAME registered source resolver chat uses for the display
// name, and pairs it with `sourceKind` as the leak-safe provenance the serde emits.
//
// LEAK BOUNDARY (security-load-bearing): the source resolver returns the full `AgentSpeakerIdentity` — display
// name + SOUL system-prompt + avatar — but only `displayName` crosses into the provenance. The soul prompt is
// DROPPED here and never reaches the serde; the agent `handle` (which embeds `ownerUserId`,
// `__agent__${sourceKind}__${ownerUserId}`) is never read. So a shared export reveals the agent's display name
// and its source-kind label ONLY — nothing that identifies the owner or reconstructs the agent's soul.
//
// Fail-closed: a non-agent / owner-less / unknown id, or an owner with nothing to voice (e.g. an unhatched
// buddy), yields null — export then degrades that row to the header character-name fallback (pre-PD-17).

import type { AgentSourceKind } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { agentPrincipals, users } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { ParsedAgentAuthor } from "#kit/serde/chat";
import type { AgentSpeakerSourceResolver } from "./agent-speaker";

/**
 * Build the source-blind `resolveAgentAuthor(agentUserId)` op export injects. Reuses the exact
 * `AGENT_SPEAKER_SOURCES` registry (a mapped Record over `AGENT_SOURCE_KINDS`) so the exhaustive-dispatch
 * discipline holds — a new source kind fails tsc until it registers a resolver — and there is ONE owner-walk
 * shape shared with the speaker dispatch.
 */
export function createAgentAuthorResolver(
  db: Db,
  sources: Record<AgentSourceKind, AgentSpeakerSourceResolver>,
): (agentUserId: UserId) => Promise<ParsedAgentAuthor | null> {
  return async (agentUserId: UserId): Promise<ParsedAgentAuthor | null> => {
    const rows = await db
      .select({ sourceKind: agentPrincipals.sourceKind, ownerUserId: users.ownerUserId })
      .from(agentPrincipals)
      .innerJoin(users, eq(users.id, agentPrincipals.userId))
      .where(eq(agentPrincipals.userId, agentUserId))
      .limit(1);
    const row = rows[0];
    if (row === undefined || row.ownerUserId === null) {
      return null;
    }
    const identity = await sources[row.sourceKind](row.ownerUserId);
    // Only the display name crosses the boundary — the soul systemPrompt + avatar are dropped here.
    return identity === null ? null : { name: identity.displayName, sourceKind: row.sourceKind };
  };
}
