// verb: listPresetOnlyScripts — the scripts attached to an owned preset and to no other junction, global included: what
// deleting that preset would leave attached to nothing. A read: no audit. Owner-filtered on both sides, as
// `list-for-preset.ts` is.

import type { ListForPresetParams } from "#src/domain/regex/contract/params.ts";
import type { RegexContext, RegexService } from "#src/domain/regex/contract/service.ts";
import { ensurePresetOwned } from "#src/domain/regex/persistence/ownership.ts";
import { listPresetOnlyScripts, toRow } from "#src/domain/regex/persistence/queries.ts";

export function createListPresetOnly(ctx: RegexContext): RegexService["listPresetOnlyScripts"] {
  return async ({ principal, presetId }: ListForPresetParams) => {
    await ensurePresetOwned(ctx.db, principal.userId, presetId);
    return (await listPresetOnlyScripts(ctx.db, principal.userId, presetId)).map(toRow);
  };
}
