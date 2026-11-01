// verb: getTheme — one theme readable by this owner (their own OR any seed). Read-only; no audit.

import type { Theme } from "@orb/contracts/theme";
import { ThemeNotFoundError } from "../contract/errors.ts";
import type { GetThemeParams } from "../contract/params.ts";
import type { SettingsContext, SettingsService } from "../contract/service.ts";
import { readableTheme } from "../persistence/theme-queries.ts";
import { toThemeView } from "../substrate/theme-views.ts";

export function createGetTheme(ctx: SettingsContext): Pick<SettingsService, "getTheme"> {
  async function getTheme(params: GetThemeParams): Promise<Theme> {
    const row = await readableTheme(ctx.db, params.principal.userId, params.id);
    if (row === undefined) {
      throw new ThemeNotFoundError(params.id);
    }
    return toThemeView(row);
  }
  return { getTheme };
}
