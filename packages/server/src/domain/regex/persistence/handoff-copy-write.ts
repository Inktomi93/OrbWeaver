// domain/regex/persistence/handoff-copy-write — the regex-owned script copy the host-handoff property offer
// executes. A named exception to "persistence is queries only" (the `portability-write` / world-info
// `handoff-copy-write` precedent): chat must land scripts in the NOMINEE's library and re-point the room's
// attachment, and chat never touches the regex tables. The WHY is in `../contract/handoff-copy.ts`; this
// file is the mechanism, and the DECISION it leans on (is this a row the recipient already has?) is the one
// dedup rule in `../substrate/dedup.ts`, never a second spelling of it.
//
// EVERY SOURCE READ CARRIES `fromOwnerId` IN ITS WHERE. A chat junction row is not a license: the departing
// host may have a PRIOR host's script attached to this room (the chat tier is read unscoped), and that is
// not theirs to give away. Those rows are skipped silently and stay attached — the incoming host's remedy
// for them is `detachFromChat`, which gates on the ROOM, not on the script's owner.
//
// THE BODY THAT CROSSES THE OWNER BOUNDARY IS THE PARSED ONE, never the stored bytes: the copy is built from
// `toRow` (the read seam's validating parse), so an unvalidated blob can never be laundered into another
// principal's library, and a corrupt source degrades to the same INERT script the resolver already sees for
// it rather than to junk the nominee cannot explain.

import type { Db } from "@orb/db";
import { chatRegexScripts, regexScripts } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { ChatId, UserId } from "@orb/kit/ids";
import { and, asc, eq } from "drizzle-orm";
import type { SplitScript } from "../contract/dedup.ts";
import type { CopyHandoffRegexScripts, RegexHandoffCopyContext } from "../contract/handoff-copy.ts";
import type { ScriptRecord } from "../contract/rows.ts";
import { findDuplicate } from "../substrate/dedup.ts";
import { listOwnedScripts, toRow } from "./queries.ts";

/** One chat-tier attachment the departing host owns: the script record plus the junction slot it holds. */
interface OwnedChatAttachment {
  readonly script: ScriptRecord;
  readonly position: number;
}

/** The scripts attached to THIS CHAT that `fromOwnerId` actually OWNS — the license the copy severs. Ordered
 *  by the junction position so the mints (and therefore any minted ids) are deterministic. */
async function ownedChatAttachments(db: Db, fromOwnerId: UserId, chatId: ChatId): Promise<OwnedChatAttachment[]> {
  return await db
    .select({ script: regexScripts, position: chatRegexScripts.position })
    .from(chatRegexScripts)
    .innerJoin(regexScripts, eq(chatRegexScripts.regexScriptId, regexScripts.id))
    .where(and(eq(chatRegexScripts.chatId, chatId), eq(regexScripts.ownerId, fromOwnerId)))
    .orderBy(asc(chatRegexScripts.position), asc(regexScripts.createdAt));
}

/** A stored record as the dedup planner's candidate — the PARSED body (see the header), split into the row's
 *  promoted columns plus its behavior, exactly the shape `findDuplicate` keys on. */
function candidateOf(record: ScriptRecord): SplitScript {
  const { id: _id, name, enabled, updatedAt: _updatedAt, ...behavior } = toRow(record);
  return { name, enabled, behavior };
}

export function createCopyHandoffRegexScripts(ctx: RegexHandoffCopyContext): CopyHandoffRegexScripts {
  return async ({ fromOwnerId, toOwnerId, chatId }): Promise<readonly BatchStmt[]> => {
    const { db } = ctx;
    if (fromOwnerId === toOwnerId) {
      // Nothing transfers to yourself, and copying anyway would fork the room's own scripts. The caller
      // already refuses this accept, but a persistence factory's signature is the boundary the next wiring
      // inherits (the `#1414 seam 4` posture in `portability-write`).
      return [];
    }
    const sources = await ownedChatAttachments(db, fromOwnerId, chatId);
    if (sources.length === 0) {
      return [];
    }
    const at = ctx.now();
    // The recipient's library as the convergence set. It GROWS with each mint so two content-equal sources
    // land one row, and so a retried accept (whose first pass already minted) finds its own copies here.
    const recipientRows = (await listOwnedScripts(db, toOwnerId)).map(toRow);
    const mints: BatchStmt[] = [];
    const repoint: BatchStmt[] = [];
    for (const { script, position } of sources) {
      const candidate = candidateOf(script);
      const converged = findDuplicate(recipientRows, candidate);
      const targetId = converged ?? ctx.newScriptId();
      if (converged === null) {
        mints.push(
          batchStmt(
            db.insert(regexScripts).values({
              id: targetId,
              ownerId: toOwnerId,
              name: candidate.name,
              enabled: candidate.enabled,
              behavior: candidate.behavior,
              createdAt: at,
              updatedAt: at,
            }),
          ),
        );
        recipientRows.push({ id: targetId, name: candidate.name, enabled: candidate.enabled, updatedAt: at, ...candidate.behavior });
      }
      repoint.push(batchStmt(db.delete(chatRegexScripts).where(and(eq(chatRegexScripts.chatId, chatId), eq(chatRegexScripts.regexScriptId, script.id)))));
      repoint.push(batchStmt(db.insert(chatRegexScripts).values({ chatId, regexScriptId: targetId, position, createdAt: at }).onConflictDoNothing()));
    }
    if (mints.length > 0) {
      await db.batch(batchMany(mints));
    }
    return repoint;
  };
}
