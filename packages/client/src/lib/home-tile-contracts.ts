// Tier-4 contract home for the HOME-TILE contributor seam (home-section-spec §3.1, owner decision H10) —
// the shapes home and every tile-raising feature both need without either importing the other. It binds NO
// state-owned vocabulary (`ReactNode` + `LucideIcon` only), so it is tier 4, not `state/` — the
// `CharacterDetailContribution` precedent. It is its OWN file rather than a block inside
// `registry-contracts.ts` purely because that file sits at the 450-line component-size cap; the tier, the
// import surface, and the entry point are identical (every consumer imports from `#lib`).

import type { LucideIcon } from "@orb/ui/icons";
import type { ReactNode } from "react";

/** How much of the home tile grid one tile claims — a CLOSED axis (§5.5: one importable union), so an
 *  unlisted span is unspellable. `"half"` = one grid column; `"full"` = the whole row. */
export const HOME_TILE_SPANS = ["half", "full"] as const;
export type HomeTileSpan = (typeof HOME_TILE_SPANS)[number];

/** What a DORMANT home tile must say to earn its pixels (home-section-spec §3.5). A doorway is not an
 *  IOU: it names what must land first AND what the thing will be, and it never fakes a spinner, a
 *  skeleton, or a disabled button. */
export interface DormantDoorway {
  /** The tracked reason — non-empty, names what must land first (gate-checked, the `content:{planned}`
   *  discipline one level down). Rendered as the tile's quiet mono line ("waiting on: …"). */
  readonly reason: string;
  /** The one-line user-facing promise the tile renders. Never "coming soon" with no subject. */
  readonly teaser: string;
}

/** A feature-contributed HOME tile (home-section-spec §3.1) — the SIXTH application of the contributor
 *  primitive. HOME renders the FRAME (kicker header + icon + one optional trailing action + the card +
 *  the per-tile QueryBoundary); the contribution supplies only its own body. A feature raises a tile,
 *  home skims it — home imports ZERO features (`client-features-no-cross`), so "put some future stuff on
 *  the home page" is forever ONE co-located file plus ONE array member at the door (G8). */
export interface HomeTileContribution {
  /** Registry key + React key (a duplicate THROWS at door construction). */
  readonly id: string;
  /** The tile's name, rendered by HOME in the `kicker` voice — a tile never draws its own band. */
  readonly title: string;
  readonly icon: LucideIcon;
  /** Canonical `(order, id)` sort — the `assembleChrome` ordering precedent, applied by `orderHomeTiles`. */
  readonly order?: number;
  /** @defaultValue "half" */
  readonly span?: HomeTileSpan;
  /** The tile's ONE trailing affordance ("All characters →"). Never a second primary (CD3), and never
   *  supplied alongside the DORMANT arm (a doorway has no controls). */
  readonly action?: ReactNode;
  /** Live CAPABILITY gate, called UNCONDITIONALLY over the door-frozen list (the `ChromeEntry.useVisible`
   *  contract) by the tile's own component, never in a map body. `false` ⇒ render NOTHING (no gap, no
   *  empty card). NOT for gating a BUILD fact — that is the `{dormant}` body arm (H7). */
  readonly useVisible?: () => boolean;
  /** A real body, or the DECLARED-DORMANT arm — the structural twin of `SectionDefinition.content`'s
   *  `{planned}` (lockdown O1): the marker and the body are the SAME field, so building the tile forces
   *  deleting the marker in the same edit. A stale doorway is unrepresentable, not merely detected. */
  readonly body: (() => ReactNode) | { readonly dormant: DormantDoorway };
}
