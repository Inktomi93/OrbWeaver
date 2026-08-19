// THE FAMILY MAP — the corpus's picture of its own shape, and mockup A "The Cartographer"'s title island
// (program #102 corpus leg, issue #127). Ten characters resolved into eight families by the avatar-embedding
// clustering is, on an un-analysed library, the ONLY thing the corpus has actually computed — so the map is
// what the surface is FOR, and this component is the thing the state-swap promotes and demotes.
//
// IT RENDERS AT TWO WEIGHTS AND THE WEIGHT IS THE WHOLE POINT (CD3, density-pass-spec.md §3.2 — exactly one
// element per surface may carry accent fill, glow, or elevated shadow at rest):
//   • `focal` — the one elevated island: the rationed `--shadow-glow` on the sanctioned ::before carrier, at
//     the token's own strength. Taken once the semantic pass has run and the map has something to be the
//     map OF. (It also wore an accent border-left until #244 P2-1 — see `GLOW` for why that went.)
//   • not `focal` — boxless (CD1: a read-only grouping gets a kicker band and a hairline, never a box),
//     sitting UNDER the invitation that holds the focal while the library is un-analysed.
// A component that painted the glow unconditionally would put two focals on the surface, which by the
// spec's own words means the surface has no focal.
//
// PORTRAITS ARRIVE ON THE WIRE (issue #134 — the durable fix, landed): `ArchetypeMember` carries
// `avatarHash` (packages/server/src/domain/discovery/contract/results.ts), so a plate draws its faces from
// the `visualArchetypes` payload it already has. This component used to join every member against
// `discovery.portraitAlignment` for the same string — a second owner-scoped read the clustering verb was
// always holding, since it clusters BY the avatar. A member whose hash is null falls back to the hue-seeded
// initials `Avatar` already draws, which is honest — it says "we have no portrait for this one", not "this
// one has no face". Do not re-introduce the join: the CT pins that verb at zero calls from this surface.
//
// A FAMILY IS NOT NUMBERED. The mockup labels the plates "Family 1 … Family 8"; k-means assigns cluster
// indices per run against a `k` the CONTEXT panel exposes as a knob, so that number is not an identity and
// printing it as one invites a user to refer to something that will not survive the next pass. The plate is
// named by WHO IS IN IT, which is stable, and by its label only when the labelling actually produced one.
//
// PLATES ARE READ-ONLY. Selecting a whole family means nothing (there is no family dossier), and making
// only the single-member plates operable would be a control that exists on some rows and not others. The
// drill into a character lives where it always has: the gem tiles, the browse list, the dossier.

import { AvatarStack } from "@orb/ui/avatar-stack";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import type { Trpc } from "#data";
import { revealContextPanel } from "#state";
import { toFaceItems } from "../lib/corpus-faces.ts";

type VisualFamily = inferOutput<Trpc["discovery"]["visualArchetypes"]>[number];

/** Faces per plate. Four 32px portraits is the widest strip that leaves a two-name title its own line at
 *  the 13rem plate floor; the true member count is always in the gloss, so the strip never has to total. */
const FAMILY_FACE_SLOTS = 4;

/** The rationed accent glow on the sanctioned ::before carrier (home's hearth precedent):
 *  `design-audit-checks.ts` classifies a chromatic glow on an element's OWN box-shadow as the generated-UI
 *  tell, and `rounded-(--radius-card)` mirrors the radius the Card resolves from `tiers.css` so the halo
 *  tracks the edge it is a halo for.
 *
 *  NO `before:opacity-30`, AND NO STRIPE (#244 P2-1, measured on the shipped default arm). The island used
 *  to carry BOTH a `--color-speaker` border-left at `--immersive-stripe-width` and this ring dimmed to 30%,
 *  which is the worst of both: `design-audit` fires `side-tab` (a §6 ABSOLUTE ban — "the most recognizable
 *  generated-UI tell") and `border-accent-on-rounded` on the border, while the sanctioned ring painted at an
 *  effective alpha of 0.12 and its halo at 0.054 — i.e. the pattern that is allowed to say "look here" was
 *  not saying it, and the banned one was doing all the work.
 *
 *  THE STRIPE CITE DID NOT TRANSFER. It was justified from `message-row-variants` STRIPE_LEFT — a speaker
 *  stripe on a FLAT, unrounded message row. Rounded + a thick single-edge accent is precisely the shape the
 *  ban names. And the 30% came from the config welcome hearth, where it is a RESTING dim that a
 *  `hover:opacity-75` lifts; this island has no hover arm, so it inherited the dim and never the lift. */
const GLOW =
  "relative isolate before:pointer-events-none before:absolute before:-inset-px before:-z-10 before:rounded-(--radius-card) before:shadow-glow before:content-['']";

/** A family whose VISUAL labelling produced nothing to say, derived from the fields that produce a label
 *  rather than by matching a sentinel string across the wire.
 *
 *  THE CARD-TEXT FIELDS ARE NOT PART OF THIS TEST any more (issue #164). `genre`/`tone` describe a card's
 *  WRITING; they used to be the label's last-resort fallback, which is how the family grouped precisely by
 *  its members' MISSING art came to be called "melancholic fantasy". They still ride the payload as context
 *  chips for the Archetypes tab, but a family with story facets and no visual ones has nothing to say about
 *  how it LOOKS — which is the only thing this plate claims. */
function isUnlabelled(family: VisualFamily): boolean {
  return family.artStyle === null && family.mood === null && family.palette === null;
}

function memberNames(family: VisualFamily): string {
  return family.members.map((member) => member.name).join(" · ");
}

