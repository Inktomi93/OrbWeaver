// Visual families are current-avatar groupings. Each door retains the complete producer snapshot.
// The map shares its naming decision with the analysis tab and selected detail.

import { AvatarStack } from "@orb/ui/avatar-stack";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import type { Trpc } from "#data";
import { revealContextPanel, selectCorpusArtifact } from "#state";
import { resolveCorpusArchetypeNames } from "../lib/corpus-archetype-presentation.ts";
import { toFaceItems } from "../lib/corpus-faces.ts";
import { facetLabel } from "../lib/corpus-vocabulary.ts";

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
 *  ban names. And the 30% came from the config welcome hearth (since retired, #1210), where it was a RESTING dim that a
 *  `hover:opacity-75` lifts; this island has no hover arm, so it inherited the dim and never the lift. */
const GLOW =
  "relative isolate before:pointer-events-none before:absolute before:-inset-px before:-z-10 before:rounded-(--radius-card) before:shadow-glow before:content-['']";

// THE `isUnlabelled` PREDICATE IS GONE (side-eye populated arm 2026-08-23, [P2-1]). It tested
// `artStyle === null && mood === null && palette === null` — "this family's VISUAL labelling produced
// nothing to say" — and was the plate's arm selector. Nothing branches on it here any more: `facetLabel`
// answers the un-nameable case in the same words the Archetypes tab uses, so the plate has ONE anatomy and
// a second predicate for the same question would be the two-names defect waiting to come back. (Issue
// #164's rider that card-text `genre`/`tone` are NOT part of that test still holds where the question is
// asked — the labeller's, server-side; a family grouped by its members' missing art must never be called
// "melancholic fantasy", and this component no longer has an opinion about it at all.)

/**
 * How many member names the gloss NAMES before it counts the rest (side-eye se-verify-4 N7).
 *
 * The gloss joined EVERY member and let `truncate` cut it, which on the populated library ellipsised
 * mid-name on 8 of 8 plates — a column of ragged "… · Ael…" tails where the last name is always a
 * fragment. An ellipsis is only honest when what it cut is unknowable; here the count is right there, so
 * the line can end at a name boundary and say exactly how many it did not name. Two is what fits the
 * 16rem plate floor's ~150px text column beside the census clause; the plate is not the place a full roster
 * is read (the selected grouping is), and the CT pins the boundary rather than the number.
 */
const PLATE_NAME_CAP = 2;

/** The member run: a bounded, boundary-ending list — `Elara · Bram +19 more`, never a cut-off name. */
function memberNames(family: VisualFamily): string {
  const names = family.members.map((member) => member.name);
  const shown = names.slice(0, PLATE_NAME_CAP);
  const hidden = family.size - shown.length;
  return hidden > 0 ? `${shown.join(" · ")} +${hidden.toString()} more` : shown.join(" · ");
}

function plateGloss(family: VisualFamily): string {
  const members = `${family.size.toString()} ${family.size === 1 ? "member" : "members"}`;
  // ONE ANATOMY FOR EVERY PLATE (side-eye populated arm, [P2-1]). The unlabelled arm used to say
  // "grouped by portrait" here because its label slot was carrying the member run; with the label back in
  // its own slot the gloss carries the members, exactly as it does on every labelled sibling — which is
  // also what makes the two arms comparable down a column instead of reading as two different components.
  return `${members} · ${memberNames(family)}`;
}

function FamilyPlate({ family, name }: { readonly family: VisualFamily; readonly name: string }): ReactElement {
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
    // A PLATE IS A LIST ITEM (#537, corpus ARIA sweep). The grid rendered as role-less cards, so eight
    // families reached a screen reader as ONE flat run of text: no boundary to step to between plates, and
    // no way to tell where a family's NAME ended and its census ("4 members · Elara · Bram · …") began —
    // the two spans are separate elements, but nothing said the run had eight parts. The listitem supplies
    // the boundary, and with it the count, so a reader steps family by family and reads the census inside
    // the one they stopped on. Deliberately NO `aria-label` here: a named container is announced INSTEAD of
    // its content by several readers, which would delete the very meta line this is about.
    <Card className="bg-surface-raised" nested={true} role="listitem">
      <Row align="center" gap="row">
        <AvatarStack
          aria-hidden={true}
          className="shrink-0"
          items={faces}
          // Never a "+N" chip: the face strip is a bounded display of the complete grouping,
          // so a chip computed off the slice would undercount. One count, in the gloss, correct.
          max={FAMILY_FACE_SLOTS + 1}
          shape="rounded"
          size="md"
        />
        <Stack className="min-w-0 flex-1" gap="tight">
          {/* A FAMILY IS NEVER CALLED "none" (side-eye corpus re-pass #2, P3-4). The VL breakdown writes
              that token for art it could not classify, and the labeller passed it through — the audited
              library had a 21-member plate titled `none`, over a strip of `?` initials, which reads as a
              rendering fault rather than as "we could not name this group". `facetLabel` is a DISPLAY
              projection: the wire value is untouched.

              THE RULING SURVIVES; ITS INPUT CHANGED — and both texts stay, because this REVERSES the arm
              that ruling shipped (side-eye populated arm 2026-08-23, [P2-1]).
                OLD RULING (kept, and still governing): a family is never called "none" — an unnameable
                  group shows WHO IS IN IT rather than a junk token, because the member list is real
                  information and `none` reads as a rendering fault. The arm was
                  `isUnlabelled(family) ? memberNames(family) : facetLabel(family.label)`.
                WHAT REFUTED ITS PREMISE: on a 12-card library the unlabelled family genuinely had no
                  name. On the 327-card library it DOES — the server labels it `Unanalysed portraits`
                  (`domain/discovery/image-analytics/retrieve.ts`), and the Archetypes tab 30px to the
                  right renders exactly that through `facetLabel`. So the member-run arm was not rescuing
                  a nameless group; it was DISPLACING a name the payload already carried, giving one
                  family two names in one frame — a 120-character truncated run of names sitting in a
                  column of one-word labels, and a reader with no way to tell the two surfaces were
                  showing the same thing (§13 single-homing, Nielsen #4).
                RESOLUTION: `facetLabel` unconditionally. It is the SAME function that enforces the old
                  ruling — a genuinely unnameable family (`none`/`unknown`/empty) still becomes
                  "Unclassified", never the raw token — so the ruling's mechanism is untouched and only
                  its CONDITION moved: the member run is no longer the fallback for "we have no label",
                  because `facetLabel` already answers that case and answers it in the same words on both
                  surfaces. The names it displaced now ride the gloss on every plate (see `plateGloss`),
                  and the `isUnlabelled` predicate is deleted rather than left beside its replacement. */}
          <Tooltip describesTrigger={false}>
            <TooltipTrigger
              render={
                <Button
                  className="min-w-0 max-w-full justify-start"
                  intent="ghost"
                  size="sm"
                  onClick={(): void => selectCorpusArtifact({ kind: "cluster", cluster: family, visual: true, k: null, title: name })}
                >
                  <Text as="span" className="min-w-0 truncate" voice="label" ink="inherit">
                    {name}
                  </Text>
                </Button>
              }
            />
            <TooltipPopup>{name}</TooltipPopup>
          </Tooltip>
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
  const names = resolveCorpusArchetypeNames(families);
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
      {/* auto-fit at `cols="auto"`'s 16rem plate floor: a wider pane shows MORE plates, never wider ones.
          THE 13rem THIS ONCE CLAIMED WAS THE MOCK'S NUMBER, NEVER THE CODE'S, and 16rem is the right one
          (#256, measured both ends of this surface's width range in corpus-home-surface.ct.tsx — see the
          table there). A plate is an AvatarStack beside `label` + `N members · <every member name>`; the
          13rem arm does tile 2-up as the mock draws it, but at a ~150px text column, where the gloss clips
          on the CT's two-short-name fixture — the best case this component ever sees. The mock's plate does
          not carry that line. 1-up at the lead column is the honest rendering of the plate we shipped. */}
      <Grid aria-label="Visual families" cols="auto" gap="row" role="list">
        {families.map((family, index) => (
          <FamilyPlate
            family={family}
            name={names[index] ?? facetLabel(family.label)}
            key={`${family.label}-${family.members[0]?.characterId ?? family.size.toString()}`}
          />
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
