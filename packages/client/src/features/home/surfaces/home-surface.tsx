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
// whose body is the `{dormant}` arm lands under ONE band at the foot of the shelf. That is a
// PRESENTATION decision home is entitled to make — the arm is already declared in the contract, so
// nothing is imported and no feature is consulted — and it is what keeps the diet honest: two doorways
// wearing two bands and two badges is more chrome than the thing they are doorways to.
//
// …AND THAT BAND IS NOW A FOLD (#455, owner-ruled 2026-08-22: FOLD, not cut). The group was four
// paragraphs of roadmap prose in the smallest voice on the page, sitting below the fold at the most
// common laptop height — the least-read real estate on the screen carrying the most words. Three
// findings converged on it (side-eye rail-home P2-1 below-fold cue · P3-6 type voice · the taste
// verdict's prose weight), plus #226's open ~370px shelf residual and the +28px of shelf #457's ramp
// step had just added. Collapsed it is ONE control line saying what it holds; expanded it is exactly
// what shipped — #457's h3 titles and ramped teasers are untouched INSIDE the panel, which is what
// makes this a fold rather than a cut. `CollapsiblePanel` unmounts its content while closed, so the
// shelf really does get the height back rather than hiding it under a clip.
//
// …AND THE FOLD FINALLY HAS A SUBJECT (#834, owner-ruled 2026-08-30). B3 retired automation's doorway and
// left the whole region delivering ONE dateless row, so the owner ruled what the region is FOR rather than
// whether to keep it: it lists the committed-but-unrealized programs of
// `docs/architecture/proposed/INDEX.md` (FUTURE + PARTIAL), with buddy among them. Home reads no doc and
// holds no second list — those programs are declared as home-owned DORMANT DOORWAY TILES
// (`lib/roadmap.ts`), so they arrive through the door like every other tile and this surface's partition,
// grouping, fold and count all apply unchanged. The only thing that moved here is the band's trailing
// COUNT, which is derived from the doorways it holds.
//
// NO PERSISTENCE, deliberately (the brief's fork, taken): the house device-local disclosure precedent
// (`config-group-open-store`) is a whole persisted store + a `persistence-boundary` registration, and
// what it would remember here is a glance at a list of things that do not exist yet — not a working
// posture like "tags open, regex closed" on a roster you return to. Collapsed every boot IS the ruled
// default, and re-opening costs one keypress.
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
// MEASURED (tests/client/features/home/surfaces/home-column-balance.suite.ct.tsx, the 4 widths x 3 appearance
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

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Plus } from "@orb/ui/icons";
import { Container, Grid, Row, Section, Stack, Surface } from "@orb/ui/layout";
import { SCROLL_FADE_Y_CLASS } from "@orb/ui/lib";
import { useScrollFadeY } from "@orb/ui/scroll-area";
import { Separator } from "@orb/ui/separator";
import { Heading, Text } from "@orb/ui/text";
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

/** The doorway group's ONE name — the fold's trigger, its region's accessible name, and the teaser a
 *  collapsed group leads with. Forward-facing on purpose (#455, the owner's own wording): "Not yet" named
 *  the group from the inside of a band you were already reading, and reads as a refusal on a line whose
 *  whole job is to invite the press. */
