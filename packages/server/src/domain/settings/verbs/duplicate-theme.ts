// verb: duplicateTheme — "duplicate-to-customize". Source = any readable row (own or seed); result is
// always a new owned row (fresh id, deep-copied override/css, name defaulted to "<source> copy" and
// de-duped by a numeric suffix). Seeds are never edited in place.

import { DomainConflictError } from "@orb/kit/errors";
import { ThemeNotFoundError } from "../contract/errors";
import type { DuplicateThemeParams } from "../contract/params";
import type { SettingsContext, SettingsService } from "../contract/service";
import type { ThemeView } from "../contract/views";
import { insertTheme, isThemeNameConflict, listOwnedThemeNames, readableTheme } from "../persistence/theme-queries";
import { freeThemeName } from "../substrate/names";
import { toThemeView } from "../substrate/theme-views";

const THEME_DUPLICATE = "theme.duplicate";
const THEME_ENTITY = "theme";
const COPY_SUFFIX = " copy";

export function createDuplicateTheme(ctx: SettingsContext): Pick<SettingsService, "duplicateTheme"> {
  async function duplicateTheme(params: DuplicateThemeParams): Promise<ThemeView> {
    const ownerId = params.principal.userId;
    const source = await readableTheme(ctx.db, ownerId, params.id);
    if (source === undefined) {
      throw new ThemeNotFoundError(params.id);
    }

    const taken = new Set(await listOwnedThemeNames(ctx.db, ownerId));
    const desired = params.name ?? `${source.name}${COPY_SUFFIX}`;
    const name = freeThemeName(desired, taken);

    const id = ctx.newThemeId();
    const at = ctx.now();
    const row = {
      id,
      ownerId,
      name,
      override: structuredClone(source.override),
      css: source.css,
      createdAt: at,
      updatedAt: at,
    };
    try {
      await insertTheme(ctx.db, row);
    } catch (err) {
      // A concurrent create/duplicate racing the same free name surfaces as a typed conflict, never a 500.
      if (isThemeNameConflict(err)) {
        const dup = new DomainConflictError(`a theme named "${name}" already exists`);
        dup.cause = err;
        throw dup;
      }
      throw err;
    }

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: THEME_DUPLICATE,
        entityType: THEME_ENTITY,
        entityId: id,
        metadata: { from: params.id, name },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "themesChanged", themeId: id });
    return toThemeView(row);
  }
  return { duplicateTheme };
}
