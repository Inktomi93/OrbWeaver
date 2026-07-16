// verb: updateTheme — patch an OWNED theme. Never a seed: `updateOwnedTheme` scopes on `id + ownerId`, and
// a seed's `ownerId IS NULL` can never match a caller's id, so this 404s on a seed BY CONSTRUCTION (no
// "cannot edit a seed" guard to forget — themes-design.md §2.1). Runs the same write-boundary validation
// as `createTheme` for any field actually present.

import type { ThemeOverride, UpdateThemeInput } from "@orb/contracts/theme";
import { themeOverrideSchema } from "@orb/contracts/theme";
import { validateThemeCss } from "@orb/kit/css-validate";
import { DomainConflictError, DomainOperationError } from "@orb/kit/errors";
import { SETTINGS_OP_CODES, ThemeNotFoundError } from "../contract/errors";
import type { UpdateThemeParams } from "../contract/params";
import type { SettingsContext, SettingsService } from "../contract/service";
import type { ThemeView } from "../contract/views";
import { isThemeNameConflict, updateOwnedTheme } from "../persistence/theme-queries";
import { toThemeView } from "../substrate/theme-views";

const THEME_UPDATE = "theme.update";
const THEME_ENTITY = "theme";

/** Validate the present fields + build the patch (only present keys are written; `updatedAt` always). */
function buildThemePatch(
  input: UpdateThemeInput,
  now: number,
): {
  name?: string;
  override?: ThemeOverride;
  css?: string | null;
  updatedAt: number;
} {
  const override = input.override === undefined ? undefined : themeOverrideSchema.parse(input.override);
  if (input.css !== undefined && input.css !== null) {
    const { errors } = validateThemeCss(input.css);
    if (errors.length > 0) {
      throw new DomainOperationError(SETTINGS_OP_CODES.unsafeCss, errors.join("; "));
    }
  }
  return {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(override === undefined ? {} : { override }),
    ...(input.css === undefined ? {} : { css: input.css }),
    updatedAt: now,
  };
}

export function createUpdateTheme(ctx: SettingsContext): Pick<SettingsService, "updateTheme"> {
  async function updateTheme(params: UpdateThemeParams): Promise<ThemeView> {
    const ownerId = params.principal.userId;
    const { input } = params;
    const at = ctx.now();
    const patch = buildThemePatch(input, at);

    let row: Awaited<ReturnType<typeof updateOwnedTheme>>;
    try {
      row = await updateOwnedTheme(ctx.db, params.id, ownerId, patch);
    } catch (err) {
      if (isThemeNameConflict(err)) {
        const dup = new DomainConflictError(`a theme named "${input.name}" already exists`);
        dup.cause = err;
        throw dup;
      }
      throw err;
    }
    if (row === undefined) {
      throw new ThemeNotFoundError(params.id);
    }

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: THEME_UPDATE,
        entityType: THEME_ENTITY,
        entityId: params.id,
        metadata: { fields: Object.keys(input) },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "themesChanged", themeId: params.id });
    return toThemeView(row);
  }
  return { updateTheme };
}
