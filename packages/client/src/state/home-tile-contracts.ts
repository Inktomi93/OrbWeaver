// Contract home for the HOME-TILE contributor seam (home-section-spec §3.1, owner decision H10) — the
// shapes home and every tile-raising feature both need without either importing the other.
//
// IT MOVED FROM `lib/` (tier 4) TO `state/` — under H10's OWN test, not against it. H10 put it in tier 4
// "because it binds no state-owned vocabulary (`ReactNode` + `LucideIcon` only)" and ruled, in the same
// breath: "if a tile ever needs `SectionId` in its own contract, it moves to `state/` under the same test
// that moved `SettingsSectionContribution` there". `sectionId` is that day (side-eye 2026-08-08 P2-c): a
// tile can now declare the section whose jump row it SUBSUMES, which is `SectionId`, which is
// state-owned vocabulary. The seam, the entry point and every consumer's import shape are otherwise
// unchanged — `#lib` became `#state`.

import type { LucideIcon } from "@orb/ui/icons";
import type { ReactNode } from "react";
import type { SectionId } from "./shell-store.ts";

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
  /** The section whose JUMP ROW this tile subsumes — declared only by a tile that does that row's entire
   *  job (the section's name, its glyph, its live contents and a door into it), never by a tile that merely
   *  reads a section's data. Home's jump grid drops the row while such a tile is registered, so one
   *  destination is not two doors ten pixels apart (side-eye 2026-08-08 P2-c). Absent ⇒ the section keeps
   *  its jump row, which is the right default: most tiles are DATA surfaces, not navigation.
   *
   *  LATENT INCOMPATIBILITY: the jump grid computes its claims off the raw door registration and does NOT
   *  consult `useVisible` — so a tile that pairs `sectionId` with a sometimes-false `useVisible` would drop
   *  the jump row PERMANENTLY while its own tile renders nothing on the ticks `useVisible` reads false,
   *  orphaning the section from Home with no door left to it at all. No claimer does this today (every
   *  `sectionId` tile is unconditionally visible); a future one MUST resolve this before pairing the two. */
  readonly sectionId?: SectionId;
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
