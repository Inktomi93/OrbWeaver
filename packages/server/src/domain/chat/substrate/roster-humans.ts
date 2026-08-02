// substrate/roster-humans — THE human-seat lens over an already-loaded roster (the `roster-host.ts` twin:
// zero I/O, zero Principal, it only reads rows the caller already has). It answers ONE question — WHOSE
// PERSONAS may this room resolve — and that answer is a law, not a convenience:
//
// THE PERSONA CONSENT SET. A persona is single-owned (`personas.ownerId`, D23), but a room's assembly is a
// room-plane read under the frozen host (D106/D19), so the resolver cannot read personas as any one human.
// Playing a persona in a room — holding it as your `chat_participants.activePersonaId`, or having it
// host-pinned as `chats.anchorPersonaId` — is CONSENT to the room consuming its presentation surface. The
// gate on that consumption is the persona OWNER's PRESENT membership, which is exactly this set.
//
// ONE HOME, because two sites must agree: `setChatAnchorPersona` validates a pin against it (host-only, "the
// target must be owned by a present human"), and the FOREIGN persona read is gated on it
// (`ResolveForeignInputsOp.presentHumanUserIds`). They disagreed before the widening — a host could pin a
// member's persona the resolver then refused to read, so the sanctioned control produced a silently dead pin.

import type { UserId } from "@orb/kit/ids";

/** The two columns the human-seat lens reads — structural, so the raw `chat_participants` row (`loadRoster`)
 *  passes unchanged (the row shape is never re-spelled here). */
interface HumanSeat {
  readonly kind: string;
  readonly userId: UserId | null;
}

/** The room's PERSONA CONSENT SET: every human seat's `userId`, deduped (see the file header).
 *
 *  Pass a PRESENT roster (`loadRoster`'s default, `leftSeq IS NULL`) — presence IS the consent, so a departed
 *  member's persona stops resolving and a stale pin heals downward to the active persona (the HEAL
 *  precedent) instead of being copied or resurrected. Deliberately NOT online-filtered like the turn's
 *  `personaIds`: an OFFLINE member is still a member, and the anchor's owner is routinely offline (presence
 *  gates which persona BOOKS join the world-info pool, never whose identity the room may render). PURE. */
export function presentHumanUserIdsOf(roster: readonly HumanSeat[]): readonly UserId[] {
  return [...new Set(roster.flatMap((seat) => (seat.kind === "human" && seat.userId !== null ? [seat.userId] : [])))];
}
