// verb: listGlobal — the caller's globally-attached scripts, in execution order. A read: no audit.

import type { RegexContext } from "../../context";
import type { ListGlobalParams } from "../../contract/params";
import type { RegexService } from "../../contract/service";
import { listGlobalScripts, toRow } from "../../persistence/queries";

export function createListGlobal(ctx: RegexContext): RegexService["listGlobal"] {
  return async ({ principal }: ListGlobalParams) => (await listGlobalScripts(ctx.db, principal.userId)).map(toRow);
}
