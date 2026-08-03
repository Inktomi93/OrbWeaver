// verb: listForPreset — the scripts attached to an owned preset, in execution order. A read: no audit.
// Owner-filtered on BOTH sides, so this can never enumerate a foreign preset's attachments.

import type { RegexContext } from "../../context.ts";
import type { ListForPresetParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { ensurePresetOwned } from "../../persistence/ownership.ts";
import { listPresetScripts, toRow } from "../../persistence/queries.ts";

export function createListForPreset(ctx: RegexContext): RegexService["listForPreset"] {
  return async ({ principal, presetId }: ListForPresetParams) => {
    await ensurePresetOwned(ctx.db, principal.userId, presetId);
    return (await listPresetScripts(ctx.db, principal.userId, presetId)).map(toRow);
  };
}
