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
import { EPHEMERAL_REGEX_PASSES } from "@orb/kit/regex";
import type { BulkSetScriptsAxesParams } from "#src/domain/regex/contract/params.ts";
import type { RegexContext, RegexService } from "#src/domain/regex/contract/service.ts";
import { loadOwnedScriptsByIds, setScriptsBehaviorBulk, toRow } from "#src/domain/regex/persistence/queries.ts";

export function createBulkSetAxes(ctx: RegexContext): RegexService["bulkSetScriptsAxes"] {
  return async ({ principal, scriptIds, targets, passes }: BulkSetScriptsAxesParams): Promise<BulkAxesResult> => {
    const ownerId = principal.userId;
    const records = await loadOwnedScriptsByIds(ctx.db, ownerId, scriptIds);
    if (records.length === 0) {
      return { affected: 0, cleared: [] };
    }
    const ephemeral = passes.some((pass) => (EPHEMERAL_REGEX_PASSES as readonly string[]).includes(pass));
    const cleared: RegexScriptId[] = [];
    const updates = records.map((record): { readonly id: RegexScriptId; readonly behavior: RegexScriptBehavior } => {
      const { id: _id, name: _name, enabled: _enabled, updatedAt: _updatedAt, depth, authors, ...body } = toRow(record);
      if (!ephemeral && (depth !== undefined || authors !== undefined)) {
        cleared.push(record.id);
      }
      const behavior = regexScriptBehaviorWriteSchema.parse({
        ...body,
        targets,
        passes,
        ...(ephemeral && depth !== undefined ? { depth } : {}),
        ...(ephemeral && authors !== undefined ? { authors } : {}),
      });
      return { id: record.id, behavior };
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
