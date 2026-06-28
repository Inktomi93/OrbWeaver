// domain/export/contract/params — every verb's *Params, declared ONCE (§7.4 — one type home).
//
// Every verb carries the resolved `principal` (spine §7.1) — ownership is scoped off `principal.userId`,
// the single source of truth for "whose card" (NEVER a `users` read — the `no-direct-users-read` gate).
//
// PD-44 (resolved): the card-emitter input shapes (`ExportCardFields` / `ExportWorldEntry`) now live in the
// shared serde core (`@orb/server/kit/serde/card`) next to `buildCardV3` / `cardFromJson` — one card serde
// home. This file keeps only the verb `*Params`.

import type { Principal } from "@orb/contracts/identity";
import type { CharacterId } from "@orb/kit/ids";

/** Common to every export verb: the acting principal whose `userId` scopes ownership. */
export interface ExportActorParams {
  readonly principal: Principal;
}

export interface ExportCharacterParams extends ExportActorParams {
  /** The owned character to serialize to a V3 card PNG. */
  readonly characterId: CharacterId;
}
