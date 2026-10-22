// verb: listGlobal — the caller's globally-attached scripts, in execution order. A read: no audit.

import type { ListGlobalParams } from "#src/domain/regex/contract/params.ts";
import type { RegexContext, RegexService } from "#src/domain/regex/contract/service.ts";
import { listGlobalScripts, toRow } from "#src/domain/regex/persistence/queries.ts";

export function createListGlobal(ctx: RegexContext): RegexService["listGlobal"] {
  return async ({ principal }: ListGlobalParams) => (await listGlobalScripts(ctx.db, principal.userId)).map(toRow);
}
