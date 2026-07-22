// The compose-root AGENT-CONNECTION resolver (D60; agent-principal-design/04 §5 + 02 §3). A seated agent
// voices through its OWN brain — `connection.resolveRole('agent')` — resolved under the HOST's real principal
// (the frozen `runAsUserId`), so funding follows the host per D19 (never the caller, never the agent's owner:
// the owner-delegation arm is NOT on this path). The credential firewall is intact — the credential resolves
// inside `connection`/`credentials` against the host principal exactly as every AI turn already does.
//
// Fallback arm (documented ruling — the design set doesn't spec a failure path, so this is the chosen arm):
// a `ConnectionRoutingError` means the host has NO coherent agent-role connection (structurally — e.g. the
// agent-sdk-only role resolved onto a vllm-only host). That is a CONFIGURATION-shape fact, not an
// authorization decision, so the seated agent degrades to the round chat connection (itself host-funded — the
// engine's `?? prep.connection`), preserving the AP3-2 interim posture for such hosts and keeping a
// multi-speaker round alive. Credential / authorization failures (a missing credential, the D17 max-pro-sub
// owner gate) are NOT caught here — they PROPAGATE (the turn refuses), so we never silently re-credential an
// agent turn around an authorization control.

import type { ResolvedConnection } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import { ConnectionRoutingError } from "#domain/connection";
import { getLog } from "#foundation/observability";

/** Build the host-funded agent-connection resolver chat injects (`ChatContext.resolveAgentConnection`).
 *  `resolveAgentRole` is `resolveRole('agent')` pre-picked to the agent role (takes the resolved host
 *  principal → the agent's `{api, model, credential, capability}`; may throw on an incoherent selection /
 *  credential / owner-gate). `resolveHostPrincipal` mints the host's REAL principal (real role). */
export function createAgentConnectionResolver(
  resolveAgentRole: (principal: Principal, agentPrincipalId: UserId) => Promise<ResolvedConnection>,
  resolveHostPrincipal: (userId: UserId) => Promise<Principal>,
): (runAsUserId: UserId, agentUserId: UserId) => Promise<ResolvedConnection | null> {
  return async (runAsUserId: UserId, agentUserId: UserId): Promise<ResolvedConnection | null> => {
    try {
      // The host's REAL principal (real role) — the max-pro-sub owner gate reads the role; a fabricated
      // `role:"user"` would fail-closed-deny an owner's own agent turn (the resolveChat precedent). The
      // SPEAKING agent's id picks its stored per-agent connection over the role default (D67 amendment).
      return await resolveAgentRole(await resolveHostPrincipal(runAsUserId), agentUserId);
    } catch (err) {
      if (err instanceof ConnectionRoutingError) {
        getLog().warn({ runAsUserId, err }, "chat: agent-role connection incoherent; the seated agent falls back to the round connection");
        return null;
      }
      throw err;
    }
  };
}
