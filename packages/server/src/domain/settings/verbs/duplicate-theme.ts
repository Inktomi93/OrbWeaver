// verb: duplicateTheme — the §12.1 "duplicate-to-customize" verb. Source = any READABLE row (own or
// seed); the result is always a NEW owned row (fresh id, deep-copied `override`/`css`, name defaulted to
// `"<source> copy"` and de-duped against the caller's own names by a numeric suffix under the
// `unique(ownerId, name)` index). Seeds are never edited in place — customization is always
// copy-then-edit (themes-design.md §4 — explicitly REJECTS a copy-on-write-on-edit dance).

import { DomainConflictError } from "@orb/kit/errors";
import { ThemeNotFoundError } from "../contract/errors";
import type { DuplicateThemeParams } from "../contract/params";
import type { SettingsContext, SettingsService } from "../contract/service";
import type { ThemeView } from "../contract/views";
import {
  insertTheme,
  isThemeNameConflict,
  listOwnedThemeNames,
  readableTheme,
} from "../persistence/theme-queries";
import { toThemeView } from "../substrate/theme-views";

const THEME_DUPLICATE = "theme.duplicate";
const THEME_ENTITY = "theme";
const COPY_SUFFIX = " copy";
const FIRST_INCREMENT = 2;

/** First free `<base>[ N]` not already used by the owner (the character `duplicate` handle-suffix
 *  precedent, adapted to a space-separated numeric suffix per themes-design's `"<source> copy"`). */
function freeThemeName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  let n = FIRST_INCREMENT;
  while (taken.has(`${base} ${n}`)) {
    n += 1;
  }
  return `${base} ${n}`;
}

export function createDuplicateTheme(
  ctx: SettingsContext,
): Pick<SettingsService, "duplicateTheme"> {
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
      // The free-name computation above is TOCTOU-safe against everything EXCEPT a concurrent create/
      // duplicate racing the same free name — still surfaces as a typed conflict, never a 500.
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
    return toThemeView(row);
  }
  return { duplicateTheme };
}
