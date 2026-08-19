// HomeTile — the FRAME home draws around every contributed tile (home-section-spec §3.2/§6). The
// CONTRIBUTION supplies only its body, so all voices/paddings are identical across features by
// construction — a tile can neither draw its own band nor its own card.
//
// THE FRAME LOST ITS CARD (2026-08-16, program #102 — the Hearth Room build, owner-picked variant C).
// Every tile used to be a `form`-tier island: seven boxes on the landing page, all the same weight, in
// one auto-fit grid. Chrome diet CD1 says a read-only grouping gets a kicker + a hairline rule and
// nothing else, and home was seven violations of it wearing one frame. The frame is now that kicker
// band, and the ONE elevated island left on the page is the resume-room hero INSIDE chat's recents body
// (the mockup's `.fire`) — an interactive island you land on, which is exactly what CD1 reserves a box
// for. Measured on the approved mockup: 7 boxed tiles → 1.
//
// THE FRAME DISPATCHES ON `region` (the axis that replaced `span`): `masthead` gets NO chrome at all —
// it IS the page heading, and wrapping it in a band named by a kicker would name the same thing twice —
// while `hearth`/`shelf` get the band. A component per entry (never a hook call in a `.map()` body) so
// `useVisible` is a top-level hook over the door-frozen registry list — the `RailChromeEntry`/
// `TrailWidget` precedent. `false` ⇒ render NOTHING (no gap, no empty band).
//
// PER-TILE boundary, never one for the grid (§3.7): a slow or throwing tile must not blank the whole
// home, so each body mounts inside its own `QueryBoundary` with a shape-matched skeleton and its own retry.
//
// …and that per-tile skeleton is what made home the app's boot-CLS site (F14, measured 2026-08-02): a
// fixed 3-row skeleton is not the box the tile settles at, so when the reads landed the full-span
// "Recent chats" tile grew +189px and pushed every tile below it down the grid (CLS 0.0913 at 1440x900 on
// a 6-chat dev DB; 0.24 on the side-eye's fuller one). The settled box is DATA-dependent (N recents, N
// quick-picks), so it cannot be reserved by a static height without padding short tiles with dead space —
// the honest reservation is the one this device MEASURED last time: `TileBody` remembers each tile's
// settled height (`#state` home-tile-box-store, localStorage) and `TileFallback` reserves exactly that
// while the read is in flight.
//
// …AND THE FIRST-EVER BOOT IS NOT "NOTHING TO RESERVE" (#92, measured 2026-08-16). This header used to
// end "first-ever boot reserves nothing (there is nothing honest to reserve)". That was right about a
// static HEIGHT and wrong about the tile's own DATA CONTRACT, and it left the whole grid shifting for
// every device with an empty box memory — a new profile, cleared storage, and every fresh Playwright
// profile, which is why the harness kept measuring it. Live stack at HEAD 7462c165c, home alone: CLS
// 0.1338 over the 0.1 budget in 3/3 runs, ONE entry, attributed `chat.recents` growing 233px → 541px and
// pushing `chat.quickPicks`/`chat.tempChat` down 308px. The IDENTICAL drive with the box memory
// pre-seeded scored 0.0002 with zero shifts — the mechanism was never broken, only its first-boot arm
// was empty. So a tile now DECLARES `skeletonRows` (the row count its own query asks for) and the frame
// turns that into a box through the same live pointer-conditional pitch the measured arm uses. The
// MEASURED box still wins wherever it exists; the declaration is only what boot one has. The hearth
// build re-derived every declaration against its new body — a hero + five dense rows is not the same box
// as eight equal rows, and a stale declaration is a reservation that lies in the other direction.
//
// The DOORWAY (`HomeDoorway`, homed here beside the frame but rendered by HomeSurface, which partitions
// the registry — this frame only ever sees LIVE tiles) is not a fake feature: reduced weight, a DASHED rule, a muted glyph,
// the teaser in the gloss voice, the state line as a FOOTNOTE-scale mono line — and NO interactive
// element at all (no button, no skeleton, no spinner). `empty-states-are-load-bearing`: omitting the tile
// would say "this product has no companion"; a fake-loading tile would lie. It has NO band of its own
// and no `Dormant` badge any more: HomeSurface collects every declared doorway under ONE "Not yet"
// kicker (the mockup's right-rail move), so the group's own name says what the per-tile badge used to,
// once instead of N times.
//
// A11y: a banded tile is a `region` NAMED by its own real `h2`, so home's blocks are navigable landmarks
// with a heading each — and a tile's own trailing action ("All chats →") inherits that name instead of
// standing alone as an unattributed arrow (side-eye F3/F4). Both come from THIS frame, so every
// contributed tile gets them by construction. The masthead is deliberately NOT a landmark: it is the
// page's `h1`, which is a better handle than a region wrapped round it.

import { Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { Heading, Text } from "@orb/ui/text";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, skeletonRowCountFor } from "#data";

import type { DormantDoorway, HomeTileContribution } from "#state";
import { rememberSurfaceBox, useSurfaceBox } from "#state";

