// verb: attachToCharacter — attach an owned script to an owned character. Gates BOTH sides: the character
// (`ensureCharacterOwned` — a sanctioned schema read) AND the script (`loadOwnedScript`). Idempotent on the
// composite PK; a re-attach keeps the existing position rather than jumping the script to the end.

import { characterRegexScripts } from "@orb/db";
import type { RegexContext } from "../../context.ts";
import { RegexNotFoundError } from "../../contract/errors.ts";
import type { AttachToCharacterParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { ensureCharacterOwned } from "../../persistence/ownership.ts";
import { listCharacterScripts, loadOwnedScript } from "../../persistence/queries.ts";

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
