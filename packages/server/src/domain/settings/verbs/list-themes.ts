// verb: listThemes — the caller's own themes PLUS every seed palette, as views. Read-only; no audit.

import type { ListThemesParams } from "../contract/params.ts";
import type { SettingsContext, SettingsService } from "../contract/service.ts";
import type { ThemeView } from "../contract/views.ts";
import { listReadableThemes } from "../persistence/theme-queries.ts";
import { toThemeView } from "../substrate/theme-views.ts";

export function createListThemes(ctx: SettingsContext): Pick<SettingsService, "listThemes"> {
  async function listThemes(params: ListThemesParams): Promise<ThemeView[]> {
    const rows = await listReadableThemes(ctx.db, params.principal.userId);
    return rows.map(toThemeView);
  }
  return { listThemes };
}
