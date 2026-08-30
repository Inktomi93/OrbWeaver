// config-nav-model — host-presentation residue: the LIST's shelf labels and the kicker ids the shelves'
// `aria-labelledby` wiring points at. The group vocabulary itself (`CONFIG_GROUP_IDS`, `CONFIG_SHELVES`,
// `ConfigGroupDefinition`, `configAnchorId`) homes in `#state` (M6.1 ruling, client-architecture-lockdown
// §5 rule 5 / §8) — this file keeps only what the config HOST presents.

import type { ConfigShelf } from "#state";

/** The human label for each shelf's micro-caps kicker. "User", not "You" (owner correction 2026-08-30):
 *  the phone's "You" sheet is a different surface. */
export const CONFIG_SHELF_LABELS: Record<ConfigShelf, string> = {
  user: "User",
  app: "App",
  collections: "Collections",
  extensions: "Extensions",
};

/** The DOM id of a shelf's kicker — the one home for both ends of the shelf's `aria-labelledby` wiring
 *  (side-eye 2026-08-16 ARIA rider: bare-paragraph kickers made the nav one flat run of rows). Derived from
 *  the shelf id rather than `useId` because the config LIST is a SINGLETON surface: a stable, readable id is
 *  what a `--aria`/CT receipt can name. */
export function configShelfLabelId(shelf: ConfigShelf): string {
  return `config-shelf-${shelf}`;
}
