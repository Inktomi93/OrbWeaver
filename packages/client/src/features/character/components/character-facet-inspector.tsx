// CharacterFacetInspector — the CONTEXT Field-tab body. Reads the live editor form through the character
// form bridge and the drilled facet id off the character-selection store. Big multi-line text never
// authors here — this tab holds only the small detail of the selected facet (Depth/Role knobs,
// creator/version pair, or a char/token count); the body authors in CONTENT.
//
// With NO facet drilled the tab is not empty: it shows `CharacterOverviewCard`, the instrument-tier
// resting readout of the card being edited (stickler 2026-08-01 F4).

import type { CharacterId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import type { LucideIcon } from "@orb/ui/icons";
import { Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, useTRPC } from "#data";
import type { AppFormInstance } from "#forms/editor";
import { MESSAGE_ROLE_ITEMS } from "#lib";
import { openConfigTo, useSelectedCharacterFacetId, useSelectedCharacterId } from "#state";
import type { CHARACTER_CARD_FACET_IDS } from "../lib/character-card-facets.ts";
import { facetById } from "../lib/character-card-facets.ts";
import type { CharacterCardFormValues } from "../lib/character-card-form-model.ts";
import { resolveCharacterForm, useCharacterForm } from "../lib/character-editor-bridge.ts";
import { CharacterOverviewCard } from "./character-overview-card.tsx";
import type { CharacterProvenanceSectionProps } from "./character-provenance-section.tsx";
import { CharacterProvenanceSection } from "./character-provenance-section.tsx";

type CardForm = AppFormInstance<CharacterCardFormValues>;

type CharacterFacetId = (typeof CHARACTER_CARD_FACET_IDS)[number];

/** The regex library's own pane + section (the Regex settings surface stamps this anchor). */
const REGEX_COLLECTION = "regex";

export interface CharacterFacetInspectorProps {
  readonly characterId: CharacterId;
}

/** The CONTEXT Field tab — resolves the bridged form + drilled facet, or shows the EmptyState. */
export function CharacterFacetInspector({ characterId }: CharacterFacetInspectorProps): ReactElement {
  const handle = useCharacterForm();
  const selectedCharacterId = useSelectedCharacterId();
  const selectedFacetId = useSelectedCharacterFacetId();

  const resolved = resolveCharacterForm(handle, selectedCharacterId);
  if (resolved === null || selectedFacetId === null) {
    return <CharacterOverviewCard characterId={characterId} />;
  }
  return (
    // THE SCROLL BOX IS THE TAB'S, NOT THE BODY'S (#1748, the #1133 hoist). The box only has a height
    // because an ancestor flex chain gives it one, and `reserveKey`'s auto-height measuring Stack severs
    // that chain wherever the scroller sits UNDER the boundary; hoisted, the measuring wrapper sits INSIDE
    // the scroller, the chain is unbroken, and the scroller survives the read.
    <Stack className="relative min-h-0 overflow-y-auto overscroll-contain">
      <QueryBoundary
        fallback={<Text voice="quiet">Loading…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="this field" onRetry={retry} />}
        reserveKey="character.facetInspector"
      >
        <InspectorLoader form={resolved.form} facetId={selectedFacetId as CharacterFacetId} characterId={characterId} />
      </QueryBoundary>
    </Stack>
  );
}

/** Read the read-only provenance tail off the cached `character.get`, then render the thin body. */
function InspectorLoader({
  form,
  facetId,
  characterId,
}: {
  readonly form: CardForm;
  readonly facetId: CharacterFacetId;
  readonly characterId: CharacterId;
}): ReactElement {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.character.get.queryOptions({ characterId }));
  const readOnly: CharacterProvenanceSectionProps = {
    importedFrom: data.importedFrom,
    importHash: data.importHash,
    extensions: data.extensions,
    residualData: data.residualData,
    refinery: data.refinery,
  };
  return <InspectorBody form={form} characterId={characterId} facetId={facetId} readOnly={readOnly} />;
}