function plateGloss(family: VisualFamily): string {
  const members = `${family.size.toString()} ${family.size === 1 ? "member" : "members"}`;
  return isUnlabelled(family) ? `${members} · grouped by portrait` : `${members} · ${memberNames(family)}`;
}

function FamilyPlate({ family }: { readonly family: VisualFamily }): ReactElement {
  // The strip is ART here: every seat's name is already in the plate's own text (as the title when the
  // family is unlabelled, as the gloss when it is not), and a named stack would announce each of them a
  // second time inside a plate that is three lines long. The hearth-hero ruling, same reasoning.
  const faces = toFaceItems(family.members, FAMILY_FACE_SLOTS);
  return (
    // THE CALLER SUPPLIES THE FILL, by the `nested` arm's own contract ("drop the border entirely, step the
    // radius one below the host's, and let the FILL alone carry the distinction — the caller supplies it").
    // `bg-surface-raised` is the mockup's `.plate` tone and the ONLY one that works in both of this
    // component's homes: inside the focal island it steps DOWN from `--color-card`, and on the page
    // background it steps UP. Card's own `bg-card` default would be invisible inside the island.
    <Card className="bg-surface-raised" nested={true}>
      <Row align="center" gap="row">
        <AvatarStack
          aria-hidden={true}
          className="shrink-0"
          items={faces}
          // Never a "+N" chip: `members` is a bounded DISPLAY SLICE of a family whose real total is `size`,
          // so a chip computed off the slice would undercount. One count, in the gloss, correct.
          max={FAMILY_FACE_SLOTS + 1}
          shape="rounded"
          size="md"
        />
        <Stack className="min-w-0 flex-1" gap="tight">
          <Text as="span" className="truncate" voice="label">
            {isUnlabelled(family) ? memberNames(family) : family.label}
          </Text>
          <Text as="span" className="truncate" voice="gloss">
            {plateGloss(family)}
          </Text>
        </Stack>
      </Row>
    </Card>
  );
}

export interface CorpusFamilyMapProps {
  readonly families: readonly VisualFamily[];
  /** Carry the surface's ONE focal treatment (stripe + glow + elevated island). Exactly one caller may. */
  readonly focal: boolean;
  /** Whether the Archetypes CONTEXT tab will actually DRAW the families — its own distill gate. False means
   *  the tab answers with the understanding invitation, so the "All families →" door does not render (A7). */
  readonly canOpenFamilies: boolean;
}

export function CorpusFamilyMap({ families, focal, canOpenFamilies }: CorpusFamilyMapProps): ReactElement | null {
  const titleId = useId();
  if (families.length === 0) {
    // NOT an empty state. When the clustering has produced nothing the readiness rail already says
    // "Visual families — not run" with the door beside it, and a second panel repeating that sentence is
    // the wall of truthful nothing this whole pass exists to delete.
    return null;
  }

  // The model that produced the clustering is provenance, and it belongs beside the claim it backs: every
  // family in a response comes from one embedding pass, so the first row's model names all of them.
  const model = families[0]?.model ?? "";
  const body = (
    <Stack gap="row">
      <Row align="start" gap="row" justify="between">
        <Stack gap="tight">
          <Heading id={titleId} level={2} voice="kicker">
            The shape of your library
          </Heading>
          <Text voice="gloss">{model === "" ? "Grouped from the portrait embeddings" : `Grouped from the portrait embeddings · ${model}`}</Text>
        </Stack>
        {/* THE REAL DOOR, and deliberately not the mockup's "Open map →". That link points at the CONTEXT
            "Map" tab, which draws the SEMANTIC projection of distilled cards — a different artifact from
            these visual families, and empty on exactly the library this island is loudest on.

            TRUTH-REPAIR (side-eye corpus re-pass A7). The line that stood here — "the families live on the
            Archetypes tab, which is populated whenever this island renders at all" — was refuted twice by
            the live render. (1) The tab OPENED ON WRITING ARCHETYPES: the art half was the second section,
            below a bar chart and ten cluster cards, so the door named families and delivered a different
            artifact. That is fixed at the destination — the art half now leads that tab. (2) "Populated
            whenever this island renders" is FALSE: the tab gates its whole cluster surface on
            `catalog.totalDistilled > 0` (the #154 owner ruling), while this island renders off
            `visualArchetypes` alone and is at its loudest on exactly the undistilled library the tab
            refuses to draw. A door onto an invitation is the thing this pass exists to delete, so on that
            library there is no door — `canOpenFamilies` is the destination's OWN gate signal, passed down
            rather than re-derived, and the readiness rail is already the one place that says why. */}
        {canOpenFamilies ? (
          <Button className="shrink-0" intent="ghost" onClick={(): void => revealContextPanel("archetypes")} size="sm">
            All families →
          </Button>
        ) : null}
      </Row>
      {/* auto-fit at the 13rem plate floor: a wider pane shows MORE plates, never wider ones. */}
      <Grid cols="auto" gap="row">
        {families.map((family) => (
          <FamilyPlate family={family} key={`${family.label}-${family.members[0]?.characterId ?? family.size.toString()}`} />
        ))}
      </Grid>
    </Stack>
  );

  if (focal) {
    return (
      <Card aria-labelledby={titleId} className={GLOW} data-corpus-focal="familyMap" role="group">
        {body}
      </Card>
    );
  }
  // BOXLESS when it is not the focal (CD1). The heading inside `body` still carries the outline; what it
  // loses is the border, the fill, the stripe and the glow — the four things that were saying "look here".
  return (
    <section aria-labelledby={titleId} data-corpus-family-map="quiet">
      {body}
    </section>
  );
}
