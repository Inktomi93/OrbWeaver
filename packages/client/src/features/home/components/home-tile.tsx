// HomeTile — the FRAME home draws around every contributed tile (home-section-spec §3.2/§6): a `form`-tier
// island (border + bg + rounded-card + p-block) whose header is the kicker voice + the tile's icon + its ONE
// optional trailing action. The CONTRIBUTION supplies only its body, so all six voices/paddings are
// identical across features by construction — a tile can neither draw its own band nor its own card.
//
// A component per entry (never a hook call in a `.map()` body) so `useVisible` is a top-level hook over the
// door-frozen registry list — the `RailChromeEntry`/`TrailWidget` precedent. `false` ⇒ render NOTHING (no
// gap, no empty card).
//
// PER-TILE boundary, never one for the grid (§3.7): a slow or throwing tile must not blank the whole home,
// so each body mounts inside its own `QueryBoundary` with a shape-matched skeleton and its own retry.
//
// …and that per-tile skeleton is what made home the app's boot-CLS site (F14, measured 2026-08-02): a
// fixed 3-row skeleton is not the box the tile settles at, so when the reads landed the full-span
// "Recent chats" tile grew +189px and pushed every tile below it down the grid (CLS 0.0913 at 1440x900 on
// a 6-chat dev DB; 0.24 on the side-eye's fuller one). The settled box is DATA-dependent (N recents, N
// quick-picks), so it cannot be reserved by a static height without padding short tiles with dead space —
// the honest reservation is the one this device MEASURED last time: `TileBody` remembers each tile's
// settled height (`#state` home-tile-box-store, localStorage) and `TileFallback` reserves exactly that
// while the read is in flight. First-ever boot reserves nothing (there is nothing honest to reserve).
//
// The DORMANT arm renders a DOORWAY, not a fake feature: reduced weight, a DASHED frame (the mock's
// `.tile.dormant`), a muted glyph, the teaser in the gloss voice, a `Dormant` badge, the tracked reason as
// a FOOTNOTE-scale mono line — and NO interactive element at all (no button, no skeleton, no spinner).
// `empty-states-are-load-bearing`: omitting the tile would say "this product has no companion"; a
// fake-loading tile would lie.
//
// A11y: the tile title is a real `h2` and the card is a `region` NAMED by it, so home's six tiles are six
// navigable landmarks with a heading each — and a tile's own trailing action ("All chats →") inherits that
// name instead of standing alone as an unattributed arrow (side-eye F3/F4). Both come from THIS frame, so
// every contributed tile gets them by construction.

import { Badge } from "@orb/ui/badge";
import { Card } from "@orb/ui/card";
import { Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, skeletonRowCountFor } from "#data";

import type { DormantDoorway, HomeTileContribution } from "#state";
import { rememberHomeTileBox, useHomeTileBox } from "#state";

const TILE_SKELETON_ROWS = 3;

/** The tile's kicker band — icon + title in the `kicker` voice + the ONE trailing slot (an action, or the
 *  Dormant badge). A hairline under it, matching the section-heading divider treatment. */
function TileHeader({
  tile,
  trailing,
  headingId,
}: {
  readonly tile: HomeTileContribution;
  readonly trailing: ReactNode;
  readonly headingId: string;
}): ReactElement {
  return (
    <Row align="center" gap="row" justify="between" className="border-border border-b pb-field">
      <Row align="center" gap="field">
        <Icon className="text-muted-foreground" icon={tile.icon} size="sm" />
        {/* The `kicker` VOICE on a real heading element (density-pass §2.3 — it used to spell the same skin
            out of four internal axes); `level` keeps the document outline (a styled div would leave home
            with zero headings). */}
        <Heading id={headingId} level={2} voice="kicker">
          {tile.title}
        </Heading>
      </Row>
      {trailing}
    </Row>
  );
}

