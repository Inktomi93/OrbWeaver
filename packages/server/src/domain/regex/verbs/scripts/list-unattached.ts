// verb: listUnattachedScripts — the owner's scripts that sit on no junction: global, character, preset or room. A read:
// no audit.

import type { ListScriptsParams } from "#src/domain/regex/contract/params.ts";
import type { RegexContext, RegexService } from "#src/domain/regex/contract/service.ts";
import { listUnattachedScripts, toRow } from "#src/domain/regex/persistence/queries.ts";

export function createListUnattached(ctx: RegexContext): RegexService["listUnattachedScripts"] {
  return async ({ principal }: ListScriptsParams) => (await listUnattachedScripts(ctx.db, principal.userId)).map(toRow);
}
