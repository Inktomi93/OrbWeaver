// CharacterFacetEditor — the CONTENT drill-in for one selected card-content facet. When a facet row is
// selected, the facet list is replaced by this full-width editor: a back button, header, and the field
// body. Binds the form directly (in-region, no bridge). Big multi-line text authors here; small
// inputs/selects live in the CONTEXT Field tab.

import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { FieldLayout } from "@orb/ui/field";
import { ChevronLeft, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { MacroSuggestion } from "@orb/ui/macro-textarea";
import { Markdown } from "@orb/ui/markdown";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { useColorQuotedSpeech, usePromptMacroSuggestions } from "#data";
import type { AppFormInstance } from "#forms";
import { ASSISTANT_PREFILL_WARNING } from "#lib";
import { useSpoilerBlur } from "#state";
import type { CHARACTER_CARD_FACET_IDS } from "../lib/character-card-facets.ts";
import { facetById } from "../lib/character-card-facets.ts";
import type { CharacterCardFormValues } from "../lib/character-card-form-model.ts";
import { isDepthPromptPrefill } from "../lib/character-card-form-model.ts";
import { parseExampleBlocks } from "../lib/example-messages.ts";
import type { CharacterProvenanceSectionProps } from "./character-provenance-section.tsx";
import { CharacterProvenanceSection } from "./character-provenance-section.tsx";
import { CharacterRegexScriptsField } from "./character-regex-scripts-field.tsx";

type CardForm = AppFormInstance<CharacterCardFormValues>;

type CharacterFacetId = (typeof CHARACTER_CARD_FACET_IDS)[number];

export interface CharacterFacetEditorProps {
  readonly form: CardForm;
  /** D121-E: the regex facet is a PICKER over the script library scoped to this character, not a draft
   *  array field — so the drill-in needs the row identity, not just the form. */
  readonly characterId: CharacterId;
  readonly facetId: CharacterFacetId;
  readonly trusted: boolean;
  /** The read-only provenance tail (import/refinery) — rendered under the Provenance facet's form fields. */
  readonly readOnly: CharacterProvenanceSectionProps;
  readonly onBack: () => void;
}

function spoilerClass(blur: boolean): string | undefined {
  return blur ? "select-none blur-md" : undefined;
}

export function CharacterFacetEditor({ form, characterId, facetId, trusted, readOnly, onBack }: CharacterFacetEditorProps): ReactElement {
  const facet = facetById(facetId);
  // Move focus to Back on mount — else it drops to `<body>` when the facet row unmounts.
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backRef.current?.focus();
  }, []);
  return (
    <Stack gap="section">
      <Row gap="row" align="center">
        <Button ref={backRef} intent="ghost" size="sm" onClick={onBack}>
          <Icon icon={ChevronLeft} size="sm" />
          Back
        </Button>
      </Row>

      <Stack gap="field">
        <Row gap="row" align="center">
          <Icon icon={facet.glyph} size="sm" />
          <Text size="title" weight="semibold">
            {facet.label}
          </Text>
        </Row>
        <Text size="micro" tone="muted">
          {facet.subtitle}
        </Text>
      </Stack>

      <FacetBody form={form} characterId={characterId} facetId={facetId} trusted={trusted} readOnly={readOnly} />
    </Stack>
  );
}

interface FacetBodyProps {
  readonly form: CardForm;
  readonly characterId: CharacterId;
  readonly trusted: boolean;
  readonly readOnly: CharacterProvenanceSectionProps;
  readonly spoilerBlur: boolean;
  /** MACU-2 — the `{{ }}` catalog these fields complete against: the builtins UNION the active preset's user
   *  macros. Threaded (like `spoilerBlur`) rather than read per field, because the renderer table below is a
   *  plain dispatch CALL, not a component — a hook inside one of those arrows would run conditionally on the
   *  selected facet. Card free text is rendered through the per-turn macro registry at assembly
   *  (`renderMemberField`), so a user macro really does resolve in these fields. */
  readonly suggestions: readonly MacroSuggestion[];
}

/** THE CONTENT-BODY DISPATCH — exhaustive `Record<CharacterFacetId, …>` (the house Record-not-switch
 *  dispatch, `template-drill-in.tsx`'s `CAPABILITY_RENDERERS`). A new facet id fails `tsc` HERE until it
 *  has a renderer, instead of silently falling through a switch. */
