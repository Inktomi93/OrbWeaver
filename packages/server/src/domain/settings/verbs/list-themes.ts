// verb: listThemes — the caller's own themes PLUS every seed palette, as views. Read-only; no audit.

import type { ListThemesParams } from "../contract/params";
import type { SettingsContext, SettingsService } from "../contract/service";
import type { ThemeView } from "../contract/views";
import { listReadableThemes } from "../persistence/theme-queries";
import { toThemeView } from "../substrate/theme-views";

export function createListThemes(ctx: SettingsContext): Pick<SettingsService, "listThemes"> {
  async function listThemes(params: ListThemesParams): Promise<ThemeView[]> {
    const rows = await listReadableThemes(ctx.db, params.principal.userId);
    return rows.map(toThemeView);
  }
  return { listThemes };
}
