import { AUTOMATION_VARIABLE_SCOPES, automationActionSchema } from "@orb/contracts/automation";
import { PROMPT_TRANSFORM_POINTS } from "@orb/contracts/chat";
import { NOTIFICATION_RECIPIENTS } from "@orb/contracts/notifications";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronRight, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AutosaveSession } from "#forms/editor";
import type { RuleEditorValues } from "../lib/contract/rule-editor.ts";
import { RuleAnalysisFields } from "./rule-analysis-fields.tsx";
import { RuleCharacterField } from "./rule-character-field.tsx";
import { RuleImageFields } from "./rule-image-fields.tsx";
import { RuleLoreFields, RuleReplyFields } from "./rule-list-action-fields.tsx";
import { RuleToolFields } from "./rule-tool-fields.tsx";

const RECIPIENT_LABELS = {
  host: "Host",
  ["all_members"]: "All members",
  ["all_members_except_actor"]: "Everyone except the person who caused the event",
} satisfies Record<(typeof NOTIFICATION_RECIPIENTS)[number], string>;

const VARIABLE_OPERATION_LABELS = { set: "Set value", inc: "Increase", dec: "Decrease", delete: "Delete variable" } satisfies Record<
  Extract<RuleEditorValues["actions"][number], { type: "set_variable" }>["op"],
  string
>;

/** Dispatch remains exhaustive over the canonical action union. */
export function RuleActionFields({
  form,
  index,
  action,
  chatId,
}: {
  readonly form: AutosaveSession<RuleEditorValues>["form"];
  readonly index: number;
  readonly action: RuleEditorValues["actions"][number];
  readonly chatId: ChatId | null;
}): ReactElement {
  // biome-ignore-start lint/suspicious/noUnnecessaryConditions: Biome loses the imported Zod draft union; the compiler and all-action tests check this exhaustive dispatch.
  switch (action.type) {
    case "set_variable":
      return (
        <Stack gap="block">
          <form.AppField name={`actions[${index}].scope`}>
            {(field): ReactElement => (
              <field.SelectField
                label="Variable scope"
                items={AUTOMATION_VARIABLE_SCOPES.filter((scope) => chatId !== null || scope === "global").map((value) => ({
                  value,
                  label: value === "chat" ? "This chat (visible to members)" : "Rule author's global variables",
                }))}
              />
            )}
          </form.AppField>
          <form.AppField name={`actions[${index}].key`}>{(field): ReactElement => <field.TextField label="Variable name" />}</form.AppField>
          <form.AppField name={`actions[${index}].op`}>
            {(field): ReactElement => (
              <field.SelectField
                label="Operation"
                items={automationActionSchema.options[0].shape.op.options.map((value) => ({ value, label: VARIABLE_OPERATION_LABELS[value] }))}
              />
            )}
          </form.AppField>
          {action.op === "delete" ? (
            <Text voice="gloss">Delete ignores the value template. Any saved template is retained if you change operations later.</Text>
          ) : (
            <form.AppField name={`actions[${index}].value`}>
              {(field): ReactElement =>
                field.state.value === undefined ? (
                  <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange("")}>
                    <Icon icon={ChevronRight} size="sm" />
                    Add value template
                  </Button>
                ) : (
                  <Stack gap="tight">
                    <field.MacroField label="Value template" suggestions={[]} />
                    <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange(undefined)}>
                      Remove value template
                    </Button>
                  </Stack>
                )
              }
            </form.AppField>
          )}
        </Stack>
      );
    case "transform_draft":
      return (
        <Stack gap="block">
          <Text voice="gloss">
            Use {"{{draft}}"} for the current text. Only other draft transformations can share this rule; its condition has no event value.
          </Text>
          <form.AppField name={`actions[${index}].target`}>
            {(field): ReactElement => (
              <field.SelectField
                label="Transform target"
                items={PROMPT_TRANSFORM_POINTS.map((value) => ({ value, label: value === "user_input" ? "User input" : "Assembled dynamic prompt" }))}
              />
            )}
          </form.AppField>
          <form.AppField name={`actions[${index}].template`}>
            {(field): ReactElement => <field.MacroField label="Draft transformation template" suggestions={[]} />}
          </form.AppField>
        </Stack>
      );
    case "insert_world_info_entry":
      return <RuleLoreFields form={form} index={index} action={action} chatId={chatId} />;
    case "surface_quick_reply":
      return <RuleReplyFields form={form} index={index} action={action} />;
    case "post_notification":
      return (
        <Stack gap="block">
          <form.AppField name={`actions[${index}].recipient`}>
            {(field): ReactElement => (
              <field.SelectField
                label="Recipients"
                items={NOTIFICATION_RECIPIENTS.map((value) => ({
                  value,
                  label: RECIPIENT_LABELS[value],
                }))}
              />
            )}
          </form.AppField>
          <form.AppField name={`actions[${index}].messageTemplate`}>
            {(field): ReactElement => <field.MacroField label="Notification template" suggestions={[]} />}
          </form.AppField>
        </Stack>
      );
    case "trigger_turn":
      return (
        <Stack gap="block">
          <form.AppField name={`actions[${index}].speakerCharacterId`}>
            {(field): ReactElement => <RuleCharacterField label="Speaker" value={field.state.value} onChange={field.handleChange} />}
          </form.AppField>
          <form.AppField name={`actions[${index}].guidedTemplate`}>
            {(field): ReactElement =>
              field.state.value === undefined ? (
                <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange("")}>
                  <Icon icon={ChevronRight} size="sm" />
                  Add turn guidance
                </Button>
              ) : (
                <Stack gap="tight">
                  <field.MacroField label="Turn guidance" suggestions={[]} />
                  <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange(undefined)}>
                    Remove turn guidance
                  </Button>
                </Stack>
              )
            }
          </form.AppField>
          <form.AppField name={`actions[${index}].confirmFirst`}>{(field): ReactElement => <field.SwitchField label="Ask the host first" />}</form.AppField>
        </Stack>
      );
    case "generate_image":
      return <RuleImageFields form={form} index={index} chatId={chatId} />;
    case "set_chat_background":
      return (
        <Stack gap="block">
          <Text voice="gloss">The model chooses from the author's backgrounds. This does not select a background directly.</Text>
          <form.AppField name={`actions[${index}].instruction`}>
            {(field): ReactElement =>
              field.state.value === undefined ? (
                <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange("")}>
                  <Icon icon={ChevronRight} size="sm" />
                  Add background guidance
                </Button>
              ) : (
                <Stack gap="tight">
                  <field.MacroField label="Background guidance" suggestions={[]} />
                  <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange(undefined)}>
                    Remove background guidance
                  </Button>
                </Stack>
              )
            }
          </form.AppField>
          <form.AppField name={`actions[${index}].confirmFirst`}>{(field): ReactElement => <field.SwitchField label="Ask the host first" />}</form.AppField>
        </Stack>
      );
    case "run_analysis":
      return <RuleAnalysisFields form={form} index={index} action={action} chatId={chatId} />;
    case "run_tool":
      return <RuleToolFields form={form} index={index} action={action} chatId={chatId} />;
  }
  // biome-ignore-end lint/suspicious/noUnnecessaryConditions: Imported draft-union dispatch ends here.
}
