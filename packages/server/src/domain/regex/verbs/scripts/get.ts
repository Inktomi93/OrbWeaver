// verb: getScript — one owned script. A read: no audit, no emit. A foreign/absent id is one answer.

import { RegexNotFoundError } from "#src/domain/regex/contract/errors.ts";
import type { GetScriptParams } from "#src/domain/regex/contract/params.ts";
import type { RegexContext, RegexService } from "#src/domain/regex/contract/service.ts";
import { loadOwnedScript, toRow } from "#src/domain/regex/persistence/queries.ts";

export function createGet(ctx: RegexContext): RegexService["getScript"] {
  return async ({ principal, scriptId }: GetScriptParams) => {
    const record = await loadOwnedScript(ctx.db, principal.userId, scriptId);
    if (record === undefined) {
      throw new RegexNotFoundError("regex_script", scriptId);
    }
    return toRow(record);
  };
}