/** The DORMANT doorway body — what this will be, and exactly what must land first. Zero controls. */
function DormantBody({ tile, doorway }: { readonly tile: HomeTileContribution; readonly doorway: DormantDoorway }): ReactElement {
  return (
    <Row align="start" gap="row">
      <Row align="center" className="size-9 shrink-0 rounded-base bg-muted/40" justify="center">
        <Icon className="text-muted-foreground" icon={tile.icon} size="md" />
      </Row>
      <Stack gap="field" className="min-w-0">
        {/* The `gloss` VOICE (mock `.dorm .teaser`: 11px, muted). The `label` step made the two DORMANT
            tiles the brightest prose on home — full-foreground text on the two things you cannot use
            (side-eye P1-2). The dashed frame + the Dormant badge carry "not built yet"; the copy recedes. */}
        <Text voice="gloss">{doorway.teaser}</Text>
        {/* FOOTNOTE (mock: 9px mono at .75 alpha): the tracked reason is developer citation under a
            user-facing teaser. Same `gloss` step as the teaser above it — the scale has no step between
            micro and nothing — so the separation is carried by mono + the alpha this footnote tier has
            always had, which is the mock's own distinction (9px mono .75 vs 11px sans). */}
        <Text className="font-mono opacity-60" voice="gloss">
          waiting on: {doorway.reason}
        </Text>
      </Stack>
    </Row>
  );
}

/** The tile's LOADING box (F14 boot CLS). The skeleton sits inside the height this tile SETTLED at on
 *  this device last time (`useHomeTileBox` — localStorage, read synchronously, so the value is already
 *  in the FIRST commit): the tile's box is then the same before and after its read lands, and the tiles
 *  below it in the grid never move. No memory (a first-ever boot) ⇒ the bare skeleton, i.e. exactly the
 *  behaviour that shipped before.
 *
 *  AND THE SKELETON FILLS THE BOX IT IS GIVEN (side-eye R-1). A fixed 3 rows inside a MEASURED box is a
 *  reservation that is honest about the height and dishonest about the content: the recents tile reserved
 *  349px and painted 160px of bars, so 189px of blank sat under three lonely lines for the duration of the
 *  read — the exact 189px the reservation had just stopped SHIFTING, converted into dead space — while the
 *  temp-chat tile reserved 110.89px and had its third bar clipped to a 2.9px hairline. `skeletonRowCountFor`
 *  inverts the skeleton's own layout to fit the box, so `overflow: clip` stops being load-bearing. */
function TileFallback({ reserved }: { readonly reserved: number | null }): ReactElement {
  const rows = reserved === null ? TILE_SKELETON_ROWS : skeletonRowCountFor(reserved, TILE_SKELETON_ROWS);
  return (
    <Stack data-tile-reserved={reserved === null ? undefined : Math.round(reserved)} style={reserved === null ? undefined : reserveStyle(reserved)}>
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
      rememberHomeTileBox(tileId, el.getBoundingClientRect().height);
    }
  }, [tileId]);
  return <Stack ref={bodyRef}>{children}</Stack>;
}

export function HomeTile({ tile }: { readonly tile: HomeTileContribution }): ReactNode {
  const visible = tile.useVisible?.() ?? true;
  const headingId = useId();
  const reserved = useHomeTileBox(tile.id);
  if (!visible) {
    return null;
  }
  const span = tile.span ?? "half";
  const dormant = typeof tile.body === "function" ? null : tile.body.dormant;
  // The DORMANT frame is dashed (mock `.tile.dormant`) — the header already claims reduced weight with a
  // muted glyph + the badge; the dashed edge is what makes "not built yet" legible from across the grid.
  const frame = [span === "full" ? "col-span-full" : "", dormant === null ? "" : "border-dashed"].filter((c) => c !== "").join(" ");
  return (
    <Card className={frame === "" ? undefined : frame} data-home-tile={tile.id} role="region" aria-labelledby={headingId}>
      <Stack gap="row">
        <TileHeader
          headingId={headingId}
          tile={tile}
          trailing={
            dormant === null ? (
              tile.action
            ) : (
              <Badge intent="neutral" tone="soft">
                Dormant
              </Badge>
            )
          }
        />
        {dormant === null ? (
          <QueryBoundary
            fallback={<TileFallback reserved={reserved} />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label={tile.title.toLowerCase()} onRetry={retry} />}
          >
            <TileBody tileId={tile.id}>{typeof tile.body === "function" ? tile.body() : null}</TileBody>
          </QueryBoundary>
        ) : (
          <DormantBody doorway={dormant} tile={tile} />
        )}
      </Stack>
    </Card>
  );
}
