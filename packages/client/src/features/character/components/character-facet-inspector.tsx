// CharacterFacetInspector — the CONTEXT Field-tab body (character-editor redesign; from
// preset-section-inspector.tsx, DELIBERATELY THINNER). It reads the live editor form through THE CHARACTER
// FORM BRIDGE (`useCharacterForm()` — CONTENT + CONTEXT are sibling shell regions, no shared React ancestor)
// and the drilled facet id off the character-selection store. The guard (`resolveCharacterForm`) gates on
// handle-present + character-match — no facet-id staleness (the facet set is a static registry) — yielding
// the EmptyState, never a throw.
//
// HARD RULE (owner): big multi-line text NEVER authors here (it authors in CONTENT's drill-in). This tab
// holds only the SMALL detail of the selected facet:
//   • depthPrompt → the Depth stepper + Role select (the small knobs; the note TEXT stays in CONTENT).
//   • provenance  → the editable creator/version pair + the read-only import/refinery tail.
//   • every other facet → a live char/token count (a text facet's small metadata; the body is in CONTENT).

import type { CharacterId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, useTRPC } from "#data";
import type { AppFormInstance } from "#forms";
import { MESSAGE_ROLE_ITEMS } from "#lib";
import { useSelectedCharacterFacetId, useSelectedCharacterId } from "#state";
import type { CHARACTER_CARD_FACET_IDS } from "../lib/character-card-facets";
import { facetById } from "../lib/character-card-facets";
import type { CharacterCardFormValues } from "../lib/character-card-form-model";
import { useCharacterForm } from "../lib/character-editor-bridge";
import type { CharacterProvenanceSectionProps } from "./character-provenance-section";
import { CharacterProvenanceSection } from "./character-provenance-section";

type CardForm = AppFormInstance<CharacterCardFormValues>;

/** The facet-id union — DERIVED from the imported canonical tuple (§7.5). File-local, used for this file's
 *  explicit `switch` param types (an explicit param type is what lets biome's `noUnnecessaryConditions`
 *  follow the union through the switch). */
type CharacterFacetId = (typeof CHARACTER_CARD_FACET_IDS)[number];

export interface CharacterFacetInspectorProps {
  /** The selected character — the route passes it (the read-only provenance tail is read off
   *  `character.get`, cached by the editor). */
  readonly characterId: CharacterId;
}

/** The CONTEXT Field tab — resolves the bridged form + drilled facet, or shows the EmptyState. */
export function CharacterFacetInspector({
  characterId,
}: CharacterFacetInspectorProps): ReactElement {
  const handle = useCharacterForm();
  const selectedCharacterId = useSelectedCharacterId();
  const selectedFacetId = useSelectedCharacterFacetId();

  if (
    handle === null ||
    selectedCharacterId === null ||
    handle.characterId !== selectedCharacterId ||
    selectedFacetId === null
  ) {
    return <SelectFacet />;
  }
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading…</Text>}
      renderError={(_error, retry): ReactElement => (
        <Text tone="muted">
          Couldn't load this field.{" "}
          <Button intent="ghost" onClick={retry}>
            Retry
          </Button>
        </Text>
      )}
    >
      <InspectorLoader
        form={handle.form}
        facetId={selectedFacetId as CharacterFacetId}
        characterId={characterId}
      />
    </QueryBoundary>
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
  return <InspectorBody form={form} facetId={facetId} readOnly={readOnly} />;
}

function SelectFacet(): ReactElement {
  return (
    <EmptyState
      title="Open a field to inspect it"
      description="Pick a field from the list to edit its details here."
    />
  );
}

/** The thin per-facet detail body — small knobs + counts only; the big text authors in CONTENT. */
function InspectorBody({
  form,
  facetId,
  readOnly,
}: {
  readonly form: CardForm;
  readonly facetId: CharacterFacetId;
  readonly readOnly: CharacterProvenanceSectionProps;
}): ReactElement {
  const facet = facetById(facetId);
  return (
    <Stack gap="section" className="min-h-0 overflow-y-auto">
      <Stack gap="field">
        <Text size="title" weight="semibold">
          {facet.label}
        </Text>
        <Text size="micro" tone="muted">
          {facet.subtitle}
        </Text>
      </Stack>

      <FacetDetail form={form} facetId={facetId} readOnly={readOnly} />
    </Stack>
  );
}

