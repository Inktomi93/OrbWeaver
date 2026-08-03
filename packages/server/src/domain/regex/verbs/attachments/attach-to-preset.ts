// verb: attachToPreset — attach an owned script to an owned preset. Gates BOTH sides: the preset
// (`ensurePresetOwned` — a sanctioned schema read) AND the script (`loadOwnedScript`). Idempotent on the
// composite PK; a re-attach keeps the existing position rather than jumping the script to the end.

import { presetRegexScripts } from "@orb/db";
import type { RegexContext } from "../../context.ts";
import { RegexNotFoundError } from "../../contract/errors.ts";
import type { AttachToPresetParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { ensurePresetOwned } from "../../persistence/ownership.ts";
import { listPresetScripts, loadOwnedScript } from "../../persistence/queries.ts";

export function createAttachToPreset(ctx: RegexContext): RegexService["attachToPreset"] {
  return async ({ principal, presetId, scriptId }: AttachToPresetParams) => {
    const ownerId = principal.userId;
    const [, script] = await Promise.all([ensurePresetOwned(ctx.db, ownerId, presetId), loadOwnedScript(ctx.db, ownerId, scriptId)]);
    if (script === undefined) {
      throw new RegexNotFoundError("regex_script", scriptId);
    }
    const at = ctx.now();
    const position = (await listPresetScripts(ctx.db, ownerId, presetId)).length;
    await ctx.db.insert(presetRegexScripts).values({ presetId, regexScriptId: scriptId, position, createdAt: at }).onConflictDoNothing();
    await ctx.audit({ actorUserId: ownerId, action: "regex.attachToPreset", entityType: "regex_script", entityId: scriptId, metadata: { presetId } }, at);
    ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId });
  };
}
