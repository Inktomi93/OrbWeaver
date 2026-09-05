// domain/settings/substrate/theme-views — the PURE row → view mapper for `themes` (zero I/O). The ONE
// home for the read seam's three load-bearing projections: (1) `override` is run through
// `themeOverrideSchema.catch({})` (lenient — a hand-corrupted blob degrades to the empty override, never
// throws mid-load; invariant 5), (2) `isSeed` is derived from `ownerId === null` so the client
// identifies a seed row without the domain-internal sentinel ids (the `preset` `toPresetSummary` /
// `isSystemDefault` precedent), and (3) `isDefault` is derived from the default palette's sentinel id —
// SAME reason, one rung further: this file is the ONLY place outside the seeder that may know which
// sentinel is the default, and the flag is what the client reads instead (#1671; #1667 is what the client
// did before it had one — it compared the row's DISPLAY NAME to a mirrored literal). Verbs map through
// here instead of re-spelling the projection per verb, which is what makes the flag TOTAL over every
// writer: `listThemes`, `getTheme`, `createTheme`, `duplicateTheme`, `promoteTheme` and `updateTheme` all
// return `toThemeView(row)` and cannot omit it.

import { themeOverrideSchema } from "@orb/contracts/theme";
import type { themes } from "@orb/db";
import { THEME_HEARTH_ID } from "../constants.ts";
import type { ThemeView } from "../contract/views.ts";

type ThemeRow = typeof themes.$inferSelect;

export function toThemeView(row: ThemeRow): ThemeView {
  return {
    id: row.id,
    name: row.name,
    override: themeOverrideSchema.catch({}).parse(row.override),
    css: row.css,
    isSeed: row.ownerId === null,
    isDefault: row.id === THEME_HEARTH_ID,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
