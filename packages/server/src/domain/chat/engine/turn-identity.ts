// domain/chat/engine/turn-identity — the turn-identity triple + the max-pro-sub-by-proxy refusal. Pure: no
// db, no clock, no I/O.
//
// The triple: the CALLER (Principal.userId, membership/CSRF only — never reaches credential resolution);
// `triggeredBy` (the human responsible for spend/abort/attribution — the caller for a direct send, the
// chain-starter for auto-mode); `runAsUserId` (the host whose box funds the turn — the only id that reaches
// credential/routing resolution).
//
// The by-proxy refusal (fail-closed, default OFF): a non-owner-triggered max-pro-sub (hosted creds) turn is
// refused unless explicit owner consent.

import type { ChatSource } from "@orb/contracts/connection";
import type { UserId } from "@orb/kit/ids";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors";

interface TurnIdentity {
  /** The responsible human — budget/abort/attribution (the caller for a send; the chain-starter for auto). */
  readonly triggeredBy: UserId;
  /** The host whose box funds the turn — the only id that reaches credential/routing/settings resolution. */
  readonly runAsUserId: UserId;
}

/** The hosted-credential source the by-proxy belt guards (the owner-only resource class). */
const MAX_PRO_SUB: ChatSource = "max-pro-sub";

/** Resolve the identity triple from the ids the verb holds. Pure. `runAsUserId` is always the host (never
 *  the caller); `triggeredBy` is the caller unless an auto-mode chain-starter is supplied. */
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

/** By-proxy = the host funds the turn but someone else triggered it. A max-pro-sub credential is
 *  unconstructable except for the box's one global owner, so a non-proxy hosted turn is owner-initiated. */
function isByProxy(identity: TurnIdentity): boolean {
  return identity.triggeredBy !== identity.runAsUserId;
}

/** Throws `ChatOperationError('consent_required')` when a hosted-credential (max-pro-sub) turn is triggered
 *  by someone other than the funding host and the owner has not consented. Fail-closed: no consent ⇒ refuse. */
export function assertMaxProSubConsent(params: {
  readonly source: ChatSource;
  readonly identity: TurnIdentity;
  readonly ownerConsent: boolean;
}): void {
  if (params.source === MAX_PRO_SUB && isByProxy(params.identity) && !params.ownerConsent) {
    throw new ChatOperationError(
      CHAT_OP_CODES.consentRequired,
      "a non-owner-triggered max-pro-sub turn requires explicit owner consent",
    );
  }
}

/** Derive the owner-consent value the infra firewall re-verifies at dispatch. Called AFTER
 *  {@link assertMaxProSubConsent}, so a by-proxy non-consented hosted turn has already thrown. */
export function resolveOwnerConsented(params: {
  readonly identity: TurnIdentity;
  readonly ownerConsent: boolean;
}): boolean {
  return !isByProxy(params.identity) || params.ownerConsent;
}
