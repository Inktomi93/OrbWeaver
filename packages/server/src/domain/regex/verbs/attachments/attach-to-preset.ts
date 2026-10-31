// verb: attachToPreset — attach an owned script to an owned preset. Gates BOTH sides: the preset
// (`ensurePresetOwned` — a sanctioned schema read) AND the script (`requireOwnedScript`). Idempotent on the
// composite PK; a re-attach keeps the existing position rather than jumping the script to the end.

import { presetRegexScripts } from "@orb/db";
import type { AttachToPresetParams } from "#src/domain/regex/contract/params.ts";
import type { RegexContext, RegexService } from "#src/domain/regex/contract/service.ts";
import { ensurePresetOwned, requireOwnedScript } from "#src/domain/regex/persistence/ownership.ts";
import { listPresetScripts } from "#src/domain/regex/persistence/queries.ts";

export function createAttachToPreset(ctx: RegexContext): RegexService["attachToPreset"] {
  return async ({ principal, presetId, scriptId }: AttachToPresetParams) => {
    const ownerId = principal.userId;
    await ensurePresetOwned(ctx.db, ownerId, presetId);
    await requireOwnedScript(ctx.db, ownerId, scriptId);
    const at = ctx.now();
    const position = (await listPresetScripts(ctx.db, ownerId, presetId)).length;
    await ctx.db.insert(presetRegexScripts).values({ presetId, regexScriptId: scriptId, position, createdAt: at }).onConflictDoNothing();
    await ctx.audit({ actorUserId: ownerId, action: "regex.attachToPreset", entityType: "regex_script", entityId: scriptId, metadata: { presetId } }, at);
    ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId });
  };
}
