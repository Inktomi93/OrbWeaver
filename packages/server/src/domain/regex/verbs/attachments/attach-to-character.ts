// verb: attachToCharacter — attach an owned script to an owned character. Gates BOTH sides: the character
// (`ensureCharacterOwned` — a sanctioned schema read) AND the script (`requireOwnedScript`). Idempotent on the
// composite PK; a re-attach keeps the existing position rather than jumping the script to the end.

import { characterRegexScripts } from "@orb/db";
import type { AttachToCharacterParams } from "#src/domain/regex/contract/params.ts";
import type { RegexContext, RegexService } from "#src/domain/regex/contract/service.ts";
import { ensureCharacterOwned, requireOwnedScript } from "#src/domain/regex/persistence/ownership.ts";
import { listCharacterScripts } from "#src/domain/regex/persistence/queries.ts";

export function createAttachToCharacter(ctx: RegexContext): RegexService["attachToCharacter"] {
  return async ({ principal, characterId, scriptId }: AttachToCharacterParams) => {
    const ownerId = principal.userId;
    await ensureCharacterOwned(ctx.db, ownerId, characterId);
    await requireOwnedScript(ctx.db, ownerId, scriptId);
    const at = ctx.now();
    const position = (await listCharacterScripts(ctx.db, ownerId, characterId)).length;
    await ctx.db.insert(characterRegexScripts).values({ characterId, regexScriptId: scriptId, position, createdAt: at }).onConflictDoNothing();
    await ctx.audit({ actorUserId: ownerId, action: "regex.attachToCharacter", entityType: "regex_script", entityId: scriptId, metadata: { characterId } }, at);
    ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId });
  };
}
