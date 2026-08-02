// CharacterFacetInspector — the CONTEXT Field-tab body. Reads the live editor form through the character
// form bridge and the drilled facet id off the character-selection store. Big multi-line text never
// authors here — this tab holds only the small detail of the selected facet (Depth/Role knobs,
// creator/version pair, or a char/token count); the body authors in CONTENT.
//
// With NO facet drilled the tab is not empty: it shows `CharacterOverviewCard`, the instrument-tier
// resting readout of the card being edited (stickler 2026-08-01 F4).

import type { CharacterId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import type { AppFormInstance } from "#forms";
import { MESSAGE_ROLE_ITEMS } from "#lib";
import { useSelectedCharacterFacetId, useSelectedCharacterId } from "#state";
import type { CHARACTER_CARD_FACET_IDS } from "../lib/character-card-facets";
import { facetById } from "../lib/character-card-facets";
import type { CharacterCardFormValues } from "../lib/character-card-form-model";
import { resolveCharacterForm, useCharacterForm } from "../lib/character-editor-bridge";
import { CharacterOverviewCard } from "./character-overview-card";
import type { CharacterProvenanceSectionProps } from "./character-provenance-section";
import { CharacterProvenanceSection } from "./character-provenance-section";

type CardForm = AppFormInstance<CharacterCardFormValues>;

type CharacterFacetId = (typeof CHARACTER_CARD_FACET_IDS)[number];

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
    <QueryBoundary
      fallback={<Text tone="muted">Loading…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="this field" onRetry={retry} />}
    >
      <InspectorLoader form={resolved.form} facetId={selectedFacetId as CharacterFacetId} characterId={characterId} />
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

interface FacetDetailProps {
  readonly form: CardForm;
  readonly readOnly: CharacterProvenanceSectionProps;
}

/** THE CONTEXT-DETAIL DISPATCH — exhaustive `Record<CharacterFacetId, …>` (the house Record-not-switch
 *  dispatch, `template-drill-in.tsx`'s `CAPABILITY_RENDERERS`). A new facet id fails `tsc` HERE until it
 *  has a renderer, instead of silently falling through a switch. */
const FACET_DETAIL_RENDERERS: Record<CharacterFacetId, (props: FacetDetailProps) => ReactElement> = {
  depthPrompt: ({ form }) => <DepthDetail form={form} />,
  provenance: ({ form, readOnly }) => <ProvenanceDetail form={form} readOnly={readOnly} />,
  regexScripts: ({ form }) => <RegexDetail form={form} />,
  creatorNotes: ({ form }) => <CountDetail form={form} name="creatorNotes" tokens={false} />,
  description: ({ form }) => <CountDetail form={form} name="description" tokens={true} />,
  personality: ({ form }) => <CountDetail form={form} name="personality" tokens={true} />,
  scenario: ({ form }) => <CountDetail form={form} name="scenario" tokens={true} />,
  exampleMessages: ({ form }) => <CountDetail form={form} name="exampleMessages" tokens={true} />,
  systemPrompt: ({ form }) => <CountDetail form={form} name="systemPrompt" tokens={true} />,
  postHistoryInstructions: ({ form }) => <CountDetail form={form} name="postHistoryInstructions" tokens={true} />,
};

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
  const render = FACET_DETAIL_RENDERERS[facetId];
  return render({ form, readOnly });
}

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
              <Text size="micro" tone="muted" className="tabular-nums">
                {value.length} characters
              </Text>
              <Text size="code" tone="muted" className="tabular-nums">
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
  readonly name: "description" | "personality" | "scenario" | "exampleMessages" | "creatorNotes" | "systemPrompt" | "postHistoryInstructions";
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
