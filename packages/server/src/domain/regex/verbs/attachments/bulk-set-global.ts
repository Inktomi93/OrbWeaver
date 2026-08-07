// verb: bulkSetScriptsGlobal — add or clear the GLOBAL attachment for many owned scripts at once (REGX2).
// An ATTACHMENT verb, so it lives here rather than beside the script-row bulks: the write target is
// `global_regex_scripts`, whose scope is the SCRIPT's ownership (the junction has no owner column). The gate
// is therefore `loadOwnedScriptsByIds` — a foreign id never comes back, so it can never be attached, and the
// junction statement below only ever sees ids this caller owns.
//
// ATTACH APPENDS, and that is the whole reason this is not a loop over `attachGlobal`: the global tier is
// ORDERED (the executor applies its list in order and the context pane authors that order), so the block is
// appended ONCE at the current end, in the caller's own order, and no existing attachment is renumbered.
// Already-global ids are filtered out first — inserting them would consume positions for rows that
// `onConflictDoNothing` leaves exactly where they were.

import type { RegexScriptId, UserId } from "@orb/kit/ids";
import type { RegexContext } from "../../context.ts";
import type { BulkSetScriptsGlobalParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { attachGlobalBulk, detachGlobalBulk, listGlobalScripts, loadOwnedScriptsByIds } from "../../persistence/queries.ts";

export function createBulkSetGlobal(ctx: RegexContext): RegexService["bulkSetScriptsGlobal"] {
  return async ({ principal, scriptIds, global }: BulkSetScriptsGlobalParams) => {
    const ownerId = principal.userId;
    const owned = new Set((await loadOwnedScriptsByIds(ctx.db, ownerId, scriptIds)).map((record) => record.id));
    // The caller's order, minus everything they do not own — the append block's order is the user's.
    const targets = scriptIds.filter((scriptId) => owned.has(scriptId));
    const at = ctx.now();

    const affected = global ? await attachMissing(ctx, ownerId, targets, at) : (await detachGlobalBulk(ctx.db, targets)).length;
    if (affected > 0) {
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: global ? "regex.bulkAttachGlobal" : "regex.bulkDetachGlobal",
          entityType: "regex_script",
          metadata: { count: affected, bulk: true },
        },
        at,
      );
      ctx.emitUserEvent(ownerId, { type: "regexChanged" });
    }
    return { affected };
  };
}

/** Append the targets that are not already in the tier, and answer how many that was. */
async function attachMissing(ctx: RegexContext, ownerId: UserId, targets: readonly RegexScriptId[], at: number): Promise<number> {
  const current = await listGlobalScripts(ctx.db, ownerId);
  const already = new Set<RegexScriptId>(current.map((record) => record.id));
  const missing = targets.filter((scriptId) => !already.has(scriptId));
  await attachGlobalBulk(ctx.db, missing, current.length, at);
  return missing.length;
}
