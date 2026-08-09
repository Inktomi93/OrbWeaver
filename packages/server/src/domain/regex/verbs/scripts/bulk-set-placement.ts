// verb: bulkSetScriptsPlacement — REPLACE the placement set across many owned scripts in one batch (REGX2 ·
// D2 unblocked). The wire carries ONLY the new placement; the display/prompt tier flags and the history-depth
// scope are RE-DERIVED per row from that set through `@orb/kit/regex` — the SAME pure derivations the client's
// per-script save boundary uses (`withDerivedTierFlags`). One derivation, two callers: a bulk change and a
// single edit can never disagree, and no flag ever rides the wire. This is the whole reason the derivation was
// lifted to kit — the server could not re-derive from a client-only helper.
//
// PER ROW, because the bodies differ: each script keeps its own find/replace and any authored depth scope, so
// this reads every owned row (before the batch — never a SELECT inside it, the `db/kit/batch` DEFERRED note),
// rebuilds each behavior blob (placement replaced · flags re-derived · depth kept-or-dropped), re-PARSES it
// through `regexScriptBehaviorSchema` so the stored blob is canonical AND the placement/depth pairing is
// enforced, then writes them all in one owner-scoped batch. Foreign/absent ids never come back from the read,
// so the `affected` count is the honest answer and the verb is never an ownership oracle over a list.

import { regexScriptBehaviorSchema } from "@orb/contracts/regex";
import { deriveRegexHistoryDepth, deriveRegexTierFlags } from "@orb/kit/regex";
import type { RegexContext } from "../../context.ts";
import type { BulkSetScriptsPlacementParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { loadOwnedScriptsByIds, setScriptsBehaviorBulk, toRow } from "../../persistence/queries.ts";

export function createBulkSetPlacement(ctx: RegexContext): RegexService["bulkSetScriptsPlacement"] {
  return async ({ principal, scriptIds, placement }: BulkSetScriptsPlacementParams) => {
    const ownerId = principal.userId;
    // Read first (the ownership gate + the per-row bodies), outside the write batch.
    const records = await loadOwnedScriptsByIds(ctx.db, ownerId, scriptIds);
    if (records.length === 0) {
      return { affected: 0 };
    }

    // The two flags are the same for every row (they depend only on the shared new placement); the depth scope
    // is per-row (it keeps each script's authored bound, or takes the whole history, or drops — see kit).
    const tierFlags = deriveRegexTierFlags(placement);
    const updates = records.map((record) => {
      const { id: _id, name: _name, enabled: _enabled, updatedAt: _updatedAt, historyDepth: currentDepth, ...body } = toRow(record);
      const nextDepth = deriveRegexHistoryDepth(placement, currentDepth);
      const behavior = regexScriptBehaviorSchema.parse({
        ...body,
        placement,
        ...tierFlags,
        ...(nextDepth === undefined ? {} : { historyDepth: nextDepth }),
      });
      return { id: record.id, behavior };
    });

    // ONE clock read for the whole operation: every row's `updatedAt` and the audit's instant are the same.
    const at = ctx.now();
    const affected = await setScriptsBehaviorBulk(ctx.db, ownerId, updates, at);
    if (affected > 0) {
      await ctx.audit(
        { actorUserId: ownerId, action: "regex.bulkSetScriptsPlacement", entityType: "regex_script", metadata: { count: affected, bulk: true } },
        at,
      );
      // O-7 arm (a): ONE per-owner `regexChanged` for the whole gesture — N emits would be N refetches.
      ctx.emitUserEvent(ownerId, { type: "regexChanged" });
    }
    return { affected };
  };
}