/** The small detail per facet (owner's hard rule — no big text here). */
function FacetDetail({
  form,
  facetId,
  readOnly,
}: {
  readonly form: CardForm;
  readonly facetId: CharacterFacetId;
  readonly readOnly: CharacterProvenanceSectionProps;
}): ReactElement {
  switch (facetId) {
    case "depthPrompt":
      return <DepthDetail form={form} />;
    case "provenance":
      return <ProvenanceDetail form={form} readOnly={readOnly} />;
    case "regexScripts":
      return <RegexDetail form={form} />;
    case "creatorNotes":
      return <CountDetail form={form} name="creatorNotes" tokens={false} />;
    default:
      return <CountDetail form={form} name={facetId} tokens={true} />;
  }
}

/** depthPrompt's SMALL knobs — the Depth stepper + Role select (the note TEXT authors in CONTENT). */
function DepthDetail({ form }: { readonly form: CardForm }): ReactElement {
  return (
    <Section heading="Injection point">
      <form.AppField name="depthPromptDepth">
        {(field): ReactElement => (
          <field.NumberField
            label="Depth"
            description="How far back in history the note is spliced."
            min={0}
          />
        )}
      </form.AppField>
      <form.AppField name="depthPromptRole">
        {(field): ReactElement => (
          <field.SelectField
            label="Role"
            description="Which conversation role the note is delivered with."
            items={MESSAGE_ROLE_ITEMS}
          />
        )}
      </form.AppField>
    </Section>
  );
}

/** provenance's SMALL detail — the editable creator/version pair + the read-only import/refinery tail. */
function ProvenanceDetail({
  form,
  readOnly,
}: {
  readonly form: CardForm;
  readonly readOnly: CharacterProvenanceSectionProps;
}): ReactElement {
  return (
    <Stack gap="section">
      <Section heading="Authoring">
        <form.AppField name="creator">
          {(field): ReactElement => <field.TextField label="Creator" placeholder="Optional" />}
        </form.AppField>
        <form.AppField name="cardVersion">
          {(field): ReactElement => <field.TextField label="Card version" placeholder="e.g. 1.2" />}
        </form.AppField>
      </Section>
      <CharacterProvenanceSection {...readOnly} />
    </Stack>
  );
}

/** regexScripts' SMALL detail — the count of scripts (the scripts author in CONTENT). */
function RegexDetail({ form }: { readonly form: CardForm }): ReactElement {
  return (
    <Section heading="Scripts">
      <form.Subscribe selector={(s): number => s.values.regexScripts.length}>
        {(count): ReactElement => (
          <Text size="micro" tone="muted">
            {count} {count === 1 ? "script" : "scripts"} on this card.
          </Text>
        )}
      </form.Subscribe>
    </Section>
  );
}

/** A text facet's SMALL detail — a live char + optional ~token count (the body authors in CONTENT). */
function CountDetail({
  form,
  name,
  tokens,
}: {
  readonly form: CardForm;
  readonly name:
    | "description"
    | "personality"
    | "scenario"
    | "exampleMessages"
    | "creatorNotes"
    | "systemPrompt"
    | "postHistoryInstructions";
  readonly tokens: boolean;
}): ReactElement {
  return (
    <Section heading="Details">
      <form.Subscribe selector={(s): string => s.values[name]}>
        {(value): ReactElement => (
          <Row gap="block" align="center" className="flex-wrap">
            <Text size="micro" tone="muted" className="tabular-nums">
              {value.length} characters
            </Text>
            {tokens ? (
              <Text size="code" tone="muted" className="tabular-nums">
                ~{estimateTokens(value)} tokens
              </Text>
            ) : null}
          </Row>
        )}
      </form.Subscribe>
    </Section>
  );
}
