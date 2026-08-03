// verb: listScriptUsage — the REVERSE rosters for ONE owned script: which presets, characters and rooms
// attach it. The library context pane's "where does this already run", and the read the pane shipped
// WITHOUT (it carried an honest sentence pointing at the three carriers instead, because deriving the
// answer from the forward `listFor*` reads would have meant an N-query fan-out over the whole library).
// A read: no audit, no emit.
//
// THE GATE IS `getScript`'S, EXACTLY: a foreign/absent script collapses to `RegexNotFoundError` before any
// junction is touched, so this can never be used to probe someone else's shelf. The rosters are then
// filtered a SECOND time on their own side — the preset/character joins carry `ownerId`, and the rooms go
// through chat's injected `resolveVisibleRooms`. Both halves matter: the script gate alone would still let
// an owner see the NAME of a room they were kicked from, since the room's attachment row outlives their seat.
//
// GLOBAL IS NOT A ROSTER. `global_regex_scripts` PKs on the script id — a script is global or it is not —
// so the pane reads that off `listGlobal` and renders a switch. Adding a one-element "rosters" arm for it
// would be a second home for the same boolean.

import type { RegexContext } from "../../context.ts";
import { RegexNotFoundError } from "../../contract/errors.ts";
import type { ListScriptUsageParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { listCharactersAttaching, listChatIdsAttaching, listPresetsAttaching, loadOwnedScript } from "../../persistence/queries.ts";

export function createListScriptUsage(ctx: RegexContext): RegexService["listScriptUsage"] {
  return async ({ principal, scriptId }: ListScriptUsageParams) => {
    const record = await loadOwnedScript(ctx.db, principal.userId, scriptId);
    if (record === undefined) {
      throw new RegexNotFoundError("regex_script", scriptId);
    }
    const [presets, characters, chatIds] = await Promise.all([
      listPresetsAttaching(ctx.db, principal.userId, scriptId),
      listCharactersAttaching(ctx.db, principal.userId, scriptId),
      listChatIdsAttaching(ctx.db, scriptId),
    ]);
    // Skip the injected op entirely when the junction holds nothing — a script attached to no room asks
    // chat no question, so the common case costs zero cross-domain calls.
    const rooms = chatIds.length === 0 ? [] : await ctx.resolveVisibleRooms(principal, chatIds);
    return { presets, characters, rooms };
  };
}
