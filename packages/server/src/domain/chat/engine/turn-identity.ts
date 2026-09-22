// domain/chat/engine/turn-identity — the turn-identity triple. Pure: no db, no clock, no I/O.
//
// The triple: `triggeredBy` is the initiator who owns attribution/abort (the caller for a direct send, the
// chain-starter for auto-mode); `funderUserId` is the frozen room host whose connection pays; and
// `runAsUserId` is that same frozen host as the assembly/tool principal (books, cards, preset, prose,
// settings, D18/D19/D152). The caller (`Principal.userId`) is only the request principal.

import type { UserId } from "@orb/kit/ids";

interface TurnIdentity {
  /** The initiator — owns abort/attribution (the caller for a send; the chain-starter for auto). */
  readonly triggeredBy: UserId;
  /** The room host whose connection funds the turn. */
  readonly funderUserId: UserId;
  /** The frozen room host — the ASSEMBLY/tool principal. */
  readonly runAsUserId: UserId;
}

/** Resolve the identity triple from the ids the verb holds. Pure. Funding and assembly freeze the same host;
 *  `triggeredBy` is the caller unless an auto-mode chain-starter is supplied. */
export function resolveTurnIdentity(params: {
  readonly principalUserId: UserId;
  readonly hostUserId: UserId;
  readonly triggeredBy?: UserId | undefined;
}): TurnIdentity {
  return {
    triggeredBy: params.triggeredBy ?? params.principalUserId,
    funderUserId: params.hostUserId,
    runAsUserId: params.hostUserId,
  };
}
