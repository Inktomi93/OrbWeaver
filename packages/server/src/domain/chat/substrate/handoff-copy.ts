// domain/chat/substrate/handoff-copy — the ACCEPTED-OFFER copy plan for `acceptHostHandoff`.
// SUBSTRATE, not a verb: it takes no principal and gates nothing — `acceptHostHandoff`
// has already proven the caller IS the nominee. It exists apart from `roster.ts` because it carries its own
// crash contract: roster.ts owns the atomic room swap, this owns the LIBRARY half that must land before it.
//
// WHAT THE ARM IS FOR. Under the built code a handoff transfers the room + history but DROPS the outgoing
// host's character seats (D64) — cards are single-owned, so a seat whose card the new host cannot read would
// collapse to a blank name. That is correct and stays the default. The owner's ruling added the missing
// OPTION: at nominate the departing host may offer point-in-time COPIES of the characters and worldbooks they
// brought, and if the nominee accepts, this module mints them and the swap re-points the room onto them. From
// that moment the room references only the new host's property, so the old host editing or deleting their
// originals cannot reach it.
//
// NOTHING HERE IS A LICENSE. Every read carries an owner in its WHERE: the candidate seats are the ones whose
// card resolves under the DEPARTING host (theirs to give) and NOT under the nominee (already theirs — a gift
// of what you own is a duplicate, not a transfer). The roster's `characterId` grants no read.
//
// The mints go through INJECTED ops, never a table: `characters` is the character domain's, the books are
// world-info's, the room's regex scripts are the regex domain's. Chat composes the plan and owns only the
// room-side statements.

import type { HandoffOffer } from "@orb/contracts/chat";
import type { chatParticipants } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { ChatContext, HandoffCopyPlan, OfferedSeat } from "../contract/context.ts";
import { classifyParticipant } from "../persistence/participant.ts";

/** The present character seats the DEPARTING host owns — the copy candidates for an accepted offer.
 *
 *  Two ownership axes, both load-bearing (the injected-op caller gate): a seat is a candidate only when its
 *  card resolves under the OLD HOST (it is theirs to give) and does NOT resolve under the NOMINEE (a card the
 *  nominee already owns is a live seat, not a gift — copying it would mint a pointless second library row and
 *  orphan the original's history). A seat that satisfies neither is left to `resolveDroppedCharacterSeatIds`.
 *  Nothing here reads a card the old host does not own: the roster's `characterId` is not a license. */
async function resolveOfferedSeats(
  ctx: ChatContext,
  oldHostUserId: UserId,
  newOwnerUserId: UserId,
  roster: readonly (typeof chatParticipants.$inferSelect)[],
): Promise<OfferedSeat[]> {
  const seats = roster.flatMap((p) => {
    const actor = classifyParticipant(p);
    return actor?.kind === "character" && p.leftSeq === null ? [{ participantId: p.id, characterId: actor.characterId }] : [];
  });
  const verdicts = await Promise.all(
    seats.map(async (seat) => {
      const [fromOld, fromNew] = await Promise.all([
        ctx.getCard({ ownerId: oldHostUserId, characterId: seat.characterId }),
        ctx.getCard({ ownerId: newOwnerUserId, characterId: seat.characterId }),
      ]);
      return fromOld !== null && fromNew === null;
    }),
  );
  return seats.filter((_, i) => verdicts[i] === true);
}

/** The no-copy plan — what every offer-less accept resolves to, spelled once so no arm can drift. */
const EMPTY_COPY_PLAN: HandoffCopyPlan = { seats: [], cardCopies: [], bookRepoint: [], regexRepoint: [] };

/** EXECUTE the accepted offer's LIBRARY half — everything that can land BEFORE the room changes hands.
 *
 *  THE ORDERING IS THE CRASH CONTRACT (§5, "copy-fully-lands then swap"). True cross-domain atomicity is not
 *  available: the cards, books and preset are separate front-door writes into the nominee's own library, and
 *  no batch spans them. So they land FIRST and the room moves in ONE atomic batch afterwards. A crash in
 *  between leaves the nominee holding ORDINARY LIBRARY ROWS — their own cards and books, editable and
 *  deletable, not corruption and not anyone's ghost — plus a nomination that is still intact, so the accept
 *  can simply be re-tried. The retry converges on the SAME copies rather than minting a second set (cards by
 *  their `handoff:<chatId>:<sourceId>` provenance, books by the copy card already carrying junctions / the
 *  recipient already owning that book name on this chat, the preset by its `forkedFrom` lineage).
 *
 *  Minting AFTER the swap was never an option: a crash there would leave a promoted host holding a room whose
 *  seated characters had just been dropped, with nothing to show for the offer they accepted. */
