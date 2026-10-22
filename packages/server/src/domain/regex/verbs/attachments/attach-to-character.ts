// verb: attachToCharacter — attach an owned script to an owned character. Gates BOTH sides: the character
// (`ensureCharacterOwned` — a sanctioned schema read) AND the script (`loadOwnedScript`). Idempotent on the
// composite PK; a re-attach keeps the existing position rather than jumping the script to the end.

import { characterRegexScripts } from "@orb/db";
import { RegexNotFoundError } from "#src/domain/regex/contract/errors.ts";
import type { AttachToCharacterParams } from "#src/domain/regex/contract/params.ts";
import type { RegexContext, RegexService } from "#src/domain/regex/contract/service.ts";
import { ensureCharacterOwned } from "#src/domain/regex/persistence/ownership.ts";
import { listCharacterScripts, loadOwnedScript } from "#src/domain/regex/persistence/queries.ts";

export function createAttachToCharacter(ctx: RegexContext): RegexService["attachToCharacter"] {
  return async ({ principal, characterId, scriptId }: AttachToCharacterParams) => {
    const ownerId = principal.userId;
    const [, script] = await Promise.all([ensureCharacterOwned(ctx.db, ownerId, characterId), loadOwnedScript(ctx.db, ownerId, scriptId)]);
    if (script === undefined) {
      throw new RegexNotFoundError("regex_script", scriptId);
    }
    const at = ctx.now();
    const position = (await listCharacterScripts(ctx.db, ownerId, characterId)).length;
    await ctx.db.insert(characterRegexScripts).values({ characterId, regexScriptId: scriptId, position, createdAt: at }).onConflictDoNothing();
    await ctx.audit({ actorUserId: ownerId, action: "regex.attachToCharacter", entityType: "regex_script", entityId: scriptId, metadata: { characterId } }, at);
    ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId });
  };
}
