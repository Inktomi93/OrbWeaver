// The canonical HOME-TILE order — `order` ascending, then `id`. A TOTAL order, so the grid is
// deterministic regardless of the door's array order and stable when two tiles share an `order`. This is
// the `assembleChrome` ordering algebra one level down, homed here (not at the door) because the tile grid
// is this registry's ONE consumer — the order has one home either way, and a second assemble module for a
// single consumer would be the indirection the lockdown bans.

import type { HomeTileContribution } from "#lib";

export function orderHomeTiles(tiles: readonly HomeTileContribution[]): readonly HomeTileContribution[] {
  return tiles.toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
}
