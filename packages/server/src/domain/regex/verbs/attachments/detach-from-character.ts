// verb: detachFromCharacter — remove a script's character attachment. Both sides gated (the script must be
// the caller's, so a foreign attachment is unreachable). Idempotent: an already-absent row is
// `{detached:false}`, not a throw.

import { characterRegexScripts } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { RegexContext } from "../../context";
import { RegexNotFoundError } from "../../contract/errors";
import type { DetachFromCharacterParams } from "../../contract/params";
import type { RegexService } from "../../contract/service";
import { ensureCharacterOwned } from "../../persistence/ownership";
import { loadOwnedScript } from "../../persistence/queries";

export function createDetachFromCharacter(ctx: RegexContext): RegexService["detachFromCharacter"] {
  return async ({ principal, characterId, scriptId }: DetachFromCharacterParams) => {
    const ownerId = principal.userId;
    const [, script] = await Promise.all([ensureCharacterOwned(ctx.db, ownerId, characterId), loadOwnedScript(ctx.db, ownerId, scriptId)]);
    if (script === undefined) {
      throw new RegexNotFoundError("regex_script", scriptId);
    }
    const at = ctx.now();
    const result = await ctx.db
      .delete(characterRegexScripts)
      .where(and(eq(characterRegexScripts.characterId, characterId), eq(characterRegexScripts.regexScriptId, scriptId)));
    const detached = result.rowsAffected > 0;
    if (detached) {
      await ctx.audit(
        { actorUserId: ownerId, action: "regex.detachFromCharacter", entityType: "regex_script", entityId: scriptId, metadata: { characterId } },
        at,
      );
      ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId });
    }
    return { detached };
  };
}
