// HomeSurface — the home section's CONTENT: a grid of DOOR-ASSEMBLED tiles (home-section-spec §3.2).
// It knows NOTHING about any feature: it receives the `home-tiles` contributor registry by PROP from its
// own section definition (which the door builds), maps it to frames, and renders. `client-features-no-cross`
// makes an `import … from "#features/chat"` here RED, so the only way a tile reaches home is the door.
//
// The tile grid reflows on the CONTENT PANE's own inline size, never the viewport (the shell's docked
// panels narrow this pane independently): `Grid cols="wide"` is an auto-fit `minmax(22rem, 1fr)` track
// template, so it is two columns at the content width and ONE the moment the pane drops below ~46rem —
// the same container-relative reflow a `@container` query would give, without a second breakpoint axis.
// `Container size="lg"` caps the grid at `--container-cq-lg` so it can never sprout a third column.
//
// ZERO tiles ⇒ ONE designed empty state (never a blank grid). The Weave decoration rides HERE and only
// here — at most one per screen (section-placeholder.tsx); every other surface keeps the muted sparkle.

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Plus } from "@orb/ui/icons";
import { Container, Grid, Stack, Surface } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useRef } from "react";
import type { ContributorRegistry, HomeTileContribution } from "#lib";
import { useFocusOnMount, WeaveGlyph } from "#lib";
import { HomeTile } from "../components/home-tile.tsx";
import { orderHomeTiles } from "../lib/order-home-tiles.ts";

export interface HomeSurfaceProps {
  readonly tiles: ContributorRegistry<HomeTileContribution>;
  /** Home's own primary — the empty state's next step. Supplied by the section definition. */
  readonly onNewChat: () => void;
}

const WEAVE_SIZE = 64;

export function HomeSurface({ tiles, onNewChat }: HomeSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const list = orderHomeTiles(tiles.list());

  return (
    // FORM tier (density-pass-spec.md §3.1 "library grid cards"): each tile is an interactive island you
    // land on and act from, not a row you scan — so its Card resolves the airy steps (p-block, the
    // floating-island radius) instead of the instrument ones. Declared here rather than in HomeTile so the
    // grid's own rhythm and its cells agree by construction.
    <Surface tier="form">
      <Stack align="center" className="h-full min-h-0 overflow-y-auto outline-none" padding="section" ref={surfaceRef} tabIndex={-1}>
        <Container className="w-full" size="lg">
          {list.length === 0 ? (
            <EmptyState
              action={
                <Button intent="primary" onClick={onNewChat}>
                  <Icon icon={Plus} size="sm" />
                  New chat
                </Button>
              }
              decoration={<WeaveGlyph anim={true} size={WEAVE_SIZE} />}
              description="Start a thread and your recents land here."
              title="Nothing on your home yet"
            />
          ) : (
            // `items-start` (mock `.grid{align-items:start}`): grid's default `stretch` made every tile in a
            // row as tall as its tallest sibling, so the short temp-chat tile grew a band of dead space under
            // its gloss. A tile is as tall as its own content.
            <Grid className="items-start" cols="wide" data-home-grid={true} gap="block">
              {list.map((tile) => (
                <HomeTile key={tile.id} tile={tile} />
              ))}
            </Grid>
          )}
        </Container>
      </Stack>
    </Surface>
  );
}
