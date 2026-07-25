// domain/chat/substrate/auth/clamp — THE per-member VISIBILITY clamps. Pure projections (zero I/O) over an
// already-loaded membership; the I/O enforcer that feeds them is the feature-root `guard.ts`.
//
// TWO clamps live here, because both answer the same question ("what may THIS member see, given their own
// participant row") and one home stops a second, drifting authority model from appearing:
//
//  1. D22 member-card visibility — a present human member may READ a roster character's card, but only the
//     fields at or below the room's `chatMetadata.group.memberCardVisibility` level (`name-avatar | sheet |
//     sheet+lore | full`, host-set, default `sheet`). The owner/host always sees `full`. Read-only +
//     while-present; viewing ≠ owning (edit/clone/export stay owner-only — NOT this projection's concern).
//     Levels widen left→right; the ordering is DERIVED from the canonical `MEMBER_CARD_VISIBILITY_LEVELS`
//     tuple (one home, no re-spell). Fields above the effective level are nulled. `tags`/`lore` are NOT on
//     the flat `CharacterCard` (tags = the `character_tags` junction; lore = the character's rendered
//     world-info), so the caller resolves + passes them — the clamp never fabricates them, it only gates what
//     it is given.
//
//  2. `chat_participants.joinHistoryVisibility` — the JOIN-HISTORY floor (`from-join` = the DB default, so
//     this is the COMMON case; `full` = unclamped). `from-join` means the member reads canon only from their
//     own `joinSeq`; nothing below it may be returned on ANY read path. `resolveHistoryFloorSeq` is the ONE
//     place that policy becomes a number and `isBelowHistoryFloor` the ONE per-bus-event verdict. Both are
//     per-CALLER (the floor comes from the caller's own row), so a host is never clamped by a member's floor.

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent, JoinHistoryVisibility, MemberCardView, MemberCardVisibility } from "@orb/contracts/chat";
import { MEMBER_CARD_VISIBILITY_LEVELS } from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { CharacterId } from "@orb/kit/ids";

/** The floor for an unclamped reader (`full`, and every born-here host/character seat) — `messages.seq` is
 *  1-based, so 0 admits the whole canon. Also the "no clamp in force" sentinel consumers test against. */
export const NO_HISTORY_FLOOR = 0;

/**
 * Resolve a member's canon read FLOOR in `messages.seq` space from their OWN participant row (D16's
 * `joinHistoryVisibility` + `joinSeq`) — the ONE place the persisted policy becomes a number.
 *
 * `full` ⇒ {@link NO_HISTORY_FLOOR} (unchanged — sees everything). `from-join` ⇒ the member's `joinSeq`: a
 * row with `seq < joinSeq` is pre-join and must not be returned. RE-JOIN semantics ride the storage shape: a
 * human's membership is ONE upserted row whose `joinSeq` is re-stamped to the canon head on every re-join
 * (`persistence/participant.ts::upsertMemberOnJoin`), so a re-joined member's floor is their LATEST join —
 * the conservative reading, and the only one the row can support (prior eras are not retained).
 */
export function resolveHistoryFloorSeq(membership: { readonly joinSeq: number; readonly joinHistoryVisibility: JoinHistoryVisibility }): number {
  return membership.joinHistoryVisibility === "full" ? NO_HISTORY_FLOOR : Math.max(membership.joinSeq, NO_HISTORY_FLOOR);
}