const FACET_BODY_RENDERERS: Record<CharacterFacetId, (props: FacetBodyProps) => ReactElement> = {
  description: ({ form, spoilerBlur, suggestions }) => (
    <SpoilerMacroField
      suggestions={suggestions}
      form={form}
      name="description"
      label="Description"
      hint="Who they are — the core of the card. Use {{char}}/{{user}} to self-reference."
      spoilerBlur={spoilerBlur}
      rows={16}
    />
  ),
  personality: ({ form, spoilerBlur, suggestions }) => (
    <SpoilerMacroField
      suggestions={suggestions}
      form={form}
      name="personality"
      label="Personality"
      hint="A summary of traits and temperament."
      spoilerBlur={spoilerBlur}
      rows={16}
    />
  ),
  scenario: ({ form, spoilerBlur, suggestions }) => (
    <SpoilerMacroField
      suggestions={suggestions}
      form={form}
      name="scenario"
      label="Scenario"
      hint="The setting or situation the chat opens in."
      spoilerBlur={spoilerBlur}
      rows={16}
    />
  ),
  exampleMessages: ({ form, trusted, spoilerBlur, suggestions }) => (
    <ExampleMessagesField form={form} trusted={trusted} spoilerBlur={spoilerBlur} suggestions={suggestions} />
  ),
  creatorNotes: ({ form, suggestions }) => (
    <form.AppField name="creatorNotes">
      {(field): ReactElement => (
        <field.MacroField label="Creator notes" hint="Notes for humans — never sent to the model." suggestions={suggestions} rows={8} />
      )}
    </form.AppField>
  ),
  systemPrompt: ({ form, suggestions }) => (
    <SpoilerMacroField
      suggestions={suggestions}
      form={form}
      name="systemPrompt"
      label="System prompt"
      hint="Overrides the assembled system prompt for this character."
      spoilerBlur={false}
      rows={16}
    />
  ),
  postHistoryInstructions: ({ form, suggestions }) => (
    <SpoilerMacroField
      suggestions={suggestions}
      form={form}
      name="postHistoryInstructions"
      label="Post-history instructions"
      hint="Injected after the chat history, just before the model responds."
      spoilerBlur={false}
      rows={16}
    />
  ),
  depthPrompt: ({ form, suggestions }) => <DepthPromptFacet form={form} suggestions={suggestions} />,
  regexScripts: ({ characterId }) => <CharacterRegexScriptsField characterId={characterId} />,
  provenance: ({ form, readOnly }) => <ProvenanceFacet form={form} readOnly={readOnly} />,
};

function FacetBody({
  form,
  characterId,
  facetId,
  trusted,
  readOnly,
}: {
  readonly form: CardForm;
  readonly characterId: CharacterId;
  readonly facetId: CharacterFacetId;
  readonly trusted: boolean;
  readonly readOnly: CharacterProvenanceSectionProps;
}): ReactElement {
  const spoilerBlur = useSpoilerBlur();
  const suggestions = usePromptMacroSuggestions();
  const render = FACET_BODY_RENDERERS[facetId];
  return render({ form, characterId, trusted, readOnly, spoilerBlur, suggestions });
}

/** One macro-aware field; the whole container blurs at rest when the spoiler eye is on. Per-field token
 *  counts live in the CONTEXT Field tab (one surface-level readout in the editor header), never here. */
function SpoilerMacroField({
  form,
  name,
  label,
  hint,
  spoilerBlur,
  rows,
  suggestions,
}: {
  readonly form: CardForm;
  readonly name: "description" | "personality" | "scenario" | "systemPrompt" | "postHistoryInstructions";
  readonly label: string;
  readonly hint: string;
  readonly spoilerBlur: boolean;
  readonly rows: number;
  readonly suggestions: readonly MacroSuggestion[];
}): ReactElement {
  return (
    <Stack gap="field" data-slot="character-spoiler-field" className={spoilerClass(spoilerBlur)}>
      <form.AppField name={name}>{(field): ReactElement => <field.MacroField label={label} hint={hint} suggestions={suggestions} rows={rows} />}</form.AppField>
    </Stack>
  );
}