/** The frame's fallback row count for a tile that declares no `skeletonRows` — what shipped before. */
const TILE_SKELETON_ROWS = 3;

/** The tile's KICKER BAND — the CD1 replacement for a card header: the tile's name in the `kicker` voice
 *  on a real heading, a hairline rule running to the trailing slot, and the ONE trailing action. The rule
 *  is the `Separator` PRIMITIVE (the `<Section kicker>` anatomy), never a hand-styled edge, so home's
 *  bands and every other surface's band are one thing.
 *
 *  NO GLYPH (side-eye 2026-08-16 F11). The band used to lead with `tile.icon`, which put a glyph on the
 *  five framed tiles and none on the two `<Section kicker>` bands beside them — so the H2/H3 split read as
 *  a decorative class difference rather than as structure, on a surface where the ratified kicker anatomy
 *  (density-pass §2.3) has no glyph and the approved mock draws none. `icon` is still the tile's own
 *  identity for the doorway arm (where the mock DOES draw one) and for any registry surface that lists a
 *  tile by glyph; it simply paints nothing in the band. */
function TileBand({
  tile,
  trailing,
  headingId,
}: {
  readonly tile: HomeTileContribution;
  readonly trailing: ReactNode;
  readonly headingId: string;
}): ReactElement {
  return (
    <Row align="center" gap="field">
      {/* The `kicker` VOICE on a real heading element (density-pass §2.3); `level` keeps the document
          outline (a styled div would leave home with one heading and six anonymous blocks). */}
      <Heading id={headingId} level={2} voice="kicker">
        {tile.title}
      </Heading>
      {/* DECORATIVE (rail re-pass N-3). The rule is the band's drawing, not its structure — the region is
          already named by the `h2` beside it — but `Separator` seals Base UI's real `role="separator"`, so
          seven bands put seven UNNAMED separator stops in the a11y tree of one screen (a home walk hit 10).
          `aria-hidden` on the primitive drops the stop and paints identically; the rule is never the only
          carrier of a boundary here, so nothing announced is lost. */}
      <Separator aria-hidden={true} className="flex-1" />
      {trailing}
    </Row>
  );
}

/** The DORMANT doorway — what this will be, and exactly what must land first. Zero controls, and no band
 *  of its own: HomeSurface groups every doorway under one "Not yet" kicker. The dashed LEFT rule is the
 *  mockup's `.doorway` treatment — the "not built yet" signal at a fraction of a dashed card's weight. */
export function HomeDoorway({ tile, doorway }: { readonly tile: HomeTileContribution; readonly doorway: DormantDoorway }): ReactElement {
  return (
    <Row align="start" className="border-border border-l border-dashed pl-row" data-home-tile={tile.id} gap="row">
      <Icon className="mt-tight shrink-0 text-muted-foreground" icon={tile.icon} size="sm" />
      <Stack className="min-w-0" gap="tight">
        <Text voice="label">{tile.title}</Text>
        {/* The `gloss` VOICE (mock `.dorm .teaser`: 11px, muted). The `label` step made the two DORMANT
            tiles the brightest prose on home — full-foreground text on the two things you cannot use
            (side-eye P1-2). The dashed rule + the group's "Not yet" name carry "not built yet"; the copy
            recedes. */}
        <Text voice="gloss">{doorway.teaser}</Text>
        {/* THE STATE LINE — what is still missing, in the user's own words (`DormantDoorway.reason`).
            It was a DEVELOPER CITATION behind an alpha, and both halves were defects (side-eye rail sweep
            P1-3, 2026-08-17): the copy read "waiting on: domain/buddy (not in the retro tree)" at a user,
            and `opacity-60` over the muted ink measured **3.68:1** rendered — under the 4.5 floor, and
            invisible to the design-audit's own contrast walker (it does not compose ancestor opacity).
            Same `gloss` step as the teaser above it — the scale has no step between micro and nothing — so
            the separation is carried by the MONO FACE alone now, which is the distinction that costs no
            contrast. No "waiting on:" prefix: the sentence says its own state. */}
        <Text className="font-mono" voice="gloss">
          {doorway.reason}
        </Text>
      </Stack>
    </Row>
  );
}

/** The tile's LOADING box (F14 boot CLS). The skeleton sits inside the height this tile SETTLED at on
 *  this device last time (`useSurfaceBox` — localStorage, read synchronously, so the value is already
 *  in the FIRST commit): the tile's box is then the same before and after its read lands, and the tiles
 *  below it in the column never move. No memory (a first-ever boot) ⇒ the tile's own DECLARED row count.
 *
 *  AND THE SKELETON FILLS THE BOX IT IS GIVEN (side-eye R-1). A fixed 3 rows inside a MEASURED box is a
 *  reservation that is honest about the height and dishonest about the content: the recents tile reserved
 *  349px and painted 160px of bars, so 189px of blank sat under three lonely lines for the duration of the
 *  read — the exact 189px the reservation had just stopped SHIFTING, converted into dead space — while the
 *  temp-chat tile reserved 110.89px and had its third bar clipped to a 2.9px hairline. `skeletonRowCountFor`
 *  inverts the skeleton's own layout to fit the box, so `overflow: clip` stops being load-bearing.
 *
 *  `declaredRows` is the tile's own first-boot claim (`HomeTileContribution.skeletonRows`). It sizes the
 *  box when this device has no memory, and stays the fill-count fallback for a box the metrics module
 *  cannot invert (no document to read the pitch from) — the two arms want the same number. */
