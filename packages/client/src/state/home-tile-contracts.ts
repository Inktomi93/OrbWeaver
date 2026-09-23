// Contract home for the HOME-TILE contributor seam — the
// shapes home and every tile-raising feature both need without either importing the other.
//
// IT MOVED FROM `lib/` (tier 4) TO `state/` — under H10's OWN test, not against it. H10 put it in tier 4
// "because it binds no state-owned vocabulary (`ReactNode` + `LucideIcon` only)" and ruled, in the same
// breath: "if a tile ever needs `SectionId` in its own contract, it moves to `state/` under the same test
// that moved `ConfigSectionContribution` there". `sectionId` is that day (side-eye 2026-08-08 P2-c): a
// tile can now declare the section whose jump row it SUBSUMES, which is `SectionId`, which is
// state-owned vocabulary. The seam, the entry point and every consumer's import shape are otherwise
// unchanged — `#lib` became `#state`.

import type { LucideIcon } from "@orb/ui/icons";
import type { ReactNode } from "react";
import type { SectionId } from "./section-ids.ts";

/** WHERE on home a tile lands — a CLOSED axis (§5.5: one importable union), so an unlisted region is
 *  unspellable. It REPLACED `HOME_TILE_SPANS` ("half" | "full") on 2026-08-16 with the hearth build
 *  (program #102): home stopped being an auto-fit grid of equal islands, so "how many columns does this
 *  tile claim" no longer names anything on the surface. The three regions are the surface's own anatomy:
 *
 *  - `masthead` — the full-width opening statement above the split. The frame gives it NO chrome at all
 *    (no kicker band, no region landmark): it IS the page heading, and naming it twice would double it.
 *  - `hearth` — the dominant lead column: the rooms you came back for, and the doors out of them.
 *  - `shelf` — the companion rail: what you reach into beside the hearth.
 *
 *  DEFAULTS TO `shelf` on purpose. A tile that says nothing about where it belongs is a data surface, and
 *  promoting a new one into the hearth by default would quietly demote the thing the hearth exists for. */
export const HOME_TILE_REGIONS = ["masthead", "hearth", "shelf"] as const;
export type HomeTileRegion = (typeof HOME_TILE_REGIONS)[number];

/** What a DORMANT home tile must say to earn its pixels. A doorway is not an
 *  IOU: it names what must land first AND what the thing will be, and it never fakes a spinner, a
 *  skeleton, or a disabled button. */
export interface DormantDoorway {
  /** WHAT IS STILL MISSING, IN THE USER'S OWN TERMS — non-empty, and it still names what must land
   *  first (the `content:{planned}` discipline one level down), just spelled for the person reading it.
   *
   *  IT IS NOT A REPO CITATION ANY MORE (side-eye rail sweep P1-3, 2026-08-17). This line shipped as the
   *  tracked developer reason rendered verbatim at a user — "domain/buddy (not in the retro tree)",
   *  "automation.stream through the SSE multiplex (stage 4 — a sanctioned doorway, not a stub)" — on the
   *  product's landing surface, in the two places a first-time visitor is most likely to look for what is
   *  coming. A doorway's whole job is to be honest about an absence; naming a module path is honest to the
   *  wrong audience. Say what they get and roughly when, and say it warm and direct (the ratified product
   *  voice). Rendered as the tile's quiet mono line under the teaser. */
  readonly reason: string;
  /** The one-line user-facing promise the tile renders. Never "coming soon" with no subject. */
  readonly teaser: string;
}

/** A feature-contributed HOME tile — the SIXTH application of the contributor
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
  /** @defaultValue "shelf" */
  readonly region?: HomeTileRegion;
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
  /** How many skeleton rows this tile's LOADING box holds on a device that has never seen it settle —
   *  the FIRST-EVER-boot arm of the F14 reservation (`surface-box-store`: from the second boot on, the
   *  measured box wins and this is only the fill-count fallback).
   *
   *  IT IS THE TILE'S OWN PAGE LIMIT, NOT A PIXEL GUESS. The store's header rules out a static reservation
   *  because the settled box is DATA-dependent — true of a HEIGHT, and the reason this is a ROW COUNT: the
   *  tile declares the same `limit` its own query asks for (8 recents, 6 quick-picks, 4 documents + the
   *  health line), and the frame turns that into a box through the live pointer-conditional pitch
   *  (`skeleton-row-metrics.ts`), so the same declaration is right on a desktop and on a tablet. A tile
   *  whose body is FIXED (a button + a gloss) declares the rows it is, which is not a guess either.
   *
   *  Absent ⇒ the frame's 3-row default, i.e. exactly the behaviour that shipped before. */
  readonly skeletonRows?: number;
  /** The tile's settled BLOCK SIZE in CSS px, for a body whose settled height does NOT depend on how much
   *  data comes back — declared only where that is true, and measured, never estimated (#177).
   *
   *  WHY A SECOND FIELD RATHER THAN A BETTER ROW COUNT. `skeletonRows` reserves through the skeleton's own
   *  PITCH (a 40px bar + an 8px gap), so the boxes it can express are quantised to ~48px steps and the
   *  residual is up to half a row of first-boot shift on every device with no memory. Measured on the live
   *  home at 1280×900 (a tRPC hold so the loading state is observable rather than a 200ms flash): the
   *  masthead reserved 64px and settled at 57.25 (−6.75, which moved the WHOLE page up, every tile in both
   *  columns), quick-picks reserved 304 and settled at 320.5 (+16.5, pushing temp-chat/databank/the doorway
   *  group down), temp-chat reserved 112 and settled at 94.64 (−17.36). Those three are exactly the tiles
   *  whose settled height is a CONSTANT — a heading pair, a fixed-cell grid at its primary mount, a button
   *  over one gloss line — so the honest reservation is the number itself, not the nearest multiple of a
   *  row. The same field would be a LIE on `chat.recents`/`chat.alsoOpen`/`databank.documents`, whose box
   *  is N rows of whatever came back; those keep `skeletonRows` and keep their first-boot residual.
   *
   *  It rides the SAME exact-reservation seam the MEASURED box uses (`home-tile.tsx` `reserveStyle` —
   *  `blockSize` + `overflow: clip`, with `skeletonRowCountFor` filling it), so there is one reservation
   *  mechanism with three sources in priority order: measured (this device, last boot) → declared px →
   *  declared rows. Wins over `skeletonRows`, loses to the measured box. */
  readonly skeletonBlock?: number;
  /** A real body, or the DECLARED-DORMANT arm — the structural twin of `SectionDefinition.content`'s
   *  `{planned}` (lockdown O1): the marker and the body are the SAME field, so building the tile forces
   *  deleting the marker in the same edit. A stale doorway is unrepresentable, not merely detected. */
  readonly body: (() => ReactNode) | { readonly dormant: DormantDoorway };
}
