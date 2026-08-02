// verb: listForPreset — the scripts attached to an owned preset, in execution order. A read: no audit.
// Owner-filtered on BOTH sides, so this can never enumerate a foreign preset's attachments.

import type { RegexContext } from "../../context";
import type { ListForPresetParams } from "../../contract/params";
import type { RegexService } from "../../contract/service";
import { ensurePresetOwned } from "../../persistence/ownership";
import { listPresetScripts, toRow } from "../../persistence/queries";

export function createListForPreset(ctx: RegexContext): RegexService["listForPreset"] {
  return async ({ principal, presetId }: ListForPresetParams) => {
    await ensurePresetOwned(ctx.db, principal.userId, presetId);
    return (await listPresetScripts(ctx.db, principal.userId, presetId)).map(toRow);
  };
}