const DOORWAY_GROUP_LABEL = "What's coming";

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
    // FORM tier (UI-Density-Law.md §3.1): home is a surface you land on and act from, so its islands
    // resolve the airy steps. It keeps the tier even though the tiles lost their cards — the tier is what
    // the ONE surviving island (the hearth hero) resolves its padding and radius from.
    <Surface tier="form">
      {/* The page inset is the mockup's own: `--spacing-section` over the masthead, `--spacing-gutter`
          down the sides and under the last block. `Stack padding="section"` would have run 24px all round
          and pulled the two columns tighter to the frame than the shelf's own rhythm. */}
      <Stack
        className={`${SCROLL_FADE_Y_CLASS} relative h-full min-h-0 overflow-y-auto overscroll-contain px-gutter pt-section pb-gutter outline-none`}
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
                    min-content (a 64px face strip + a headline + a character/age line) is ~743px, which silently
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
                      // ONE FOLD over every declared doorway (#455). The `<h2>` WRAPS the trigger rather
                      // than sitting inside it — that is the canonical disclosure shape (a button's content
                      // model is phrasing, so a heading inside one is invalid HTML), and it keeps F6's
                      // ruling intact: this block is still a PEER of home's other h2 blocks in the outline,
                      // and the doorways' own h3 titles are still its children. `size="control"` because
                      // the trigger is a CONTROL (side-eye 2026-08-22 P2-4, the ruling #482 landed on the
                      // params deck's `Advanced`): the micro caps step measured under WCAG 2.5.8's 24×24
                      // floor on the one thing you can press.
                      //
                      // THAT RULING SURVIVES; ITS COROLLARY DID NOT. This clause used to continue "…a group
                      // you have to OPEN is a control, so the kicker retires", and read the tap-target
                      // finding as a verdict on the BAND as well as on the type step. See the band below
                      // for what that cost at 1920 and how the two separate (#833).
                      <Section aria-label={DOORWAY_GROUP_LABEL}>
                        <Collapsible className="gap-block">
                          {/* …AND THE BAND CAME BACK, HOSTING THE TRIGGER RATHER THAN REPLACING IT (#833,
                              side-eye HOME delta 2026-08-30). The clause above retired the kicker anatomy
                              on the reasoning that "a group you have to OPEN is a control, not a band" —
                              and the rendered consequence was that this was the ONE right-column block with
                              no section voice: six caps kickers over hairlines (`START WITH`, `TEMP CHAT`,
                              `DATABANK`, …) and a seventh block in sentence-case body weight with a chevron
                              and no rule, so it had no visual parent. At 1920 the shelf's `pairWide` subgrid
                              puts it BESIDE the databank band on the same baseline, where an unparented
                              control reads as a third Databank action next to "All documents →".
                              The two halves of that clause separate cleanly: the ANATOMY is a band (the
                              `Row` + `Separator` every `<Section kicker>` and every `TileBand` on this
                              surface draws), and the CONTROL keeps everything #482 ruled — the `<h2>` still
                              WRAPS the trigger, the trigger still carries `size="control"`'s 24×24 floor,
                              and its accessible name is still exactly the group's one name. Only the
                              trigger's VISIBLE label changes register, to `interactiveKicker`: the voice
                              minted for "a kicker that is itself the label of a control", i.e. the caps +
                              tracked instrument register of the band at the READABLE label step rather than
                              the 10.5px micro step #482 measured under the tap floor. Same pairing the
                              config rail's collection bands already ship. */}
                          <Row align="center" gap="field">
                            <Heading level={2} voice="label">
                              <CollapsibleTrigger size="control">
                                <Text as="span" voice="interactiveKicker">
                                  {DOORWAY_GROUP_LABEL}
                                </Text>
                              </CollapsibleTrigger>
                            </Heading>
                            {/* DECORATIVE, exactly as on every tile band (`home-tile.tsx` TileBand): the
                                `h2` beside it already names the region, and a bare `role="separator"` here
                                would add an unnamed stop to the home walk's a11y tree. */}
                            <Separator aria-hidden={true} className="flex-1" />
                            {/* THE COUNT, in the band's TRAILING slot (#834) — the same position every
                                `TileBand` puts its one trailing affordance in ("All documents →"), which is
                                why it needs no chrome of its own. It sits OUTSIDE the trigger deliberately:
                                the trigger's accessible name is exactly the group's one name (#482/#833 both
                                ruled on that string), and a chip inside the button would concatenate into it.
                                It is DERIVED, never declared — the fold says how much it is holding, so a
                                roadmap entry landing or a doorway going live moves this number by itself.
                                …AND IT NAMES ITSELF NOW (side-eye HOME 2026-09-02 H10). It reached AT as a
                                bare figure — `snap --aria` rendered `button "What's coming"` and then an
                                unattributed `text: "7"`, so a screen-reader user heard "What's coming,
                                collapsed… seven" with nothing saying seven WHAT. The review's first
                                suggested arm was to fold the count into the trigger's accessible name, and
                                that is the one thing the paragraph above forbids: #482 and #833 both ruled
                                on that exact string. So the unit word rides INSIDE the chip instead, as
                                real screen-reader-only text — the chip announces "7 items", the trigger's
                                name is untouched, and the band still paints the bare figure the mock draws
                                (`sr-only` clips it to a 1px box, asserted in the CT). */}
                            <Badge size="sm" tone="ghost">
                              {doorways.length}
                              <Text as="span" className="sr-only">
                                {" "}
                                items
                              </Text>
                            </Badge>
                          </Row>
                          <CollapsiblePanel>
                            <Stack gap="block">
                              {doorways.map((entry) => (
                                <HomeDoorway doorway={entry.doorway} key={entry.tile.id} tile={entry.tile} />
                              ))}
                            </Stack>
                          </CollapsiblePanel>
                        </Collapsible>
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
