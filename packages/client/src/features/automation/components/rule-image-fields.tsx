import type { PromptTemplateMode } from "@orb/contracts/imagery";
import { MAX_IMAGE_COUNT, MIN_IMAGE_COUNT, MULTIMODAL_MODES, PROMPT_TEMPLATE_MODES, reusePolicySchema, SIZE_PRESET_NAMES } from "@orb/contracts/imagery";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronRight, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AutosaveSession } from "#forms/editor";
import { IMAGE_SIZE_LABELS, IMAGE_SIZE_MODE_DEFAULT } from "#lib";
import { useRemovalFocus } from "../hooks/use-removal-focus.ts";
import type { RuleEditorValues } from "../lib/contract/rule-editor.ts";
import { RuleCharacterField } from "./rule-character-field.tsx";
import { RuleOptionalField } from "./rule-optional-field.tsx";

const IMAGE_MODE_LABELS = {
  free: "Custom prompt",
  character: "Character",
  face: "Face",
  scenario: "Scene",
  background: "Background",
  ["character_multimodal"]: "Character from avatar",
  ["face_multimodal"]: "Face from avatar",
} satisfies Record<PromptTemplateMode, string>;

/** Every canonical image argument remains independently editable, including absent optional fields. */
export function RuleImageFields({
  form,
  index,
  chatId,
}: {
  readonly form: AutosaveSession<RuleEditorValues>["form"];
  readonly index: number;
  readonly chatId: ChatId | null;
}): ReactElement {
  const sizeFocus = useRemovalFocus();
  return (
    <Stack gap="block">
      <form.AppField name={`actions[${index}].mode`}>
        {(field): ReactElement => (
          <field.SelectField
            label="Image mode"
            items={(chatId === null ? MULTIMODAL_MODES : PROMPT_TEMPLATE_MODES).map((value) => ({ value, label: IMAGE_MODE_LABELS[value] }))}
          />
        )}
      </form.AppField>
      <form.AppField name={`actions[${index}].prompt`}>
        {(field): ReactElement => (
          <RuleOptionalField
            name="image prompt"
            onAdd={(): void => field.handleChange("")}
            onRemove={(): void => field.handleChange(undefined)}
            value={field.state.value}
          >
            <field.MacroField label="Image prompt" suggestions={[]} />
          </RuleOptionalField>
        )}
      </form.AppField>
      <form.AppField name={`actions[${index}].negative`}>
        {(field): ReactElement => (
          <RuleOptionalField
            name="negative prompt"
            onAdd={(): void => field.handleChange("")}
            onRemove={(): void => field.handleChange(undefined)}
            value={field.state.value}
          >
            <field.MacroField label="Negative prompt" suggestions={[]} />
          </RuleOptionalField>
        )}
      </form.AppField>
      <form.AppField name={`actions[${index}].n`}>
        {(field): ReactElement => (
          <field.NumberField
            label="Image count"
            description="Every image that comes back is a charge, and some connections make only one."
            min={MIN_IMAGE_COUNT}
            max={MAX_IMAGE_COUNT}
          />
        )}
      </form.AppField>
      <form.AppField name={`actions[${index}].size`}>
        {(field): ReactElement =>
          field.state.value === undefined ? (
            <Button ref={sizeFocus.target()} variant="ghost" justify="start" onClick={(): void => field.handleChange(SIZE_PRESET_NAMES[0])}>
              <Icon icon={ChevronRight} size="sm" />
              Choose image size
            </Button>
          ) : (
            <Stack gap="tight">
              <field.SelectField label="Image size" items={SIZE_PRESET_NAMES.map((value) => ({ value, label: IMAGE_SIZE_LABELS[value] }))} />
              <Button
                variant="ghost"
                justify="start"
                onClick={(): void => {
                  sizeFocus.arm();
                  field.handleChange(undefined);
                }}
              >
                {`Use the ${IMAGE_SIZE_MODE_DEFAULT}`}
              </Button>
            </Stack>
          )
        }
      </form.AppField>
      <form.AppField name={`actions[${index}].subjectCharacterId`}>
        {(field): ReactElement => <RuleCharacterField label="Image subject" value={field.state.value} onChange={field.handleChange} />}
      </form.AppField>
      <form.AppField name={`actions[${index}].useAvatarReference`}>
        {(field): ReactElement => <field.SwitchField label="Use the subject's avatar as a reference" />}
      </form.AppField>
      <form.AppField name={`actions[${index}].reuse`}>
        {(field): ReactElement => (
          <field.SelectField
            label="Reuse matching images"
            items={reusePolicySchema.options.map((value) => ({ value, label: value === "prefer" ? "Prefer a saved match" : "Always generate" }))}
          />
        )}
      </form.AppField>
      {chatId === null ? (
        <Text voice="gloss">Library-wide image rules use avatar-caption modes and stay quiet; no chat message is posted.</Text>
      ) : (
        <>
          <form.AppField name={`actions[${index}].quiet`}>{(field): ReactElement => <field.SwitchField label="Keep the image out of chat" />}</form.AppField>
          <form.AppField name={`actions[${index}].confirmFirst`}>{(field): ReactElement => <field.SwitchField label="Ask the host first" />}</form.AppField>
        </>
      )}
    </Stack>
  );
}
