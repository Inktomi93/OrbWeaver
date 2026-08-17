// HomeSurface — the home section's CONTENT: the HEARTH ROOM (program #102, owner-picked mockup variant
// C, `reports/design/home-mockups/home-c-hearth.html`). It knows NOTHING about any feature: it receives
// the `home-tiles` contributor registry by PROP from its own section definition (which the door builds),
// maps it to frames, and renders. `client-features-no-cross` makes an `import … from "#features/chat"`
// here RED, so the only way a tile reaches home is the door.
//
// WHAT REPLACED THE GRID OF EQUAL ISLANDS, and why (measured on the live app 2026-08-16, before):
//   - `main` was 1224px and the tile grid 768px — 62.7%, centred, 228px of dead void down each side. The
//     cause was one line, `<Container size="lg">`, capping the grid at `--container-cq-lg` (48rem).
//   - The type ramp rendered 16/15/13/10.5 — a 1.5:1 spread. `--text-display` and `--text-headline`
//     existed in tokens.json and appeared nowhere on the surface.
//   - The six live rooms sat in the same island, in the same auto-fit grid, at the same weight as an
//     explainer for throwaway chats.
// So: no cap (a `<Container>` with no `size` keeps the container-query context and drops the max-width),
// a `cols="lead"` split — a HEARTH column you read and a SHELF you reach into — and the full six-step
// ramp, one step per role. The page opens on the room you were last in, then arranges the house round it.
//
// THE THREE REGIONS ARE THE TILES' OWN DECLARATION (`HomeTileContribution.region`), never a list here: a
// masthead row above the split, the hearth column, the shelf column. Home still reads no feature — the
// placement travels with the tile that makes it, which is the same rule `sectionId` follows.
//
// THE DORMANT DOORWAYS ARE GROUPED, not framed one by one (the mockup's right-rail move): every tile
// whose body is the `{dormant}` arm lands under ONE "Not yet" kicker at the foot of the shelf. That is a
// PRESENTATION decision home is entitled to make — the arm is already declared in the contract, so
// nothing is imported and no feature is consulted — and it is what keeps the diet honest: two doorways
// wearing two bands and two badges is more chrome than the thing they are doorways to.
//
// ZERO tiles ⇒ ONE designed empty state (never a blank surface). The Weave decoration rides HERE and only
// here — at most one per screen (section-placeholder.tsx); every other surface keeps the muted sparkle.

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Plus } from "@orb/ui/icons";
import { Container, Grid, Section, Stack, Surface } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useRef } from "react";
import type { ContributorRegistry } from "#lib";
import { useFocusOnMount, WeaveGlyph } from "#lib";
import type { DormantDoorway, HomeTileContribution } from "#state";
import { HomeDoorway, HomeTile } from "../components/home-tile.tsx";
import { orderHomeTiles } from "../lib/order-home-tiles.ts";

export interface HomeSurfaceProps {
  readonly tiles: ContributorRegistry<HomeTileContribution>;
  /** Home's own primary — the empty state's next step. Supplied by the section definition. */
  readonly onNewChat: () => void;
}

const WEAVE_SIZE = 64;

/** One declared doorway, already narrowed off its tile — the surface groups doorways under a single band,
 *  so it needs the pair, and narrowing ONCE here is what keeps the render free of a re-check whose other
 *  arm cannot happen. */
interface Doorway {
  readonly tile: HomeTileContribution;
  readonly doorway: DormantDoorway;
}

function asDoorway(tile: HomeTileContribution): readonly Doorway[] {
  return typeof tile.body === "function" ? [] : [{ tile, doorway: tile.body.dormant }];
}

function isLive(tile: HomeTileContribution): boolean {
  return typeof tile.body === "function";
}

export function HomeSurface({ tiles, onNewChat }: HomeSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const list = orderHomeTiles(tiles.list());
  const doorways = list.flatMap(asDoorway);
  const live = list.filter(isLive);
  const masthead = live.filter((tile) => tile.region === "masthead");
  const hearth = live.filter((tile) => tile.region === "hearth");
  // The DEFAULT region (`HomeTileContribution.region` documents why): a tile that declares nothing is a
  // data surface and belongs on the shelf, never promoted into the hearth by omission.
  const shelf = live.filter((tile) => tile.region !== "masthead" && tile.region !== "hearth");

  return (
    // FORM tier (density-pass-spec.md §3.1): home is a surface you land on and act from, so its islands
    // resolve the airy steps. It keeps the tier even though the tiles lost their cards — the tier is what
    // the ONE surviving island (the hearth hero) resolves its padding and radius from.
    <Surface tier="form">
      {/* The page inset is the mockup's own: `--spacing-section` over the masthead, `--spacing-gutter`
          down the sides and under the last block. `Stack padding="section"` would have run 24px all round
          and pulled the two columns tighter to the frame than the shelf's own rhythm. */}
      <Stack className="relative h-full min-h-0 overflow-y-auto px-gutter pt-section pb-gutter outline-none" gap="section" ref={surfaceRef} tabIndex={-1}>
        {/* NO `size`: the container-query context survives (the split answers to THIS pane's inline size,
            never the viewport — the shell's docked panels narrow it independently) and the max-width cap
            that was eating 37% of the page goes. */}
        <Container className="w-full">
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
            <Stack gap="section">
              {masthead.map((tile) => (
                <HomeTile key={tile.id} tile={tile} />
              ))}
              {/* `items-start` (mock `.room{align-items:start}`): grid's default `stretch` would make the
                  shelf column as tall as the hearth and hang its last block in dead space. */}
              <Grid className="items-start" cols="lead" data-home-grid={true} gap="gutter">
                <Stack gap="section">
                  {hearth.map((tile) => (
                    <HomeTile key={tile.id} tile={tile} />
                  ))}
                </Stack>
                <Stack data-home-shelf={true} gap="section">
                  {shelf.map((tile) => (
                    <HomeTile key={tile.id} tile={tile} />
                  ))}
                  {doorways.length === 0 ? null : (
                    // ONE band over every declared doorway. `<Section kicker>` is the sanctioned band
                    // anatomy (caps micro + a hairline to the edge) and it renders a real h3, so the
                    // group is a named landmark instead of two anonymous dashed rules.
                    <Section aria-label="Not yet" kicker="Not yet">
                      {doorways.map((entry) => (
                        <HomeDoorway doorway={entry.doorway} key={entry.tile.id} tile={entry.tile} />
                      ))}
                    </Section>
                  )}
                </Stack>
              </Grid>
            </Stack>
          )}
        </Container>
      </Stack>
    </Surface>
  );
}
