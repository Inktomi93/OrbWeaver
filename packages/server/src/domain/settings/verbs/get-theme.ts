// verb: getTheme — one theme readable by this owner (their own OR any seed). Read-only; no audit.

import { ThemeNotFoundError } from "../contract/errors";
import type { GetThemeParams } from "../contract/params";
import type { SettingsContext, SettingsService } from "../contract/service";
import type { ThemeView } from "../contract/views";
import { readableTheme } from "../persistence/theme-queries";
import { toThemeView } from "../substrate/theme-views";

export function createGetTheme(ctx: SettingsContext): Pick<SettingsService, "getTheme"> {
  async function getTheme(params: GetThemeParams): Promise<ThemeView> {
    const row = await readableTheme(ctx.db, params.principal.userId, params.id);
    if (row === undefined) {
      throw new ThemeNotFoundError(params.id);
    }
    return toThemeView(row);
  }
  return { getTheme };
}
