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
import type { ChatId, RegexScriptId, UserId } from "@orb/kit/ids";
import { and, asc, eq } from "drizzle-orm";
import type { SplitScript } from "../contract/dedup.ts";
import type { CopyHandoffRegexScripts, CountHandoffRegexScripts, RegexHandoffCopyContext } from "../contract/handoff-copy.ts";
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

/** One attachment's resolved destination: a row the recipient ALREADY has, or the n-th row this transfer
 *  would mint (an index rather than an id, because ids are the writer's to mint and the disclosure must not
 *  mint one to count it). */
type ScriptCopyTarget = { readonly kind: "existing"; readonly id: RegexScriptId } | { readonly kind: "mint"; readonly group: number };

/** WHAT THE TRANSFER WOULD DO, decided once and read by both callers below — the writer turns it into
 *  statements, the #1762 disclosure counts its `mints`. Extracted rather than re-derived: the convergence
 *  rule (a content-equal row the nominee already owns is REUSED, and two content-equal sources land ONE row)
 *  is the difference between "3 scripts" and "1 script" in the nominee's confirm, and a second spelling of
 *  it is a number that lies about what the accept then does. */
interface PlannedAttachment {
  readonly sourceId: RegexScriptId;
  readonly position: number;
  readonly target: ScriptCopyTarget;
}

interface HandoffScriptCopyPlan {
  /** Every chat attachment `fromOwnerId` owns, in junction order, with its destination. */
  readonly attachments: readonly PlannedAttachment[];
  /** The DISTINCT rows this transfer would mint under `toOwnerId`, in `group` order. */
  readonly mints: readonly SplitScript[];
}

/** Resolve the plan. The recipient's library is the convergence set and it GROWS with each planned mint, so
 *  two content-equal sources converge on one group — and a retried accept (whose first pass already minted)
 *  finds its own copies in the stored half rather than minting a second set. */
async function resolveHandoffScriptCopyPlan(db: Db, fromOwnerId: UserId, toOwnerId: UserId, chatId: ChatId): Promise<HandoffScriptCopyPlan> {
  if (fromOwnerId === toOwnerId) {
    // Nothing transfers to yourself, and copying anyway would fork the room's own scripts. The caller
    // already refuses this accept, but a persistence factory's signature is the boundary the next wiring
    // inherits (the `#1414 seam 4` posture in `portability-write`).
    return { attachments: [], mints: [] };
  }
  const sources = await ownedChatAttachments(db, fromOwnerId, chatId);
  if (sources.length === 0) {
    return { attachments: [], mints: [] };
  }
  const recipientRows = (await listOwnedScripts(db, toOwnerId)).map(toRow);
  const attachments: PlannedAttachment[] = [];
  const mints: SplitScript[] = [];
  for (const { script, position } of sources) {
    const candidate = candidateOf(script);
    const converged = findDuplicate(recipientRows, candidate);
    if (converged === null) {
      // A PLANNED row joins the convergence set under a placeholder id: only its BODY is compared, and the
      // writer replaces the placeholder with the id it mints for this same group.
      const group = mints.length;
      mints.push(candidate);
      recipientRows.push({ id: script.id, name: candidate.name, enabled: candidate.enabled, updatedAt: 0, ...candidate.behavior });
      attachments.push({ sourceId: script.id, position, target: { kind: "mint", group } });
      continue;
    }
    attachments.push({ sourceId: script.id, position, target: { kind: "existing", id: converged } });
  }
  return { attachments, mints };
}

export function createCopyHandoffRegexScripts(ctx: RegexHandoffCopyContext): CopyHandoffRegexScripts {
  return async ({ fromOwnerId, toOwnerId, chatId }): Promise<readonly BatchStmt[]> => {
    const { db } = ctx;
    const plan = await resolveHandoffScriptCopyPlan(db, fromOwnerId, toOwnerId, chatId);
    if (plan.attachments.length === 0) {
      return [];
    }
    const at = ctx.now();
    const mintedIds = plan.mints.map(() => ctx.newScriptId());
    const mints = plan.mints.map((candidate, group) =>
      batchStmt(
        db.insert(regexScripts).values({
          id: mintedIds[group] ?? ctx.newScriptId(),
          ownerId: toOwnerId,
          name: candidate.name,
          enabled: candidate.enabled,
          behavior: candidate.behavior,
          createdAt: at,
          updatedAt: at,
        }),
      ),
    );
    const repoint: BatchStmt[] = [];
    for (const { sourceId, position, target } of plan.attachments) {
      const targetId = target.kind === "existing" ? target.id : (mintedIds[target.group] ?? sourceId);
      repoint.push(batchStmt(db.delete(chatRegexScripts).where(and(eq(chatRegexScripts.chatId, chatId), eq(chatRegexScripts.regexScriptId, sourceId)))));
      repoint.push(batchStmt(db.insert(chatRegexScripts).values({ chatId, regexScriptId: targetId, position, createdAt: at }).onConflictDoNothing()));
    }
    if (mints.length > 0) {
      await db.batch(batchMany(mints));
    }
    return repoint;
  };
}

/** THE DISCLOSURE (#1762) — how many script rows an accepted offer would land in the nominee's library,
 *  off the copy's OWN plan. `db` only, and that is the point: the nomination happens before consent, so the
 *  op that answers "what would this cost me" must be structurally unable to write.
 *
 *  It counts MINTS, not attachments: a script the nominee already owns content-identically is re-used rather
 *  than duplicated, so it is not something they receive — and the copy's own header rules that the matched
 *  row's `enabled` governs afterwards, i.e. nothing about their library changes for it. */
export function createCountHandoffRegexScripts(db: Db): CountHandoffRegexScripts {
  return async ({ fromOwnerId, toOwnerId, chatId }): Promise<number> => (await resolveHandoffScriptCopyPlan(db, fromOwnerId, toOwnerId, chatId)).mints.length;
}
