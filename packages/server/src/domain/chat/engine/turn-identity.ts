// domain/chat/engine/turn-identity — the turn-identity triple. Pure: no db, no clock, no I/O.
//
// The triple: the CALLER (Principal.userId, membership/CSRF only — never reaches connection resolution);
// `triggeredBy` (the FUNDER — the human whose CONNECTION the turn runs on, and who owns abort/attribution:
// the caller for a direct send, the chain-starter for auto-mode; inference program §8.4-3, D19 amended);
// `runAsUserId` (the room HOST — the ASSEMBLY scope: books, cards, preset, prose, settings, the tool
// execution principal, D152). There is no by-proxy spend any more, so there is no consent belt: a funder
// with no chat connection reads `no-connection` at send, never the host's bill.

import type { UserId } from "@orb/kit/ids";

interface TurnIdentity {
  /** The FUNDER — whose connection the turn runs on; abort/attribution (the caller for a send; the chain-starter for auto). */
  readonly triggeredBy: UserId;
  /** The room host — the ASSEMBLY scope (books/cards/preset/prose/settings), never the connection. */
  readonly runAsUserId: UserId;
}

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
