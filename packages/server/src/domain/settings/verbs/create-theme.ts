// verb: createTheme — write a new OWNED theme from scratch (the §13.4 editor's "new blank theme" path,
// alongside `duplicateTheme`). Runs `themeOverrideSchema.parse` + the shared css-validator at the write
// boundary; a taken `(ownerId, name)` is TOCTOU-safe (insert optimistically, classify
// the constraint violation — the `tag.create` precedent), never a phantom pre-SELECT.

import { themeOverrideSchema } from "@orb/contracts/theme";
import { validateThemeCss } from "@orb/kit/css-validate";
import { DomainConflictError, DomainOperationError } from "@orb/kit/errors";
import { SETTINGS_OP_CODES } from "../contract/errors.ts";
import type { CreateThemeParams } from "../contract/params.ts";
import type { SettingsContext, SettingsService } from "../contract/service.ts";
import type { ThemeView } from "../contract/views.ts";
import { insertTheme, isThemeNameConflict } from "../persistence/theme-queries.ts";
import { toThemeView } from "../substrate/theme-views.ts";

const THEME_CREATE = "theme.create";
const THEME_ENTITY = "theme";

export function createCreateTheme(ctx: SettingsContext): Pick<SettingsService, "createTheme"> {
  async function createTheme(params: CreateThemeParams): Promise<ThemeView> {
    const ownerId = params.principal.userId;
    const { input } = params;
    const override = themeOverrideSchema.parse(input.override);
    const css = input.css ?? null;
    if (css !== null) {
      const { errors } = validateThemeCss(css);
      if (errors.length > 0) {
        throw new DomainOperationError(SETTINGS_OP_CODES.unsafeCss, errors.join("; "));
      }
    }
    const id = ctx.newThemeId();
    const at = ctx.now();
    const row = {
      id,
      ownerId,
      name: input.name,
      override,
      css,
      createdAt: at,
      updatedAt: at,
    };
    try {
      await insertTheme(ctx.db, row);
    } catch (err) {
      if (isThemeNameConflict(err)) {
        const dup = new DomainConflictError(`a theme named "${input.name}" already exists`);
        dup.cause = err;
        throw dup;
      }
      throw err;
    }
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: THEME_CREATE,
        entityType: THEME_ENTITY,
        entityId: id,
        metadata: { name: input.name },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "themesChanged", themeId: id });
    return toThemeView(row);
  }
  return { createTheme };
}