/** The thin per-facet detail body — small knobs + counts only; the big text authors in CONTENT.
 *
 *  TWO ARMS, and which one a facet takes is a DECISION (the `CollectionContext` precedent one workspace
 *  over): `detail` is the titled header + the facet's small knobs; `none` is the honest-empty pattern for a
 *  facet whose CONTEXT would only re-say what CONTENT already renders. The `none` arm draws NO header —
 *  an `EmptyState` prints its own sentence as a title, and a heading above it is the F-12 defect (the band's
 *  name, then the body placeholder's) rebuilt one tier down. */
function InspectorBody({
  form,
  characterId,
  facetId,
  readOnly,
}: {
  readonly form: CardForm;
  readonly characterId: CharacterId;
  readonly facetId: CharacterFacetId;
  readonly readOnly: CharacterProvenanceSectionProps;
}): ReactElement {
  const facet = facetById(facetId);
  const arm = FACET_CONTEXT_ARMS[facetId];
  if (arm.kind === "none") {
    return <FacetContextEmpty arm={arm} glyph={facet.glyph} />;
  }
  return (
    <Stack gap="section">
      <Stack gap="field">
        <Text voice="promoted">{facet.label}</Text>
        <Text voice="gloss">{facet.subtitle}</Text>
      </Stack>

      {arm.render({ form, characterId, readOnly })}
    </Stack>
  );
}

/** The `none` arm's body: the collection-context grammar, verbatim — its own copy (never a host-generic
 *  "nothing selected", which over a facet that IS open would be a lie), pointing at the pane that has the
 *  thing, plus the one destination this pane can offer that CONTENT cannot. */
function FacetContextEmpty({ arm, glyph }: { readonly arm: FacetContextNone; readonly glyph: LucideIcon }): ReactElement {
  return (
    <EmptyState
      action={
        <Button intent="secondary" onClick={arm.action.run} size="sm" type="button">
          {arm.action.label}
        </Button>
      }
      description={arm.description}
      icon={<Icon icon={glyph} size="lg" />}
      title={arm.title}
    />
  );
}

interface FacetDetailProps {
  readonly form: CardForm;
  /** D121-E: the regex detail counts ATTACHED library rows, so the dispatch carries the row identity. */
  readonly characterId: CharacterId;
  readonly readOnly: CharacterProvenanceSectionProps;
}

/** A facet's CONTEXT arm — an explicit DECISION, never an absence. `none` carries the facet's OWN copy for
 *  the same reason `CollectionContext.none` does: something IS open, this facet just has nothing the CONTEXT
 *  pane can add. */
interface FacetContextNone {
  readonly kind: "none";
  readonly title: string;
  readonly description: string;
  /** The one thing the pane can still offer — a destination CONTENT does not carry. REQUIRED: an empty
   *  state with no next step is the dead end `empty-state-has-action` exists to forbid. */
  readonly action: { readonly label: string; readonly run: () => void };
}
type FacetContextArm = { readonly kind: "detail"; readonly render: (props: FacetDetailProps) => ReactElement } | FacetContextNone;

/** THE CONTEXT DISPATCH — ONE exhaustive `Record<CharacterFacetId, …>` (the house Record-not-switch
 *  dispatch, `template-drill-in.tsx`'s `CAPABILITY_RENDERERS`). A new facet id fails `tsc` HERE until it
 *  DECIDES: small knobs, or honestly nothing.
 *
 *  THE REGEX FORK, STATED (side-eye 2026-08-06 vs the X-7 ruling recorded below on `RegexDetail`). X-7 ruled
 *  that this pane's regex readout must CARRY A DESTINATION — "a readout that reports a zero and offers
 *  nothing reads as unbuilt" — and that is preserved: the action below is the same button, the same verb,
 *  the same home. What today's finding kills is the rest of the arm: with CONTENT already drawing the drill
 *  header, its subtitle and the picker's own helper, the pane's `Regex scripts` heading + repeated subtitle
 *  + "N scripts attached" made one screen say the facet's name four times and explain it three. The COUNT
 *  goes because the picker's switches ARE the count, live and per-row, ~200px to the left. */