/** Note-at-depth: the big note text + its prefill warning only — Depth/Role knobs live in the Field tab. */
function DepthPromptFacet({ form, suggestions }: { readonly form: CardForm; readonly suggestions: readonly MacroSuggestion[] }): ReactElement {
  return (
    <Stack gap="section">
      <form.AppField name="depthPromptText">
        {(field): ReactElement => (
          <field.MacroField
            label="Note text"
            hint="A recurring note spliced into history at a fixed depth. Set its depth and role in the Field panel."
            suggestions={suggestions}
            rows={16}
          />
        )}
      </form.AppField>
      <form.Subscribe selector={(s): boolean => isDepthPromptPrefill(s.values)}>
        {(prefill): ReactElement | null =>
          prefill ? (
            <Text size="micro" tone="warning">
              {ASSISTANT_PREFILL_WARNING}
            </Text>
          ) : null
        }
      </form.Subscribe>
    </Stack>
  );
}

/** The editable creator/cardVersion pair + the read-only import/refinery tail. */
function ProvenanceFacet({ form, readOnly }: { readonly form: CardForm; readonly readOnly: CharacterProvenanceSectionProps }): ReactElement {
  return (
    <Stack gap="section">
      <Section heading="Provenance">
        <FieldLayout orientation="horizontal">
          <form.AppField name="creator">{(field): ReactElement => <field.TextField label="Creator" placeholder="Optional" />}</form.AppField>
          <form.AppField name="cardVersion">{(field): ReactElement => <field.TextField label="Card version" placeholder="e.g. 1.2" />}</form.AppField>
        </FieldLayout>
      </Section>
      <CharacterProvenanceSection {...readOnly} />
    </Stack>
  );
}

/** A collapsed read-only mini-transcript with expand-to-edit swapping to the raw MacroTextarea on the same
 *  field (the parse is display-only). Blurs at rest under the spoiler eye. */
function ExampleMessagesField({
  form,
  trusted,
  spoilerBlur,
  suggestions,
}: {
  readonly form: CardForm;
  readonly trusted: boolean;
  readonly spoilerBlur: boolean;
  readonly suggestions: readonly MacroSuggestion[];
}): ReactElement {
  const [editing, setEditing] = useState(false);
  return (
    <Stack gap="field">
      <Stack gap="field" data-slot="character-spoiler-field" className={editing ? undefined : spoilerClass(spoilerBlur)}>
        {editing ? (
          <form.AppField name="exampleMessages">
            {(field): ReactElement => (
              <field.MacroField
                label="Example messages"
                hint="Sample exchanges (ST <START> blocks) teaching the model the character's voice."
                suggestions={suggestions}
                rows={16}
              />
            )}
          </form.AppField>
        ) : (
          <form.Subscribe selector={(s): string => s.values.exampleMessages}>
            {(value): ReactElement => <ExampleTranscript value={value} trusted={trusted} />}
          </form.Subscribe>
        )}
      </Stack>
      <Button type="button" size="sm" intent={editing ? "secondary" : "ghost"} aria-pressed={editing} onClick={(): void => setEditing((e) => !e)}>
        {editing ? "Done editing" : "Expand to edit"}
      </Button>
    </Stack>
  );
}

/** One Markdown block per parsed `<START>` segment. */
function ExampleTranscript({ value, trusted }: { readonly value: string; readonly trusted: boolean }): ReactElement {
  // QUOTE-1: example messages ARE transcript prose — they read with the same quoted-speech tint a chat row gets.
  const colorQuotes = useColorQuotedSpeech();
  const blocks = parseExampleBlocks(value);
  if (blocks.length === 0) {
    return <Text tone="muted">No example messages yet.</Text>;
  }
  return (
    <Stack gap="block">
      {blocks.map((block, index) => (
        <Stack
          // biome-ignore lint/suspicious/noArrayIndexKey: example blocks are a positional `<START>` array with no stable id — the index IS the identity.
          key={index}
          gap="row"
          padding="field"
          className="rounded-base border border-border"
        >
          <Markdown trust={trusted ? "trusted" : "untrusted"} mode="static" colorQuotes={colorQuotes}>
            {block}
          </Markdown>
        </Stack>
      ))}
    </Stack>
  );
}
