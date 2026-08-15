// substrate/roster-humans — THE human-seat lens over an already-loaded roster (the `roster-host.ts` twin:
// zero I/O, zero Principal, it only reads rows the caller already has). It answers ONE question — WHOSE
// PERSONAS may this room resolve — and that answer is a law, not a convenience:
//
// THE PERSONA CONSENT SET. A persona is single-owned (`personas.ownerId`, D23), but a room's assembly is a
// room-plane read under the frozen host (D106/D19), so the resolver cannot read personas as any one human.
// Playing a persona in a room — holding it as your `chat_participants.activePersonaId`, or having it
// host-pinned as `chats.anchorPersonaId` — is CONSENT to the room consuming its presentation surface. The
// gate on that consumption is the persona OWNER's PRESENT membership AND enabled account (below), which is
// exactly this set.
//
// ONE HOME, because two sites must agree: `setChatAnchorPersona` validates a pin against it (host-only, "the
// target must be owned by a present human"), and the FOREIGN persona read is gated on it
// (`ResolveForeignInputsOp.presentHumanUserIds`). They disagreed before the widening — a host could pin a
// member's persona the resolver then refused to read, so the sanctioned control produced a silently dead pin.
// THE SAME CLASS OF BUG bit the enabled axis (2026-08-15, verifier-caught): `verbs/turn.ts` narrowed its OWN
// copy of this set by `resolveUserEnabled` without touching this file, so a host could pin — and an edit
// re-apply could still resolve — a DISABLED member's persona that a live turn had already started refusing.
// {@link presentAndEnabledHumanUserIdsOf} is the fix: the ONE async narrowing every consumer that can reach
// an injected `ctx.resolveUserEnabled` now calls, instead of re-deriving the enabled filter per call site.

import type { ParticipantKind } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context.ts";
import { classifyParticipant, isBackingUserEnabled } from "../persistence/participant.ts";

/** The columns the human-seat lens reads — structural, so the raw `chat_participants` row (`loadRoster`)
 *  passes unchanged (the row shape is never re-spelled here). */
interface HumanSeat {
  readonly kind: ParticipantKind;
  readonly userId: UserId | null;
  readonly characterId: CharacterId | null;
}

/** The room's PERSONA CONSENT SET: every human seat's `userId`, deduped (see the file header). Routes
 *  through {@link classifyParticipant} — the one-home XOR discriminator (2026-08-15 consolidation).
 *
 *  Pass a PRESENT roster (`loadRoster`'s default, `leftSeq IS NULL`) — presence IS the consent, so a departed
 *  member's persona stops resolving and a stale pin heals downward to the active persona (the HEAL
 *  precedent) instead of being copied or resurrected. Deliberately NOT online-filtered like the turn's
 *  `personaIds`: an OFFLINE member is still a member, and the anchor's owner is routinely offline (presence
 *  gates which persona BOOKS join the world-info pool, never whose identity the room may render). PURE. */
function presentHumanUserIdsOf(roster: readonly HumanSeat[]): readonly UserId[] {
  return [
    ...new Set(
      roster.flatMap((seat) => {
        const actor = classifyParticipant(seat);
        return actor?.kind === "human" ? [actor.userId] : [];
      }),
    ),
  ];
}

/** {@link presentHumanUserIdsOf}, further narrowed by the disabled-account containment gate (owner-ruled
 *  2026-08-15): a disabled human's backing `users.enabled` drops them from the consent set the same way a
 *  departed member's presence already does. THE call every consumer wired to `ctx.resolveUserEnabled` must
 *  route through — `verbs/turn.ts`'s `loadRoom` inlined this once and nowhere else, which is exactly the
 *  silently-dead-pin disagreement this file's header warns about, reintroduced for a second axis. Read fresh
 *  per call (never cached), mirroring `sessions.validate`'s per-request re-check. */
export async function presentAndEnabledHumanUserIdsOf(ctx: ChatContext, roster: readonly HumanSeat[]): Promise<readonly UserId[]> {
  const present = presentHumanUserIdsOf(roster);
  const enabled = await Promise.all(present.map((userId) => ctx.resolveUserEnabled(userId)));
  return present.filter((_userId, i) => isBackingUserEnabled("human", enabled[i] ?? false));
}
