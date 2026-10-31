// verb: detachFromPreset — remove a script's preset attachment. Both sides gated (the script must be
// the caller's, so a foreign attachment is unreachable). Idempotent: an already-absent row is
// `{detached:false}`, not a throw.

import { presetRegexScripts } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { DetachFromPresetParams } from "#src/domain/regex/contract/params.ts";
import type { RegexContext, RegexService } from "#src/domain/regex/contract/service.ts";
import { ensurePresetOwned, requireOwnedScript } from "#src/domain/regex/persistence/ownership.ts";

export function createDetachFromPreset(ctx: RegexContext): RegexService["detachFromPreset"] {
  return async ({ principal, presetId, scriptId }: DetachFromPresetParams) => {
    const ownerId = principal.userId;
    await ensurePresetOwned(ctx.db, ownerId, presetId);
    await requireOwnedScript(ctx.db, ownerId, scriptId);
    const at = ctx.now();
    const result = await ctx.db
      .delete(presetRegexScripts)
      .where(and(eq(presetRegexScripts.presetId, presetId), eq(presetRegexScripts.regexScriptId, scriptId)));
    const detached = result.rowsAffected > 0;
    if (detached) {
      await ctx.audit({ actorUserId: ownerId, action: "regex.detachFromPreset", entityType: "regex_script", entityId: scriptId, metadata: { presetId } }, at);
      ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId });
    }
    return { detached };
  };
}
