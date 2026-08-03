// verb: promoteTheme — the PROMOTE door (TD door 1): a character card's authored look becomes a real,
// owned row in the picker library. The `promoteActor` class (D121-F): a DOMAIN verb, not lifecycle chrome
// — the band/kebab anatomy (D121-D) governs Import/Export serialization doors, not in-domain verbs.
//
// COPY, never a ref. Four independent reasons, each sufficient: the card override IS values (no FK to
// `themes` exists anywhere); the roster wire threads those values to every member, who cannot read the
// host's single-owned theme rows at all; deleting a theme must never strip N cards; and a ref would dangle
// on any future card export. Post-promote edits deliberately sync in NEITHER direction.
//
// The payload is the CARD-EMBEDDABLE subset only. A promoted theme must not smuggle a viewer-force the card
// itself could not exert: `density` is live on a theme the viewer SELECTED, so copying a card's stale
// `density` would silently pin the promoting user's shell density from a room they were only visiting. No
// `css` either — cards have no CSS tier. Fidelity is exact by construction: the result is an OWNED row, so
// it renders through the same `clampThemeTokens` derivation the room takeover already ran on these values.
//
// Name policy: MINT-TIME de-collision (`freeThemeName`), because this door supplies a name the user never
// typed (the character's). `createTheme`'s explicit-name editor path keeps the typed conflict — two doors,
// two input modes. The constraint race still classifies to `DomainConflictError`, never a 500.
// Never writes `ownerId: null`: promote can never mint a seed (isSeed derives from a NULL owner, D71).

import { cardEmbeddableSubset, themeOverrideSchema } from "@orb/contracts/theme";
import { DomainConflictError } from "@orb/kit/errors";
import type { PromoteThemeParams } from "../contract/params.ts";
import type { SettingsContext, SettingsService } from "../contract/service.ts";
import type { ThemeView } from "../contract/views.ts";
import { insertTheme, isThemeNameConflict, listOwnedThemeNames } from "../persistence/theme-queries.ts";
import { freeThemeName } from "../substrate/names.ts";
import { toThemeView } from "../substrate/theme-views.ts";

const THEME_PROMOTE = "theme.promote";
const THEME_ENTITY = "theme";

export function createPromoteTheme(ctx: SettingsContext): Pick<SettingsService, "promoteTheme"> {
  async function promoteTheme(params: PromoteThemeParams): Promise<ThemeView> {
    const ownerId = params.principal.userId;
    const { input } = params;
    // The same boundary clamp `createTheme` runs (the caller could call that verb with these values
    // anyway), THEN the partition projection — the clamp decides what is SAFE, the subset decides what a
    // card is allowed to have carried in the first place.
    const override = cardEmbeddableSubset(themeOverrideSchema.parse(input.override));

    const taken = new Set(await listOwnedThemeNames(ctx.db, ownerId));
    const name = freeThemeName(input.name, taken);

    const id = ctx.newThemeId();
    const at = ctx.now();
    const row = {
      id,
      ownerId,
      name,
      override,
      css: null,
      createdAt: at,
      updatedAt: at,
    };
    try {
      await insertTheme(ctx.db, row);
    } catch (err) {
      // A concurrent mint racing the same free name surfaces as a typed conflict, never a 500.
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
        action: THEME_PROMOTE,
        entityType: THEME_ENTITY,
        entityId: id,
        metadata: { name },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "themesChanged", themeId: id });
    return toThemeView(row);
  }
  return { promoteTheme };
}
