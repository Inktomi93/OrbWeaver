// domain/sessions — verb input shapes (the contract is the one home for the domain's types, §7.4).
// `provisionIdentity` takes the cross-boundary `ResolvedIdentity` directly (its `{ externalId, handle,
// groups }` shape IS the SSO upsert input — re-spelling it as a separate `ProvisionInput` would double a
// type that already has a canonical home in `@orb/contracts/identity`, violating one-home/no-doubling).
// `ensureUser`/`revoke`/`list` take bare branded ids/strings — no wrapper needed.

import type { AgentSourceKind } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";

/** `create` input: the resolved owner of the new session + the UA captured at mint (null when absent). */
export interface CreateSessionParams {
  userId: UserId;
  userAgent?: string | null;
}

/** `provisionAgentPrincipal` input (D60; agent-principal-design/01 §4): the responsible HUMAN owner + the
 *  agent source flavor. The mint gates the owner (`kind='human'`, enabled) and derives the deterministic
 *  `__agent__${sourceKind}__${ownerUserId}` handle — the idempotency key AND the race arbiter. */
export interface ProvisionAgentParams {
  ownerUserId: UserId;
  sourceKind: AgentSourceKind;
}
