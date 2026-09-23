// verb: removeTheme — delete an OWNED theme. Never a seed: `deleteOwnedTheme` scopes on `id + ownerId`,
// and a seed's `ownerId IS NULL` can never match a caller's id, so this 404s on a seed BY CONSTRUCTION
// (no special-cased "cannot remove a seed" guard to forget).

import { ThemeNotFoundError } from "../contract/errors.ts";
import type { RemoveThemeParams } from "../contract/params.ts";
import type { SettingsContext, SettingsService } from "../contract/service.ts";
import { deleteOwnedTheme } from "../persistence/theme-queries.ts";

const THEME_REMOVE = "theme.remove";
const THEME_ENTITY = "theme";

export function createRemoveTheme(ctx: SettingsContext): Pick<SettingsService, "removeTheme"> {
  async function removeTheme(params: RemoveThemeParams): Promise<void> {
    const ownerId = params.principal.userId;
    const removed = await deleteOwnedTheme(ctx.db, params.id, ownerId);
    if (!removed) {
      throw new ThemeNotFoundError(params.id);
    }
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: THEME_REMOVE,
        entityType: THEME_ENTITY,
        entityId: params.id,
      },
      ctx.now(),
    );
    ctx.emitUserEvent(ownerId, { type: "themesChanged", themeId: params.id });
  }
  return { removeTheme };
}
