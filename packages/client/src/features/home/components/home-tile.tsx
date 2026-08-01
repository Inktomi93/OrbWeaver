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
import type { ReactElement, ReactNode } from "react";
import { useId } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows } from "#data";
import type { DormantDoorway, HomeTileContribution } from "#lib";

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

export function HomeTile({ tile }: { readonly tile: HomeTileContribution }): ReactNode {
  const visible = tile.useVisible?.() ?? true;
  const headingId = useId();
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
            fallback={<SkeletonRows count={TILE_SKELETON_ROWS} />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label={tile.title.toLowerCase()} onRetry={retry} />}
          >
            {typeof tile.body === "function" ? tile.body() : null}
          </QueryBoundary>
        ) : (
          <DormantBody doorway={dormant} tile={tile} />
        )}
      </Stack>
    </Card>
  );
}
