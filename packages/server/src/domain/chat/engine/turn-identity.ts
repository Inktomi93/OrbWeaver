// domain/chat/engine/turn-identity — the D19/§5 turn-identity TRIPLE + the §5/inv-3 max-pro-sub-by-proxy
// refusal. PURE: no db, no clock, no I/O — it resolves identities from ids the verb already holds + asserts
// the consent belt. (The verb calls `resolveTurnIdentity` to build the `TurnPrep` triple; the engine calls
// `assertMaxProSubConsent` IN-LOCK once the connection source is known.)
//
// THE TRIPLE (D19 — there is NO `callerUserId` term, the `no-caller-user-id` gate):
//   • the CALLER         = `Principal.userId` (membership/CSRF; a human post's `authorUserId`). Passed here
//                          as `principalUserId` — it NEVER reaches credential/settings resolution.
//   • `triggeredBy`      = the human RESPONSIBLE for the turn (spend budget + abort-rights + attribution) =
//                          the caller for a direct send; the chain-starter for an auto-mode turn (the
//                          `triggeredBy` arg — the auto-mode chunk supplies it; defaults to the caller here).
//   • `runAsUserId`      = the HOST whose box funds the turn (read from the loaded roster — `role='host'`).
//                          Carries the credential/routing id, the role the gate reads, and the model
//                          effort/intent is gated against — all rebind to the host together.
//
// THE BY-PROXY REFUSAL (fail-closed, default OFF): a NON-owner-triggered
// `max-pro-sub` (hosted creds) turn is refused unless EXPLICIT owner consent. `triggeredBy ≠ runAsUserId`
// (the host funds it but someone else triggered it) forces the consent check; absent consent → refuse.

import type { ChatSource } from "@orb/contracts/connection";
import type { UserId } from "@orb/kit/ids";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors";

/** The resolved turn-identity triple's spend/funding axis (the caller stays `Principal.userId`, off this).
 *  File-local (the `types-in-contract` gate) — callers read the inferred return / pass a literal. */
interface TurnIdentity {
  /** The responsible human — budget/abort/attribution (the caller for a send; the chain-starter for auto). */
  readonly triggeredBy: UserId;
  /** The host whose box funds the turn — the ONLY id that reaches credential/routing/settings resolution. */
  readonly runAsUserId: UserId;
}

/** The hosted-credential source the by-proxy belt guards (the owner-only resource class — D17). */
const MAX_PRO_SUB: ChatSource = "max-pro-sub";

/**
 * Resolve the D19 triple from the ids the verb holds. PURE. `runAsUserId` is ALWAYS the host (never the
 * caller — D19); `triggeredBy` is the caller unless an auto-mode chain-starter is supplied. The caller's
 * `principalUserId` is consumed ONLY to default `triggeredBy` — it is never returned as a routing id.
 */
export function resolveTurnIdentity(params: {
  readonly principalUserId: UserId;
  readonly hostUserId: UserId;
  readonly triggeredBy?: UserId | undefined;
}): TurnIdentity {
  return {
    triggeredBy: params.triggeredBy ?? params.principalUserId,
    runAsUserId: params.hostUserId,
  };
}

/**
 * The max-pro-sub by-proxy refusal. Throws `ChatOperationError('consent_required')`
 * when a hosted-credential (`max-pro-sub`) turn is triggered by someone OTHER than the funding host and the
 * owner has not consented (default OFF). Local compute (vllm / local-light) + openrouter (the triggerer's
 * own key path) are not gated here — only the owner-only hosted class. Fail-closed: no consent ⇒ refuse.
 */
export function assertMaxProSubConsent(params: {
  readonly source: ChatSource;
  readonly identity: TurnIdentity;
  readonly ownerConsent: boolean;
}): void {
  const byProxy = params.identity.triggeredBy !== params.identity.runAsUserId;
  if (params.source === MAX_PRO_SUB && byProxy && !params.ownerConsent) {
    throw new ChatOperationError(
      CHAT_OP_CODES.consentRequired,
      "a non-owner-triggered max-pro-sub turn requires explicit owner consent",
    );
  }
}
