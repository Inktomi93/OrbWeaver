// domain/regex/contract/handoff-copy — the `RegexHandoffCopyContext` DI bundle + op type for the regex-owned
// script copy the host-handoff property offer executes. The `world-info/contract/handoff-copy` twin, and it
// exists for the same reason, one degree worse.
//
// WHY THE ROOM'S SCRIPTS MUST MOVE. Only a script's owner can edit its `behavior` or flip `enabled`, and a
// regex is EXECUTABLE (a find/replace over prompt slots, persisted canon and rendered output). A room keeps
// the departing host's script only as a copy under the new host; without an accepted offer the swap detaches
// it ({@link DetachHandoffRegexScripts}), and the turn resolver reads only host-owned chat scripts (D64).
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

import type { CopyHandoffRegexScriptsArgs } from "@orb/contracts/regex";
import type { StatementToken } from "@orb/db/wiring";
import type { ChatId, UserId } from "@orb/kit/ids";

/** The UNEXECUTED `chat_regex_scripts` delete the handoff swap commits (D64): every script attached to
 *  `chatId` that `hostUserId`, the incoming host, does not own leaves the room. It runs after the copy
 *  re-point, so the copies an accepted offer attached stay. */
export type DetachHandoffRegexScripts = (args: { readonly chatId: ChatId; readonly hostUserId: UserId }) => StatementToken;

/** Copy the room's chat-tier scripts from `fromOwnerId` into `toOwnerId` and return the UNEXECUTED
 *  `chat_regex_scripts` re-point.
 *
 *  OWNER-FILTERED AT THE SOURCE: only scripts attached to THIS chat that `fromOwnerId` actually owns are
 *  candidates. A prior host's row still on the room is not the departing host's to give away, so the copy
 *  skips it and {@link DetachHandoffRegexScripts} takes it off the room in the same swap.
 *
 *  Each candidate resolves to an existing content-equal row of `toOwnerId`'s or to a fresh mint, and the
 *  returned pair detaches the source and attaches the target AT THE SOURCE'S `position` — execution order is
 *  data, so the room's transform chain is byte-identical across the handoff. The attach is conflict-safe on
 *  the `(chatId, regexScriptId)` PK, which is what makes a retry idempotent. */
export type CopyHandoffRegexScripts = (args: CopyHandoffRegexScriptsArgs) => Promise<readonly StatementToken[]>;
