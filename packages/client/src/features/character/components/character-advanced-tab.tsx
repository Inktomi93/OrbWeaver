// The §6.4 Advanced tab — the quiet clerical card content (SAME form, SAME save-bar; DRAFT): prompt
// overrides (systemPrompt · postHistoryInstructions) · Note @ depth (depthPrompt {prompt,depth,role}) ·
// regexScripts · editable provenance (creator · cardVersion) · the read-only tail (import provenance,
// unrecognized-data JSON, refinery). Prompt-bearing fields carry a live token counter (§6.3).
//
// FieldLayout (owner ruling 2026-07-09 #25 — horizontal is OPT-IN per form): the SHORT label-left/
// control-right fields read better horizontal — the depth+role pair and the creator/cardVersion provenance
// pair. The long-text authoring fields (systemPrompt/postHistory/depthPrompt.prompt) stay VERTICAL.
//
// depthPrompt write guard (§6.4): assistant-role @ depth 0 is a response prefill (`cardDepthPromptWriteSchema`
// rejects it) — the editor SURFACES the message, never silently drops it.

import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { estimateTokens } from "@orb/kit/tokens";
import { FieldLayout } from "@orb/ui/field";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import type { CharacterCardFormValues } from "../lib/character-card-form-model";
import { CHARACTER_CARD_MACROS, isDepthPromptPrefill } from "../lib/character-card-form-model";
import type { CharacterProvenanceSectionProps } from "./character-provenance-section";
import { CharacterProvenanceSection } from "./character-provenance-section";
import { CharacterRegexScriptsField } from "./character-regex-scripts-field";
import { CharacterTokenCounter } from "./character-token-counter";

type CardForm = AppFormInstance<CharacterCardFormValues>;

const ROLE_LABELS: Record<(typeof MESSAGE_ROLES)[number], string> = {
  system: "System",
  user: "User",
  assistant: "Assistant",
};
const ROLE_ITEMS: SelectItems<string> = MESSAGE_ROLES.map((value) => ({
  value,
  label: ROLE_LABELS[value],
}));

export interface CharacterAdvancedTabProps {
  readonly form: CardForm;
  readonly readOnly: CharacterProvenanceSectionProps;
}

export function CharacterAdvancedTab({ form, readOnly }: CharacterAdvancedTabProps): ReactElement {
  return (
    <Stack gap="section">
      <Section heading="Prompt overrides">
        <CountedMacroField
          form={form}
          name="systemPrompt"
          label="System prompt"
          hint="Overrides the assembled system prompt for this character."
        />
        <CountedMacroField
          form={form}
          name="postHistoryInstructions"
          label="Post-history instructions"
          hint="Injected after the chat history, just before the model responds."
        />
      </Section>

      <Section heading="Note at depth">
        <form.AppField name="depthPromptText">
          {(field): ReactElement => (
            <field.MacroField
              label="Note text"
              hint="A recurring note spliced into history at a fixed depth."
              suggestions={CHARACTER_CARD_MACROS}
              rows={3}
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(s): string => s.values.depthPromptText}>
          {(text): ReactElement => <CharacterTokenCounter tokens={estimateTokens(text)} />}
        </form.Subscribe>
        <FieldLayout orientation="horizontal">
          <Row gap="field" className="flex-wrap">
            <form.AppField name="depthPromptDepth">
              {(field): ReactElement => <field.NumberField label="Depth" min={0} />}
            </form.AppField>
            <form.AppField name="depthPromptRole">
              {(field): ReactElement => <field.SelectField label="Role" items={ROLE_ITEMS} />}
            </form.AppField>
          </Row>
        </FieldLayout>
        <form.Subscribe selector={(s): boolean => isDepthPromptPrefill(s.values)}>
          {(prefill): ReactElement | null =>
            prefill ? (
              <Text size="micro" tone="warning">
                Assistant role at depth 0 is a response prefill — unsupported across providers. Use
                depth ≥ 1, or role system/user.
              </Text>
            ) : null
          }
        </form.Subscribe>
      </Section>

      <CharacterRegexScriptsField form={form} />

      <Section heading="Provenance">
        <FieldLayout orientation="horizontal">
          <form.AppField name="creator">
            {(field): ReactElement => <field.TextField label="Creator" placeholder="Optional" />}
          </form.AppField>
          <form.AppField name="cardVersion">
            {(field): ReactElement => (
              <field.TextField label="Card version" placeholder="e.g. 1.2" />
            )}
          </form.AppField>
        </FieldLayout>
      </Section>

      <CharacterProvenanceSection {...readOnly} />
    </Stack>
  );
}

/** One macro-aware prompt-override field + its live token counter. */
function CountedMacroField({
  form,
  name,
  label,
  hint,
}: {
  readonly form: CardForm;
  readonly name: "systemPrompt" | "postHistoryInstructions";
  readonly label: string;
  readonly hint: string;
}): ReactElement {
  return (
    <Stack gap="field">
      <form.AppField name={name}>
        {(field): ReactElement => (
          <field.MacroField
            label={label}
            hint={hint}
            suggestions={CHARACTER_CARD_MACROS}
            rows={5}
          />
        )}
      </form.AppField>
      <form.Subscribe selector={(s): string => s.values[name]}>
        {(value): ReactElement => <CharacterTokenCounter tokens={estimateTokens(value)} />}
      </form.Subscribe>
    </Stack>
  );
}
