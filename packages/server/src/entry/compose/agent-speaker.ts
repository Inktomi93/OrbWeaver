// The compose-root AGENT SPEAKER-SOURCE dispatch (D60; agent-principal-design/04 §5). Chat voices a seated
// agent through ONE injected op (`ChatContext.resolveAgentSpeaker`) that takes only the agent's userId — chat
// must stay source-blind (it has never heard of buddy). This module is where the entry root turns that userId
// into a soul: it reads the agent's `sourceKind` + owner via the FK chain and dispatches to the registered,
// source-specific resolver.
//
// The registry itself (`{ buddy: buddyService.resolveSpeakerIdentity }`) is built at `services.ts` where the
// source services live, and is passed in as `sources` — a mapped Record over `AGENT_SOURCE_KINDS`, so the
// exhaustive-dispatch discipline (a new source kind fails tsc until it registers a resolver) stays at the
// call site. Extracted here so the read + dispatch has a tested home (services.ts is un-unit-tested wiring).

import type { AgentCardView, AgentSpeakerIdentity } from "@orb/contracts/chat";
import type { AgentSourceKind } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { agentPrincipals, users } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

/** A source-specific soul resolver — OWNER-keyed (the built `buddy.resolveSpeakerIdentity` takes the owner,
 *  since the `buddies` PK IS the owner userId). null ⇒ nothing to voice for that owner (e.g. unhatched buddy). */
export type AgentSpeakerSourceResolver = (ownerUserId: UserId) => Promise<AgentSpeakerIdentity | null>;

/**
 * Build the source-blind `resolveAgentSpeaker(agentUserId)` op chat injects. The agent's owner-scoping flows
 * through the FK chain (`agent_principals.userId → users.ownerUserId` — walked, never re-stamped; D18/D20):
 * one join resolves `(sourceKind, ownerUserId)`, then the registered resolver produces the soul. Fail-closed —
 * a non-agent / owner-less / unknown id yields null, and chat simply skips voicing that seat.
 */
export function createAgentSpeakerResolver(
  db: Db,
  sources: Record<AgentSourceKind, AgentSpeakerSourceResolver>,
): (agentUserId: UserId) => Promise<AgentSpeakerIdentity | null> {
  return async (agentUserId: UserId): Promise<AgentSpeakerIdentity | null> => {
    const rows = await db
      .select({ sourceKind: agentPrincipals.sourceKind, ownerUserId: users.ownerUserId })
      .from(agentPrincipals)
      .innerJoin(users, eq(users.id, agentPrincipals.userId))
      .where(eq(agentPrincipals.userId, agentUserId))
      .limit(1);
    const row = rows[0];
    return row === undefined || row.ownerUserId === null ? null : sources[row.sourceKind](row.ownerUserId);
  };
}

/**
 * Build the source-blind `resolveAgentCardView(agentUserId)` op chat injects for the D22 "who is this
 * agent?" roster-chip read (D60; agent-principal-design/06 §5). Same FK walk as {@link createAgentSpeakerResolver}
 * ((sourceKind, ownerUserId) via `agent_principals ⋈ users`, owner WALKED not re-stamped) → the soul display
 * name from the SAME speaker-source registry + the owner's public handle. NEVER the soul prompt/avatar (the
 * fixed minimal projection — a low agent visibility by construction). Fail-closed null: a non-agent /
 * unhatched / owner-less / handle-less id yields null, and the verb refuses leak-free.
 */
export function createAgentCardViewResolver(
  db: Db,
  sources: Record<AgentSourceKind, AgentSpeakerSourceResolver>,
): (agentUserId: UserId) => Promise<AgentCardView | null> {
  return async (agentUserId: UserId): Promise<AgentCardView | null> => {
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
    if (identity === null) {
      return null;
    }
    const ownerRows = await db.select({ handle: users.handle }).from(users).where(eq(users.id, row.ownerUserId)).limit(1);
    const ownerHandle = ownerRows[0]?.handle;
    if (ownerHandle === undefined) {
      return null;
    }
    return { displayName: identity.displayName, sourceKind: row.sourceKind, ownerHandle };
  };
}
