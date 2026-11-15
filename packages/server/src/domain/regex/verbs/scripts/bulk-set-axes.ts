// verb: bulkSetScriptsAxes — REPLACE both behavior axes across many owned scripts in one batch (REGX2).
//
// The router has already refused a `save` pass beside an ephemeral one, so every row gets the same pair. PER ROW,
// because the bodies differ: each script keeps its own find/replace, and its depth and author scope while it stays
// on an ephemeral pass. A move to the save pass CLEARS both, since they apply only on display or in the prompt
// (owner ruling: a when-saved choice is the script's choice), and names the row in `cleared` so the gesture can
// say so; refusing one row of a bulk gesture over a field the dialog never shows would be the surprise. The rows
// are read before the batch (never a SELECT inside it), each rebuilt blob re-parses through the write schema, and
// foreign or absent ids never come back from the read, so `affected` is the honest count and never an ownership
// oracle over a list.

import type { BulkAxesResult, RegexScriptBehavior } from "@orb/contracts/regex";
import { regexScriptBehaviorWriteSchema } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import type { BulkSetScriptsAxesParams } from "#src/domain/regex/contract/params.ts";
import type { RegexContext, RegexService } from "#src/domain/regex/contract/service.ts";
import { loadOwnedScriptsByIds, setScriptsBehaviorBulk, toRow } from "#src/domain/regex/persistence/queries.ts";
import { settleEphemeralScope } from "#src/domain/regex/substrate/ephemeral-scope.ts";

export function createBulkSetAxes(ctx: RegexContext): RegexService["bulkSetScriptsAxes"] {
  return async ({ principal, scriptIds, targets, passes }: BulkSetScriptsAxesParams): Promise<BulkAxesResult> => {
    const ownerId = principal.userId;
    const records = await loadOwnedScriptsByIds(ctx.db, ownerId, scriptIds);
    if (records.length === 0) {
      return { affected: 0, cleared: [] };
    }
    const cleared: RegexScriptId[] = [];
    const updates = records.map((record): { readonly id: RegexScriptId; readonly behavior: RegexScriptBehavior } => {
      const { id: _id, name: _name, enabled: _enabled, updatedAt: _updatedAt, ...body } = toRow(record);
      const settled = settleEphemeralScope({ ...body, targets: [...targets], passes: [...passes] });
      if (settled.cleared) {
        cleared.push(record.id);
      }
      return { id: record.id, behavior: regexScriptBehaviorWriteSchema.parse(settled.behavior) };
    });

    // ONE clock read for the whole operation: every row's `updatedAt` and the audit's instant are the same.
    const at = ctx.now();
    const affected = await setScriptsBehaviorBulk(ctx.db, ownerId, updates, at);
    if (affected > 0) {
      await ctx.audit({ actorUserId: ownerId, action: "regex.bulkSetScriptsAxes", entityType: "regex_script", metadata: { count: affected, bulk: true } }, at);
      // O-7 arm (a): ONE per-owner `regexChanged` for the whole gesture — N emits would be N refetches.
      ctx.emitUserEvent(ownerId, { type: "regexChanged" });
      // The ROOM plane, per written row: an axes change moves what every room each script reaches runs on its
      // turns and draws on its transcripts. Post-write reach is correct here: the rows survive this write.
      await Promise.all(updates.map((update) => ctx.fanRegexScriptRooms(update.id)));
    }
    return { affected, cleared };
  };
}
