// domain/settings/substrate/theme-views — the PURE row → view mapper for `themes` (zero I/O). The ONE
// home for the read seam's two load-bearing projections: (1) `override` is run through
// `themeOverrideSchema.catch({})` (lenient — a hand-corrupted blob degrades to the empty override, never
// throws mid-load; invariant 5), and (2) `isSeed` is derived from `ownerId === null` so the client
// identifies a seed row without the domain-internal sentinel ids (the `preset` `toPresetSummary` /
// `isSystemDefault` precedent). Verbs map through here instead of re-spelling the projection per verb.

import { themeOverrideSchema } from "@orb/contracts/theme";
import type { themes } from "@orb/db";
import type { ThemeView } from "../contract/views";

type ThemeRow = typeof themes.$inferSelect;

export function toThemeView(row: ThemeRow): ThemeView {
  return {
    id: row.id,
    name: row.name,
    override: themeOverrideSchema.catch({}).parse(row.override),
    css: row.css,
    isSeed: row.ownerId === null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
