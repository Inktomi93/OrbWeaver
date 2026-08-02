// verb: listForCharacter — the scripts attached to an owned character, in execution order. A read: no audit.
// Owner-filtered on BOTH sides, so this can never enumerate a foreign character's attachments.

import type { RegexContext } from "../../context";
import type { ListForCharacterParams } from "../../contract/params";
import type { RegexService } from "../../contract/service";
import { ensureCharacterOwned } from "../../persistence/ownership";
import { listCharacterScripts, toRow } from "../../persistence/queries";

export function createListForCharacter(ctx: RegexContext): RegexService["listForCharacter"] {
  return async ({ principal, characterId }: ListForCharacterParams) => {
    await ensureCharacterOwned(ctx.db, principal.userId, characterId);
    return (await listCharacterScripts(ctx.db, principal.userId, characterId)).map(toRow);
  };
}