const FACET_CONTEXT_ARMS: Record<CharacterFacetId, FacetContextArm> = {
  depthPrompt: { kind: "detail", render: ({ form }) => <DepthDetail form={form} /> },
  provenance: { kind: "detail", render: ({ form, readOnly }) => <ProvenanceDetail form={form} readOnly={readOnly} /> },
  regexScripts: {
    kind: "none",
    title: "Nothing to attach here",
    description: "Attaching and ordering this character's scripts happens in the editor on the left. Writing new ones happens in your library.",
    action: { label: "Open your script library", run: (): void => openConfigTo(REGEX_COLLECTION) },
  },
  creatorNotes: { kind: "detail", render: ({ form }) => <CountDetail form={form} name="creatorNotes" tokens={false} /> },
  description: { kind: "detail", render: ({ form }) => <CountDetail form={form} name="description" tokens={true} /> },
  personality: { kind: "detail", render: ({ form }) => <CountDetail form={form} name="personality" tokens={true} /> },
  scenario: { kind: "detail", render: ({ form }) => <CountDetail form={form} name="scenario" tokens={true} /> },
  exampleMessages: { kind: "detail", render: ({ form }) => <CountDetail form={form} name="exampleMessages" tokens={true} /> },
  systemPrompt: { kind: "detail", render: ({ form }) => <CountDetail form={form} name="systemPrompt" tokens={true} /> },
  postHistoryInstructions: { kind: "detail", render: ({ form }) => <CountDetail form={form} name="postHistoryInstructions" tokens={true} /> },
};

/** depthPrompt's SMALL knobs — the Depth stepper + Role select + the note's exact char/token count (the
 *  note TEXT authors in CONTENT; the count lives here, P5 — one surface-level readout in the editor header). */
function DepthDetail({ form }: { readonly form: CardForm }): ReactElement {
  return (
    <Stack gap="section">
      <Section heading="Injection point">
        <form.AppField name="depthPromptDepth">
          {(field): ReactElement => <field.NumberField label="Depth" description="How far back in history the note is spliced." min={0} />}
        </form.AppField>
        <form.AppField name="depthPromptRole">
          {(field): ReactElement => (
            <field.SelectField label="Role" description="Which conversation role the note is delivered with." items={MESSAGE_ROLE_ITEMS} />
          )}
        </form.AppField>
      </Section>
      <Section heading="Details">
        <form.Subscribe selector={(s): string => s.values.depthPromptText}>
          {(value): ReactElement => (
            <Row gap="block" align="center" className="flex-wrap">
              <Text voice="gloss" className="tabular-nums">
                {value.length} characters
              </Text>
              <Text voice="datumMono" className="tabular-nums">
                ~{estimateTokens(value)} tokens
              </Text>
            </Row>
          )}
        </form.Subscribe>
      </Section>
    </Stack>
  );
}

/** provenance's SMALL detail — the editable creator/version pair + the read-only import/refinery tail. */
function ProvenanceDetail({ form, readOnly }: { readonly form: CardForm; readonly readOnly: CharacterProvenanceSectionProps }): ReactElement {
  return (
    <Stack gap="section">
      <Section heading="Authoring">
        <form.AppField name="creator">{(field): ReactElement => <field.TextField label="Creator" placeholder="Optional" />}</form.AppField>
        <form.AppField name="cardVersion">{(field): ReactElement => <field.TextField label="Card version" placeholder="e.g. 1.2" />}</form.AppField>
      </Section>
      <CharacterProvenanceSection {...readOnly} />
    </Stack>
  );
}

/** A text facet's SMALL detail — a live char + optional ~token count (the body authors in CONTENT). */
function CountDetail({
  form,
  name,
  tokens,
}: {
  readonly form: CardForm;
  readonly name: "description" | "personality" | "scenario" | "exampleMessages" | "creatorNotes" | "systemPrompt" | "postHistoryInstructions";
  readonly tokens: boolean;
}): ReactElement {
  return (
    <Section heading="Details">
      <form.Subscribe selector={(s): string => s.values[name]}>
        {(value): ReactElement => (
          <Row gap="block" align="center" className="flex-wrap">
            <Text voice="gloss" className="tabular-nums">
              {value.length} characters
            </Text>
            {tokens ? (
              <Text voice="datumMono" className="tabular-nums">
                ~{estimateTokens(value)} tokens
              </Text>
            ) : null}
          </Row>
        )}
      </form.Subscribe>
    </Section>
  );
}
