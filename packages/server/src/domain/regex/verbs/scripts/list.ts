// verb: listScripts — the caller's library, newest first (owner-scoped off `principal.userId`). A read: no
// audit. This is the ONE library surface — the client's regex pane, the preset picker, and the character
// picker all read it, which is what makes there be ONE editor at ONE capability level.

import type { RegexContext } from "../../context.ts";
import type { ListScriptsParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { listOwnedScripts, toRow } from "../../persistence/queries.ts";

export function createList(ctx: RegexContext): RegexService["listScripts"] {
  return async ({ principal }: ListScriptsParams) => {
    const records = await listOwnedScripts(ctx.db, principal.userId);
    return records.map(toRow);
  };
}
