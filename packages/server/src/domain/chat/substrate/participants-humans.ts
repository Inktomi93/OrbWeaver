// substrate/participants-humans — THE human-seat lens over an already-loaded seat list (the
// `participants-host.ts` twin:
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
// THE SAME CLASS OF BUG bit the enabled axis (verifier-caught): `verbs/turn.ts` narrowed its OWN
// copy of this set by `resolveUserEnabled` without touching this file, so a host could pin — and an edit
// re-apply could still resolve — a DISABLED member's persona that a live turn had already started refusing.
// {@link presentAndEnabledHumanUserIdsOf} is the fix: the ONE async narrowing every consumer that can reach
// an injected `ctx.resolveUserEnabled` now calls, instead of re-deriving the enabled filter per call site.
// {@link hostConsentOf} is the one answer to whether the room's host is in that set, for every path that spends
// the host's account.

import type { AnchorState } from "@orb/contracts/chat";
import type { ChatId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context.ts";
import type { HumanSeatPersona } from "../contract/foreign.ts";
import { loadPersonaOwnerId } from "../persistence/identity.ts";
import { classifyParticipant, isBackingUserEnabled } from "./participant-actor.ts";
import { hostUserIdOf } from "./participants-host.ts";

/** The columns the human-seat lens reads — {@link classifyParticipant}'s own row shape, so the raw
 *  `chat_participants` row (`loadParticipants`) passes unchanged. */
type HumanSeat = Parameters<typeof classifyParticipant>[0];

/** The room's PERSONA CONSENT SET: every human seat's `userId`, deduped (see the file header). Routes
 *  through {@link classifyParticipant} — the one-home XOR discriminator.
 *
 *  Pass a PRESENT roster (`loadParticipants`'s default, `leftSeq IS NULL`) — presence IS the consent, so a departed
 *  member's persona stops resolving and a stale pin heals downward to the active persona (the HEAL
 *  precedent) instead of being copied or resurrected. Deliberately NOT online-filtered: an OFFLINE member is
 *  still a member, and the anchor's owner is routinely offline. PURE. */
function presentHumanUserIdsOf(participants: readonly HumanSeat[]): readonly UserId[] {
  return [
    ...new Set(
      participants.flatMap((seat) => {
        const actor = classifyParticipant(seat);
        return actor?.kind === "human" ? [actor.userId] : [];
      }),
    ),
  ];
}

/** {@link presentHumanUserIdsOf}, further narrowed by the disabled-account containment gate (owner-ruled):
 *  a disabled human's backing `users.enabled` drops them from the consent set the same way a
 *  departed member's presence already does. THE call every consumer wired to `ctx.resolveUserEnabled` must
 *  route through — `verbs/turn.ts`'s `loadRoom` inlined this once and nowhere else, which is exactly the
 *  silently-dead-pin disagreement this file's header warns about, reintroduced for a second axis. Read fresh
 *  per call (never cached), mirroring `sessions.validate`'s per-request re-check. */
export async function presentAndEnabledHumanUserIdsOf(
  ctx: Pick<ChatContext, "resolveUserEnabled">,
  participants: readonly HumanSeat[],
): Promise<readonly UserId[]> {
  const present = presentHumanUserIdsOf(participants);
  const enabled = await Promise.all(present.map((userId) => ctx.resolveUserEnabled(userId)));
  return present.filter((_userId, i) => isBackingUserEnabled("human", enabled[i] ?? false));
}

/** {@link hostConsentOf}'s answer. `consents` carries the consent set it read, so a caller that also gates personas
 *  reads the room once. */
type HostConsent =
  | { readonly kind: "hostless" }
  | { readonly kind: "withheld" }
  | { readonly kind: "consents"; readonly hostUserId: UserId; readonly consentSet: readonly UserId[] };

/** Does the room's host consent to work run on its account? `hostless` when the present roster seats no host;
 *  `withheld` when the host is outside the consent set, so a disabled host stands exactly as a departed one. Pass
 *  `frozenHostUserId` when a deferred turn already fixed its host: the room must still seat a host, and the frozen
 *  one must consent. Each caller keeps its own refusal for each arm. */
export async function hostConsentOf(
  ctx: Pick<ChatContext, "resolveUserEnabled">,
  participants: readonly (HumanSeat & Parameters<typeof hostUserIdOf>[0][number])[],
  frozenHostUserId?: UserId,
): Promise<HostConsent> {
  const currentHostUserId = hostUserIdOf(participants);
  if (currentHostUserId === null) {
    return { kind: "hostless" };
  }
  const hostUserId = frozenHostUserId ?? currentHostUserId;
  const consentSet = await presentAndEnabledHumanUserIdsOf(ctx, participants);
  return consentSet.includes(hostUserId) ? { kind: "consents", hostUserId, consentSet } : { kind: "withheld" };
}

/** The rows whose `ownerId` is in the consent set of the row's own room: the owner-side gate of the co-participant
 *  art reads. Each row carries the owner's present seat in `chatId`, so the seats grouped per room are that room's
 *  present roster narrowed to the owners in question, and the consent set over them is the room's consent set
 *  narrowed the same way. One {@link presentAndEnabledHumanUserIdsOf} call per room. */
export async function keepConsentingOwners<T extends { readonly chatId: ChatId; readonly ownerId: UserId; readonly ownerSeat: HumanSeat }>(
  ctx: Pick<ChatContext, "resolveUserEnabled">,
  rows: readonly T[],
): Promise<T[]> {
  const consentOf = async (roomRows: readonly T[]): Promise<ReadonlySet<UserId>> =>
    new Set(
      await presentAndEnabledHumanUserIdsOf(
        ctx,
        roomRows.map((row) => row.ownerSeat),
      ),
    );
  const rooms = [...Map.groupBy(rows, (row) => row.chatId)];
  const consentByRoom = new Map(await Promise.all(rooms.map(async ([chatId, roomRows]) => [chatId, await consentOf(roomRows)] as const)));
  return rows.filter((row) => consentByRoom.get(row.chatId)?.has(row.ownerId) === true);
}

/** Is `personaId` owned by a present, enabled human in this room? The gate `setChatAnchorPersona` permits a
 *  pin on, and the line between a `live` and a `held` pin. */
export async function ownedByConsentingHuman(
  ctx: Pick<ChatContext, "resolveUserEnabled" | "verifyPersonaOwned">,
  participants: readonly HumanSeat[],
  personaId: PersonaId,
): Promise<boolean> {
  const consentSet = await presentAndEnabledHumanUserIdsOf(ctx, participants);
  const owned = await Promise.all(consentSet.map((ownerId) => ctx.verifyPersonaOwned({ ownerId, personaId })));
  return owned.some(Boolean);
}

/** How the room's pin stands for `ChatDetailData.anchorState`. A pin nobody present and enabled owns is `held`:
 *  the card still means that persona. */
async function resolveAnchorState(
  ctx: Pick<ChatContext, "resolveUserEnabled" | "verifyPersonaOwned">,
  participants: readonly HumanSeat[],
  anchorPersonaId: PersonaId | null,
): Promise<AnchorState> {
  if (anchorPersonaId === null) {
    return "none";
  }
  return (await ownedByConsentingHuman(ctx, participants, anchorPersonaId)) ? "live" : "held";
}

/** The room's pin as `ChatDetailData` carries it: how it stands, and for a `held` pin the handle of the player
 *  whose persona it is. A live pin's player is on the roster already, so only a held one is looked up. */
export interface ResolvedAnchor {
  readonly state: AnchorState;
  readonly ownerHandle: Handle | null;
}

export async function resolveAnchor(
  ctx: Pick<ChatContext, "db" | "resolveUserEnabled" | "verifyPersonaOwned" | "resolveUserPublics">,
  participants: readonly HumanSeat[],
  anchorPersonaId: PersonaId | null,
): Promise<ResolvedAnchor> {
  const state = await resolveAnchorState(ctx, participants, anchorPersonaId);
  if (state !== "held" || anchorPersonaId === null) {
    return { state, ownerHandle: null };
  }
  const ownerId = await loadPersonaOwnerId(ctx.db, anchorPersonaId);
  const publics = ownerId === null ? null : await ctx.resolveUserPublics(ownerId, anchorPersonaId);
  return { state, ownerHandle: publics?.handle ?? null };
}

/** Does the room seat more than one present human? The multi-human names rule (`assembly/names`) reads this,
 *  so the turn and every preview must answer it from the same consent set. PURE. */
export function seatsMultipleHumans(presentHumanUserIds: readonly UserId[]): boolean {
  return presentHumanUserIds.length > 1;
}

/** The seat fields the ACTIVE-PERSONA lens needs on top of {@link HumanSeat} — again structural, so a raw
 *  `chat_participants` row passes unchanged. */
interface PersonaSeat extends HumanSeat {
  readonly activePersonaId: PersonaId | null;
}

/** Each consented human seat and the persona it holds — the FOREIGN resolver picks the anchor human's seat
 *  persona from it (`ResolveForeignInputsOp.humanSeats`). Pass the same consent set the persona read is gated
 *  on, so a seat the room may not resolve never reaches the resolver. PURE. */
export function humanSeatPersonasOf(participants: readonly PersonaSeat[], consentSet: readonly UserId[]): readonly HumanSeatPersona[] {
  const consented = new Set(consentSet);
  return participants.flatMap((seat) => {
    const actor = classifyParticipant(seat);
    return actor?.kind === "human" && consented.has(actor.userId) ? [{ userId: actor.userId, personaId: seat.activePersonaId }] : [];
  });
}

/** The personas whose books join a round's world-info pool: each consented seat's persona, in seat order, then
 *  the room's pin. The seats are the present membership the people block renders (pass
 *  {@link humanSeatPersonasOf}'s output), never the online set, so a reconnect cannot rewrite the lore in the
 *  static half. The pin joins past the consent set because it holds when its owner leaves or is disabled (D315).
 *  Order is precedence: the pool renders a shared entry against the first persona here, so the pin stays last.
 *  Pass `chats.anchorPersonaId`, never a caller-supplied id. The turn and every preview must derive it here, or a
 *  preview reports lore the next turn would not send. PURE. */
export function lorePersonaIdsOf(humanSeats: readonly HumanSeatPersona[], anchorPersonaId: PersonaId | null): readonly PersonaId[] {
  return [...humanSeats.map((seat) => seat.personaId), anchorPersonaId].flatMap((id) => (id === null ? [] : [id]));
}
