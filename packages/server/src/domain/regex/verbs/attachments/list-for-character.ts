// verb: listForCharacter — the scripts attached to an owned character, in execution order. A read: no audit.
// Owner-filtered on BOTH sides, so this can never enumerate a foreign character's attachments.

import type { RegexContext } from "../../context.ts";
import type { ListForCharacterParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { ensureCharacterOwned } from "../../persistence/ownership.ts";
import { listCharacterScripts, toRow } from "../../persistence/queries.ts";

export function createListForCharacter(ctx: RegexContext): RegexService["listForCharacter"] {
  return async ({ principal, characterId }: ListForCharacterParams) => {
    await ensureCharacterOwned(ctx.db, principal.userId, characterId);
    return (await listCharacterScripts(ctx.db, principal.userId, characterId)).map(toRow);
  };
}
