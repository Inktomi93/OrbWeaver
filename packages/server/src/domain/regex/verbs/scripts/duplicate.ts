// verb: duplicateScript — copy an owned script into a fresh "<name> (copy)" row, UNATTACHED at every scope
// (the `duplicateBook` posture: a copy is a new authored artifact, not a second attachment of the original).

import { regexScripts } from "@orb/db";
import type { RegexContext } from "../../context.ts";
import { RegexNotFoundError } from "../../contract/errors.ts";
import type { DuplicateScriptParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { loadOwnedScript, toRow } from "../../persistence/queries.ts";

const COPY_SUFFIX = " (copy)";

export function createDuplicate(ctx: RegexContext): RegexService["duplicateScript"] {
  return async ({ principal, scriptId }: DuplicateScriptParams) => {
    const ownerId = principal.userId;
    const record = await loadOwnedScript(ctx.db, ownerId, scriptId);
    if (record === undefined) {
      throw new RegexNotFoundError("regex_script", scriptId);
    }
    const { id: _sourceId, name: _sourceName, enabled: _sourceEnabled, updatedAt: _sourceUpdatedAt, ...behavior } = toRow(record);
    const at = ctx.now();
    const copyId = ctx.newScriptId();
    const name = `${record.name}${COPY_SUFFIX}`;

    // The COPY is edited NOW, not when its source was: a duplicate is a new authored artifact (the
    // unattached-at-every-scope posture), so it enters the list at the top of the freshness order.
    await ctx.db.insert(regexScripts).values({ id: copyId, ownerId, name, enabled: record.enabled, behavior, createdAt: at, updatedAt: at });
    await ctx.audit(
      { actorUserId: ownerId, action: "regex.duplicateScript", entityType: "regex_script", entityId: copyId, metadata: { sourceScriptId: scriptId } },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId: copyId });
    return { id: copyId, name, enabled: record.enabled, updatedAt: at, ...behavior };
  };
}