async function executeHandoffCopy(
  ctx: ChatContext,
  params: { readonly chatId: ChatId; readonly oldHostUserId: UserId; readonly nomineeUserId: UserId },
  seats: readonly OfferedSeat[],
): Promise<HandoffCopyPlan> {
  const { chatId, oldHostUserId, nomineeUserId } = params;
  // THE REGEX ARM RUNS BEFORE (AND INDEPENDENTLY OF) THE SEAT CHECK — #1739. A room's chat-tier scripts are
  // room state: they are attached to the ROOM, not carried by a card, so a room with no giftable seat can
  // still be running the departing host's find/replace. Gating them on `seats.length` would leave exactly the
  // hole this arm exists to close. Same shape as the books' room half otherwise: mints land now, the
  // `chat_regex_scripts` move comes back UNEXECUTED for the swap batch.
  const regexRepoint = await ctx.copyHandoffRegexScripts({ fromOwnerId: oldHostUserId, toOwnerId: nomineeUserId, chatId });
  // THE SEAT GATE IS THE CARD MINT'S, NOT THE WHOLE COPY'S — #1763. `copyHandoffBooks` does two halves: the
  // seated cards' lore (derived from `cardCopies`) and the ROOM's own `chat_books`, which hangs off the room
  // and owes the seats nothing. Returning early on `seats.length === 0` took the room half down with the card
  // half, so an offer accepted in a seat-less room left the departed host's book firing into a room they had
  // left — the #1739 hole, one table over. An empty `cardCopies` is already the op's own "room half only"
  // input (`pendingCardCopies([])` ⇒ the card loop never runs), so the fix is to stop skipping the CALL.
  //
  // The two halves stay in ONE op deliberately: they share the call-local source→copy map, so a book attached
  // to BOTH a seated card and the room is copied ONCE and shared exactly as the originals shared it. Splitting
  // them into two injected ops would give each its own map and fork the room's lore into divergent duplicates
  // — the failure `world-info/persistence/handoff-copy-write` names in its own header. Both pinned.
  const cardCopies =
    seats.length === 0
      ? []
      : await ctx.copyHandoffCards({
          fromOwnerId: oldHostUserId,
          toOwnerId: nomineeUserId,
          chatId,
          characterIds: seats.map((s) => s.characterId),
        });
  const copyOf = new Map(cardCopies.map((c) => [c.sourceCharacterId, c]));
  const bookRepoint = await ctx.copyHandoffBooks({ fromOwnerId: oldHostUserId, toOwnerId: nomineeUserId, chatId, cardCopies });
  return {
    // A seat whose card did not copy (deleted between nominate and accept) is absent here and falls through
    // to the D64 drop — the honest degrade, never a blank-name seat.
    seats: seats.flatMap((seat) => {
      const copy = copyOf.get(seat.characterId);
      return copy === undefined ? [] : [{ participantId: seat.participantId, copy }];
    }),
    cardCopies,
    bookRepoint,
    regexRepoint,
  };
}

/** The ONE door the accept calls: decide whether the offer applies at all, resolve the candidate seats, and
 *  execute the library half. Returns {@link EMPTY_COPY_PLAN} for every accept that copies nothing.
 *
 *  The copy needs a DEPARTING HOST to derive ownership from. If they already left the room (a host who
 *  nominated and then walked), there is nobody whose property this is — the offer degrades to the built D64
 *  drop rather than reading cards under a guess. A nominee accepting their OWN nomination as sitting host
 *  (the hostless-room heal) likewise copies nothing: there is no transfer of property to make. */
export async function resolveHandoffCopyPlan(
  ctx: ChatContext,
  params: {
    readonly chatId: ChatId;
    readonly oldHostUserId: UserId | null;
    readonly nomineeUserId: UserId;
    readonly offer: HandoffOffer;
    readonly roster: readonly (typeof chatParticipants.$inferSelect)[];
  },
): Promise<HandoffCopyPlan> {
  const { chatId, oldHostUserId, nomineeUserId, offer, roster } = params;
  if (!offer.copyCharacters || oldHostUserId === null || oldHostUserId === nomineeUserId) {
    return EMPTY_COPY_PLAN;
  }
  const seats = await resolveOfferedSeats(ctx, oldHostUserId, nomineeUserId, roster);
  return executeHandoffCopy(ctx, { chatId, oldHostUserId, nomineeUserId }, seats);
}