function TileFallback({
  declaredRows,
  declaredBlock,
  reserved,
}: {
  readonly declaredRows: number;
  readonly declaredBlock: number | undefined;
  readonly reserved: number | null;
}): ReactElement {
  // THREE SOURCES, ONE MECHANISM (#177). The measured box wins (it is what THIS device saw last boot);
  // then the tile's declared px box, for a body whose settled height is a constant; then the row count,
  // whose ~48px pitch quantisation is what left a residual first-boot shift on the three tiles that had
  // a constant to declare (`HomeTileContribution.skeletonBlock` carries the measurements).
  const box = reserved ?? declaredBlock ?? null;
  const rows = box === null ? declaredRows : skeletonRowCountFor(box, declaredRows);
  const source = reserved === null ? "declared" : "measured";
  return (
    <Stack
      data-tile-reserved={box === null ? undefined : Math.round(box)}
      // WHICH source held the box open. Two sources now write the same attribute, and "this device has a
      // MEASURED box" is a different claim from "this tile declared a constant" — a first-boot assertion
      // that reads only `data-tile-reserved` would silently start passing for the wrong reason.
      data-tile-reserve-source={box === null ? undefined : source}
      style={box === null ? undefined : reserveStyle(box)}
    >
      <SkeletonRows count={rows} />
    </Stack>
  );
}

/** A measured px reservation — a runtime measurement, not a design value (no token exists for "the height
 *  N chat rows happened to occupy on this viewport"). EXACT (`blockSize`), not a floor: a remembered box
 *  SHORTER than the skeleton's natural height (the temp-chat tile: 168px settled vs a 217px 3-row
 *  skeleton) would otherwise still shrink when the read lands. The skeleton is decorative, so the
 *  overflowing rows clip rather than push the box. */
function reserveStyle(height: number): CSSProperties {
  return { blockSize: `${Math.round(height)}px`, overflow: "clip" };
}

/** Wraps a tile's SETTLED body and remembers the box it occupies, so the next boot's skeleton reserves
 *  it. Measured on mount — this component mounts only once the tile's read has resolved (it is the
 *  QueryBoundary's child), so the first measurement is already the settled geometry. */
function TileBody({ tileId, children }: { readonly tileId: string; readonly children: ReactNode }): ReactElement {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (el !== null) {
      rememberSurfaceBox(tileId, el.getBoundingClientRect().height);
    }
  }, [tileId]);
  return <Stack ref={bodyRef}>{children}</Stack>;
}

/** The tile's live body inside its own boundary + its own reservation. Shared by both framed regions and
 *  by the bandless masthead, so the CLS mechanism has ONE home rather than one per region. */
function TileContent({ tile, reserved }: { readonly tile: HomeTileContribution; readonly reserved: number | null }): ReactElement {
  return (
    <QueryBoundary
      fallback={<TileFallback declaredBlock={tile.skeletonBlock} declaredRows={tile.skeletonRows ?? TILE_SKELETON_ROWS} reserved={reserved} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label={tile.title.toLowerCase()} onRetry={retry} />}
    >
      <TileBody tileId={tile.id}>{typeof tile.body === "function" ? tile.body() : null}</TileBody>
    </QueryBoundary>
  );
}

export function HomeTile({ tile }: { readonly tile: HomeTileContribution }): ReactNode {
  const visible = tile.useVisible?.() ?? true;
  const headingId = useId();
  const reserved = useSurfaceBox(tile.id);
  if (!visible) {
    return null;
  }
  // NO DOORWAY ARM HERE (review 2026-08-17 F7). The frame used to re-check `tile.body` for the `{dormant}`
  // shape and render `HomeDoorway` itself — residue from before the doorways were GROUPED. HomeSurface
  // partitions the registry first (`live`/`doorways`) and renders every doorway through `HomeDoorway`
  // directly under the shared "Not yet" band, so every tile that reaches this frame is already live and the
  // branch was unreachable: a second home for a decision that has one. `HomeTile` has exactly one importer
  // (home-surface.tsx), which is what makes that provable rather than hopeful.
  // The MASTHEAD is bandless and landmark-less by design (see the header): its body renders the page's
  // own h1, which no wrapper can name better than itself.
  if (tile.region === "masthead") {
    return (
      <Stack data-home-tile={tile.id} gap="row">
        <TileContent reserved={reserved} tile={tile} />
      </Stack>
    );
  }
  return (
    <Stack aria-labelledby={headingId} data-home-tile={tile.id} gap="row" role="region">
      <TileBand headingId={headingId} tile={tile} trailing={tile.action} />
      <TileContent reserved={reserved} tile={tile} />
    </Stack>
  );
}
