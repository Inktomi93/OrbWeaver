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
// THE RAIL GETS A SECOND BREATH AT >=100rem (side-eye 2026-08-16 F3). The `lead` split already widens the
// rail there; the shape's other half — the rail's two footnote blocks side by side — was unbuilt, so a
// 2000px pane bought a taller page instead of more of the house in reach. The pairing is POSITIONAL (the
// last shelf tile beside the doorway group), because positional is the only thing a host that imports zero
// features can honestly say, and it is the same presentation license the doorway grouping already takes.
//
// …AND THE RAIL IS WHAT DECIDED THE PAGE'S HEIGHT (#226, owner-ruled "no shell game — self-balance by
// construction"). The two columns' feet did not line up, and WHICH ONE ended short CHANGED SIDES with the
// pane, so every "move tile X across" fix helps one end of the range and worsens the other. The cause is
// not the tile assignment: the HEARTH is ~780px tall at every width, and the whole swing is the SHELF's
// own width-driven reflow — its `cellFixed` face shelf goes 3-per-row at a narrow rail and 6-per-row at a
// wide one, and its footnote pair stacks below the >=100rem pane the subgrid needs. So the shelf was
// paying for a track sized as a companion while carrying content that answers to width.
// `cols="leadEven"` is `lead` with its wide-pane breath taken to EVEN tracks — the rail gets the width its
// grids need, and the columns end level without either column being padded or a tile being moved.
// MEASURED (tests/client/features/home/surfaces/home-column-balance.ct.tsx, the 4 widths x 3 appearance
// arms this shipped against): 1920 defaults 180px -> 11px, 1920 compact 192px -> 3px, 2560 reading
// 228px -> 11px, and the 2560 flip is gone.
//
// WHAT IS NOT FIXED, and why it is not budgeted away: below a 100rem pane (1280/1440, and 1920 on the
// reading arm, where `--font-scale` makes 100rem a 2000px pane) the shelf's foot CANNOT go 2-up and its
// face shelf CANNOT gain a column, so the shelf is structurally ~370px taller than the hearth and no
// track ratio closes it (measured: 368px -> 313px at best across a seven-ratio sweep). The two costed
// padding arms were both measured and both refused: distributing that slack into the short column's two
// gaps means 208px gaps on the defaults arm and 385px on reading, against a 24px section rhythm — three
// kicker bands that far apart stop reading as one column; and growing the short column's LAST block means
// the 91px section-jump grid becoming a 460px one. The narrow-pane residual is an open owner fork
// recorded on #226, not a silent budget.
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
import { useFocusOnMount, useScrollFadeY, WeaveGlyph } from "#lib";
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
  // THE BELOW-FOLD CUE (side-eye rail-home P2-1). Home is the app's one CONTENT-SCROLLING landing surface,
  // and it overflowed silently: 293px hidden at 1280x800, `mask-image: none`, `scrollbar-gutter` 0, no
  // `::after` — the last visible line severed mid-word, with BOTH of the databank empty state's calls to
  // action below the cut. The repo already owned the recipe on the inline axis (`.scroll-fade-x`); the
  // block-axis twin is `.scroll-fade-y` (@orb/ui styles/globals.css) and this is its driver. It is
  // SCROLL-AWARE by construction, so a home that fits its pane paints no fade at all.
  useScrollFadeY(surfaceRef);
  const list = orderHomeTiles(tiles.list());
  const doorways = list.flatMap(asDoorway);
  const live = list.filter(isLive);
  const masthead = live.filter((tile) => tile.region === "masthead");
  const hearth = live.filter((tile) => tile.region === "hearth");
  // The DEFAULT region (`HomeTileContribution.region` documents why): a tile that declares nothing is a
  // data surface and belongs on the shelf, never promoted into the hearth by omission.
  const shelf = live.filter((tile) => tile.region !== "masthead" && tile.region !== "hearth");
  // The rail's FOOT — the last shelf tile, which pairs with the doorway group at a wide pane (see the
  // subgrid below). `slice(-1)` rather than `at(-1)` so the empty-shelf arm needs no null branch in JSX.
  const shelfFoot = doorways.length === 0 ? [] : shelf.slice(-1);
  const shelfLead = doorways.length === 0 ? shelf : shelf.slice(0, -1);

  return (
    // FORM tier (density-pass-spec.md §3.1): home is a surface you land on and act from, so its islands
    // resolve the airy steps. It keeps the tier even though the tiles lost their cards — the tier is what
    // the ONE surviving island (the hearth hero) resolves its padding and radius from.
    <Surface tier="form">
      {/* The page inset is the mockup's own: `--spacing-section` over the masthead, `--spacing-gutter`
          down the sides and under the last block. `Stack padding="section"` would have run 24px all round
          and pulled the two columns tighter to the frame than the shelf's own rhythm. */}
      <Stack
        className="scroll-fade-y relative h-full min-h-0 overflow-y-auto px-gutter pt-section pb-gutter outline-none"
        gap="section"
        ref={surfaceRef}
        tabIndex={-1}
      >
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
              <Grid className="items-start" cols="leadEven" data-home-grid={true} gap="gutter">
                {/* `min-w-0` IS THE SPLIT (side-eye 2026-08-16 P1-1). A grid TRACK CHILD is `min-width:auto`,
                    so each track is floored at its content's min-content width — and the hero's own
                    min-content (a 64px cast strip + a headline + a cast/age line) is ~743px, which silently
                    overrode the approved `1.55fr/1fr` and rendered 1.92/1 at the 1280px pane (742.06/385.94
                    measured). The shelf paid for it: its face grid dropped from three fixed cells to two and
                    the page grew 1374px against 1177px. The declared ratio only means anything on tracks that
                    are allowed to shrink below their content. */}
                <Stack className="min-w-0" gap="section">
                  {hearth.map((tile) => (
                    <HomeTile key={tile.id} tile={tile} />
                  ))}
                </Stack>
                <Stack className="min-w-0" data-home-shelf={true} gap="section">
                  {shelfLead.map((tile) => (
                    <HomeTile key={tile.id} tile={tile} />
                  ))}
                  {/* THE RAIL'S SECOND BREATH (side-eye 2026-08-16 F3). The `lead` split widens the rail at
                      >=100rem, and that was only half the promise: at a 2000px pane the hearth column
                      dead-ended around y=750 with the rail's last two blocks stacked beside ~350px of void,
                      so a wider monitor bought a taller page instead of more of the house in reach. The
                      shape's answer is to pair the rail's two FOOTNOTE blocks — its last tile and the
                      doorway group — into a subgrid at exactly that step.

                      WHICH two is POSITIONAL, never named: home reads no feature, so "the tile at the foot
                      of the shelf" is the only thing it can say, and it is the same presentation license it
                      already exercises by grouping every doorway under one band. With no doorways to pair
                      against there is nothing to pair and the tail renders in flow. */}
                  <Grid className="items-start" cols="pairWide" data-home-shelf-foot={true} gap="gutter">
                    {shelfFoot.map((tile) => (
                      <HomeTile key={tile.id} tile={tile} />
                    ))}
                    {doorways.length === 0 ? null : (
                      // ONE band over every declared doorway. `<Section kicker>` is the sanctioned band
                      // anatomy (caps micro + a hairline to the edge), and `level={2}` makes it a PEER of
                      // home's other blocks in the document outline rather than a child of whichever one
                      // precedes it (side-eye F6 — it rendered h3 beside six h2s).
                      <Section aria-label="Not yet" kicker="Not yet" level={2}>
                        {doorways.map((entry) => (
                          <HomeDoorway doorway={entry.doorway} key={entry.tile.id} tile={entry.tile} />
                        ))}
                      </Section>
                    )}
                  </Grid>
                </Stack>
              </Grid>
            </Stack>
          )}
        </Container>
      </Stack>
    </Surface>
  );
}
