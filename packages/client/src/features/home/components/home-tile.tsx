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
// The DORMANT arm renders a DOORWAY, not a fake feature: reduced weight, a muted glyph, the teaser in the
// gloss voice, a `Dormant` badge, the tracked reason as a quiet mono line — and NO interactive element at
// all (no button, no skeleton, no spinner). `empty-states-are-load-bearing`: omitting the tile would say
// "this product has no companion"; a fake-loading tile would lie.

import { Badge } from "@orb/ui/badge";
import { Card } from "@orb/ui/card";
import { Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows } from "#data";
import type { DormantDoorway, HomeTileContribution } from "#lib";

const TILE_SKELETON_ROWS = 3;

/** The tile's kicker band — icon + title in the `kicker` voice + the ONE trailing slot (an action, or the
 *  Dormant badge). A hairline under it, matching the section-heading divider treatment. */
function TileHeader({ tile, trailing }: { readonly tile: HomeTileContribution; readonly trailing: ReactNode }): ReactElement {
  return (
    <Row align="center" gap="row" justify="between" className="border-border border-b pb-field">
      <Row align="center" gap="field">
        <Icon className="text-muted-foreground" icon={tile.icon} size="sm" />
        <Text size="micro" tone="muted" transform="caps" weight="semibold">
          {tile.title}
        </Text>
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
        <Text size="label" tone="muted">
          {doorway.teaser}
        </Text>
        <Text size="code" tone="muted" className="opacity-75">
          waiting on: {doorway.reason}
        </Text>
      </Stack>
    </Row>
  );
}

export function HomeTile({ tile }: { readonly tile: HomeTileContribution }): ReactNode {
  const visible = tile.useVisible?.() ?? true;
  if (!visible) {
    return null;
  }
  const span = tile.span ?? "half";
  const dormant = typeof tile.body === "function" ? null : tile.body.dormant;
  return (
    <Card padding="block" className={span === "full" ? "col-span-full" : undefined} data-home-tile={tile.id}>
      <Stack gap="row">
        <TileHeader
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
