// domain/regex/contract/handoff-copy — the `RegexHandoffCopyContext` DI bundle + op type for the regex-owned
// script copy the host-handoff property offer executes. The `world-info/contract/handoff-copy` twin, and it
// exists for the same reason, one degree worse.
//
// WHY THE ROOM'S SCRIPTS MUST MOVE. A chat-tier attachment is resolved UNSCOPED (`persistence/queries.ts`
// `listChatScripts` — "a room's attached scripts are room-public prompt content"), so after a handoff the
// DEPARTED host's scripts keep running on the NEW host's turns while only the departed host can edit
// `behavior` or flip `enabled`, and their DELETE cascades the junction out from under the room. That is the
// property asymmetry `world-info/contract/handoff-copy` already names for chat-attached books — but a regex
// is EXECUTABLE (a find/replace over prompt slots, persisted canon and rendered output), so an ex-member
// keeping an editable one pointed at someone else's room is a live injection surface, not just stale lore.
//
// WHY A COPY AND NOT A REFERENCE-CARRY. The junction already IS a reference; leaving it is the defect. The
// ROW has to land in the nominee's library, because every lever over a script (`updateScript`,
// `bulkSetScriptsEnabled`, `removeScript`) is owner-gated by construction and always will be — ownership is
// the only thing that hands the sitting host the switch.
//
// THE DEDUP IS THE DOMAIN'S OWN, NOT A NEW RULE. A candidate that content-matches a row the nominee ALREADY
// owns (`substrate/dedup.findDuplicate`: name + canonical behavior body) re-uses that row instead of minting
// a second — which is also what makes a RETRIED accept converge without a provenance column, since
// `regex_scripts` has no `importedFrom` (world-info's `(ownerId, name)` convergence key, sharpened by the
// body). One consequence is deliberate: the matched row's OWN `enabled` governs afterwards, so a nominee who
// already keeps that script switched off does not get it switched back on behind their back — theirs to flip.
//
// THE RE-POINT IS RETURNED, NOT WRITTEN. Minting a library row is orphan-safe and may land early; MOVING the
// room's attachment is room state and must commit in the same batch as the role swap, so the
// `chat_regex_scripts` statements come back UNEXECUTED for the caller's batch (the `CopyHandoffBooks` seam,
// verbatim).

import type { Db } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { ChatId, RegexScriptId, UserId } from "@orb/kit/ids";

/** db + clock + the id minter. Purpose-built (NOT the full `RegexContext`): a handoff copy writes rows and
 *  emits nothing — the same silence the portability writes keep. */
export interface RegexHandoffCopyContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newScriptId: () => RegexScriptId;
}

/** Copy the room's chat-tier scripts from `fromOwnerId` into `toOwnerId` and return the UNEXECUTED
 *  `chat_regex_scripts` re-point.
 *
 *  OWNER-FILTERED AT THE SOURCE: only scripts attached to THIS chat that `fromOwnerId` actually owns are
 *  candidates. A prior host's row still hanging on the room is not the departing host's to give away, so it
 *  is skipped and stays exactly where it is — the incoming host detaches it with the room gate
 *  (`verbs/attachments/detach-from-chat`) rather than inheriting it laundered through a copy.
 *
 *  Each candidate resolves to an existing content-equal row of `toOwnerId`'s or to a fresh mint, and the
 *  returned pair detaches the source and attaches the target AT THE SOURCE'S `position` — execution order is
 *  data, so the room's transform chain is byte-identical across the handoff. The attach is conflict-safe on
 *  the `(chatId, regexScriptId)` PK, which is what makes a retry idempotent. */
export type CopyHandoffRegexScripts = (args: {
  readonly fromOwnerId: UserId;
  readonly toOwnerId: UserId;
  readonly chatId: ChatId;
}) => Promise<readonly BatchStmt[]>;

/** How many script rows {@link CopyHandoffRegexScripts} would MINT for `toOwnerId` — the NOMINATE-side
 *  disclosure the `handoff-nominated` notification carries (#1762). A regex is the one class in the offer
 *  that EXECUTES on the recipient's own text, so it is also the one the nominee most needs counted before
 *  they press Accept.
 *
 *  READ-ONLY BY CONSTRUCTION (a second op, never a `dryRun` flag on the copy): it answers at NOMINATE, where
 *  nobody has consented yet, and it shares the copy's own plan resolver — so the dedup rule that turns three
 *  attachments into one new row decides the disclosed number and the landed rows identically. An attachment
 *  that converges on a row the nominee already owns is NOT counted: nothing new enters their library. */
export type CountHandoffRegexScripts = (args: { readonly fromOwnerId: UserId; readonly toOwnerId: UserId; readonly chatId: ChatId }) => Promise<number>;
