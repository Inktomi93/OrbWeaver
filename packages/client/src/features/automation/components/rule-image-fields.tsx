import type { PromptTemplateMode } from "@orb/contracts/imagery";
import { generateImageActionArgsSchema, MULTIMODAL_MODES, PROMPT_TEMPLATE_MODES, SIZE_PRESET_NAMES } from "@orb/contracts/imagery";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronRight, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AutosaveSession } from "#forms/editor";
import type { RuleEditorValues } from "../lib/contract/rule-editor.ts";
import { RuleCharacterField } from "./rule-character-field.tsx";

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
        {(field): ReactElement =>
          field.state.value === undefined ? (
            <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange("")}>
              <Icon icon={ChevronRight} size="sm" />
              Add image prompt
            </Button>
          ) : (
            <Stack gap="tight">
              <field.MacroField label="Image prompt" suggestions={[]} />
              <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange(undefined)}>
                Remove image prompt
              </Button>
            </Stack>
          )
        }
      </form.AppField>
      <form.AppField name={`actions[${index}].negative`}>
        {(field): ReactElement =>
          field.state.value === undefined ? (
            <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange("")}>
              <Icon icon={ChevronRight} size="sm" />
              Add negative prompt
            </Button>
          ) : (
            <Stack gap="tight">
              <field.MacroField label="Negative prompt" suggestions={[]} />
              <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange(undefined)}>
                Remove negative prompt
              </Button>
            </Stack>
          )
        }
      </form.AppField>
      <form.AppField name={`actions[${index}].n`}>{(field): ReactElement => <field.NumberField label="Image count" />}</form.AppField>
      <form.AppField name={`actions[${index}].size`}>
        {(field): ReactElement =>
          field.state.value === undefined ? (
            <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange(SIZE_PRESET_NAMES[0])}>
              <Icon icon={ChevronRight} size="sm" />
              Choose image size
            </Button>
          ) : (
            <Stack gap="tight">
              <field.SelectField label="Image size" items={SIZE_PRESET_NAMES.map((value) => ({ value, label: value }))} />
              <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange(undefined)}>
                Use connection's image size
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
            items={generateImageActionArgsSchema.shape.reuse
              .unwrap()
              .options.map((value) => ({ value, label: value === "prefer" ? "Prefer a saved match" : "Always generate" }))}
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
