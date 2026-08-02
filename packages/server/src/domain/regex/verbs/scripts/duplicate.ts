// verb: duplicateScript — copy an owned script into a fresh "<name> (copy)" row, UNATTACHED at every scope
// (the `duplicateBook` posture: a copy is a new authored artifact, not a second attachment of the original).

import { regexScripts } from "@orb/db";
import type { RegexContext } from "../../context";
import { RegexNotFoundError } from "../../contract/errors";
import type { DuplicateScriptParams } from "../../contract/params";
import type { RegexService } from "../../contract/service";
import { loadOwnedScript, toRow } from "../../persistence/queries";

const COPY_SUFFIX = " (copy)";

export function createDuplicate(ctx: RegexContext): RegexService["duplicateScript"] {
  return async ({ principal, scriptId }: DuplicateScriptParams) => {
    const ownerId = principal.userId;
    const record = await loadOwnedScript(ctx.db, ownerId, scriptId);
    if (record === undefined) {
      throw new RegexNotFoundError("regex_script", scriptId);
    }
    const { id: _sourceId, name: _sourceName, enabled: _sourceEnabled, ...behavior } = toRow(record);
    const at = ctx.now();
    const copyId = ctx.newScriptId();
    const name = `${record.name}${COPY_SUFFIX}`;

    await ctx.db.insert(regexScripts).values({ id: copyId, ownerId, name, enabled: record.enabled, behavior, createdAt: at });
    await ctx.audit(
      { actorUserId: ownerId, action: "regex.duplicateScript", entityType: "regex_script", entityId: copyId, metadata: { sourceScriptId: scriptId } },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId: copyId });
    return { id: copyId, name, enabled: record.enabled, ...behavior };
  };
}