/**
 * The per-event verdict for the DURABLE chat-bus replay: does this room-public event carry canon content the
 * caller's history floor withholds? STRUCTURAL, not a per-type dispatch, so a NEW `ChatBusEvent` member that
 * carries a `view` inherits the clamp instead of silently bypassing it:
 *
 *  • floor `0` (`full` / a born-here seat) ⇒ nothing is withheld.
 *  • `delta` carries RAW streamed transcript text and NO `messages.seq` to classify it against, so a clamped
 *    caller is denied REPLAYED deltas outright. The cost is bounded and one-directional: a clamped member
 *    reconnecting mid-turn loses that turn's partial token stream and then gets the row on `messageCommitted`.
 *    Widening this (replaying unclassifiable content) hands back the whole pre-join transcript — the exact bug.
 *  • any member carrying a `MessageView` is decided on that view's own `seq`.
 *  • an id-only payload (`messagesDeleted`, a `view`-less commit whose row raced a delete, the turn/WI/room
 *    lifecycle members) carries no canon content — and the ids it names resolve only through the equally
 *    clamped `listMessages` — so it rides through rather than blinding a member to their OWN post-join events.
 */
export function isBelowHistoryFloor(event: ChatBusEvent, floorSeq: number): boolean {
  if (floorSeq <= NO_HISTORY_FLOOR) {
    return false;
  }
  if (event.type === "delta") {
    return true;
  }
  const view = "view" in event ? event.view : undefined;
  return view !== undefined && view.seq < floorSeq;
}

/** The visibility rank (index in the canonical tuple) — derive-don't-respell the ordering. */
function rank(level: MemberCardVisibility): number {
  return MEMBER_CARD_VISIBILITY_LEVELS.indexOf(level);
}

/**
 * The EFFECTIVE visibility for a viewer: the room host always sees `full`; every other present member sees
 * the host-configured level. (The GLOBAL owner/admin
 * override is the caller's concern — it passes `full` directly; this resolves the per-chat resource role.)
 */
export function resolveCardVisibility(viewerRole: ParticipantRole, configured: MemberCardVisibility): MemberCardVisibility {
  return viewerRole === "host" ? "full" : configured;
}

/**
 * Clamp a roster character's card to the {@link MemberCardView} the member may read at `visibility`
 * (D22). `name`/`avatarAssetId` are the always-present floor; `sheet`+ reveals the presentable identity;
 * `sheet+lore`+ adds the rendered world-info; `full` adds the prompt-steering internals. Pure — no I/O.
 */
export function clampMemberCard(input: {
  readonly characterId: CharacterId;
  readonly card: CharacterCard;
  /** Resolved `character_tags` (caller-supplied; clamped at `sheet`). */
  readonly tags: string[] | null;
  /** Resolved world-info entry contents (caller-supplied; clamped at `sheet+lore`). */
  readonly lore: string[] | null;
  /** The CAS hash of `card.avatarAssetId` (caller-resolved — this function is pure, no I/O; mirrors
   *  `tags`/`lore`). Same always-present floor as `avatarAssetId` (never clamped by `visibility`). */
  readonly avatarHash: string | null;
  readonly visibility: MemberCardVisibility;
}): MemberCardView {
  const { characterId, card, tags, lore, avatarHash, visibility } = input;
  const r = rank(visibility);
  const atSheet = r >= rank("sheet");
  const atLore = r >= rank("sheet+lore");
  const atFull = r >= rank("full");
  return {
    characterId,
    visibility,
    name: card.name,
    avatarAssetId: card.avatarAssetId,
    avatarHash,
    description: atSheet ? card.description : null,
    personality: atSheet ? card.personality : null,
    scenario: atSheet ? card.scenario : null,
    // MemberCardView.greetings is a clamped DISPLAY projection (string[]) — group-only isn't meaningful to a
    // room member, so the object shape does NOT propagate here; project each greeting to its text.
    greetings: atSheet ? card.greetings.map((g) => g.text) : null,
    exampleMessages: atSheet ? card.exampleMessages : null,
    tags: atSheet ? tags : null,
    creatorNotes: atSheet ? card.creatorNotes : null,
    lore: atLore ? lore : null,
    systemPrompt: atFull ? card.systemPrompt : null,
    postHistoryInstructions: atFull ? card.postHistoryInstructions : null,
    authorsNoteDepth: atFull ? (card.depthPrompt?.depth ?? null) : null,
  };
}
