// substrate/participants-host — THE participants host-LOOKUP (D19 "the host resolves by ROLE"): role → IDENTITY,
// the ONE spelling for the whole class. Zero I/O, zero Principal: it reads an already-loaded seat list (the
// `persistence/participants-read::loadParticipants` rows or a resolved `ParticipantView[]`) and answers WHO the host is.
//
// THE CLASS (the role-authority clause): a host lookup is in NEITHER of the two
// role-comparison classes. It is not ENFORCEMENT (it decides nothing, throws nothing — that is
// `substrate/auth/decide.ts::assertHost`/`permitsHost` over the injected `can()`, spine invariant #6) and it
// is not a DATA PROJECTION of the viewer's own authority (that is `member-visibility.ts::viewerHoldsHost`,
// which answers "does THIS VIEWER hold host?" — a different question with a different input). This one
// answers "which seat in this room is the host?", and its consumers want an OWNER for a downstream read:
// card/preset/connection ownership, the stats delta's owner, the notification recipient. Fourteen call sites
// spelled it inline in two variants before this file existed; the drift that ends here is D19's.
//
// THE userId BELT — one answer for the whole class (it used to be present at 11 sites, absent at 3). It STAYS,
// and the contract is the reason: the shipped answer is a host's USER id, so a seat holding `role="host"` with
// no `userId` cannot satisfy it and must not consume the lookup. Today the belt is behavior-free — no write
// path grants `host` to a userId-less seat (`buildInitialParticipantRows` mints the human founder host;
// `assertForcedCharacterMember` server-forces every character seat to `member`; redeem/accept force `member`;
// the handoff swap moves the role between two human rows) — so collapsing the three beltless sites onto the
// belted spelling is byte-identical. It earns its keep at the SEAT WAVE: the `chat_participants_kind_shape`
// CHECK already carries the dormant `agent` (userId-backed) and `observer` (both-null) arms, and an
// `observer`-shaped host row would otherwise make this lookup answer `null` while a real human host sat one
// row below it. Fail-safe means "skip the seat that cannot own", not "give up at the first host-labelled row".

import type { ParticipantRole } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";

/** The two columns a host lookup reads — structural, so both the raw `chat_participants` row
 *  (`loadParticipants`) and the resolved `ParticipantView` pass unchanged (neither shape is re-spelled here). */
interface HostSeat {
  readonly role: ParticipantRole;
  readonly userId: UserId | null;
}

/** The room's HOST SEAT, or `undefined` for a hostless room (an archived orphan, or a racing delete). Generic
 *  so the caller gets its OWN row type back with every field intact — the invite preview reads the host's
 *  `handle` off it, the handoff reads `userId`. See the file header for the `userId` belt's one answer. */
export function hostSeatOf<T extends HostSeat>(participants: readonly T[]): T | undefined {
  return participants.find((seat) => seat.role === "host" && seat.userId !== null);
}

/** The host's USER id, or `null` for a hostless room. The lookup every ownership read wants (cards/presets/
 *  connections resolve under the host, D18/D19) — a NAMED LENS over {@link hostSeatOf}, not a second
 *  comparison. `null` is the honest hostless answer; each caller decides what that means (a leak-free
 *  NOT_FOUND for a room read, a degrade to the acting caller for a stats delta). */
export function hostUserIdOf(participants: readonly HostSeat[]): UserId | null {
  return hostSeatOf(participants)?.userId ?? null;
}
