import { AUTOMATION_RULE_MAX_FIRES_PER_HOUR, automationTriggerFor, CHAT_TRIGGER_TYPES, DOMAIN_TRIGGER_TYPES, LIVE_TRIGGERS } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronRight, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId } from "react";
import type { AutosaveSession } from "#forms/editor";
import type { RuleEditorValues } from "../lib/contract/rule-editor.ts";
import { triggerLabel } from "../lib/rule-copy.ts";

/** Scope never changes through an authored update; the trigger choices reflect that scope. */
export function RuleEditorSettings({
  form,
  chatId,
}: {
  readonly form: AutosaveSession<RuleEditorValues>["form"];
  readonly chatId: ChatId | null;
}): ReactElement {
  const triggerId = useId();
  const labelId = `${triggerId}-label`;
  const triggers = chatId === null ? DOMAIN_TRIGGER_TYPES : [...CHAT_TRIGGER_TYPES, ...DOMAIN_TRIGGER_TYPES];
  return (
    <Stack gap="block">
      <form.AppField name="name">{(field): ReactElement => <field.TextField label="Rule name" />}</form.AppField>
      <form.AppField name="description">
        {(field): ReactElement =>
          field.state.value === null ? (
            <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange("")}>
              <Icon icon={ChevronRight} size="sm" />
              Add description
            </Button>
          ) : (
            <Stack gap="tight">
              <field.TextareaField label="Description" />
              <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange(null)}>
                Remove description
              </Button>
            </Stack>
          )
        }
      </form.AppField>
      <form.Subscribe selector={(state): boolean => state.values.actions.some((action) => action.type === "transform_draft")}>
        {(transformOnly): ReactElement => (
          <form.AppField name="trigger">
            {(field): ReactElement => {
              const allowed = triggers.filter((type) => LIVE_TRIGGERS[type] && (!transformOnly || type === "turnStarted"));
              const items = allowed.map((value) => ({ value, label: triggerLabel(value) }));
              const unavailable = !items.some((item) => item.value === field.state.value.type);
              if (unavailable) {
                items.push({ value: field.state.value.type, label: `${triggerLabel(field.state.value.type)} (unavailable)` });
              }
              return (
                <Stack gap="tight">
                  <label id={labelId} htmlFor={triggerId}>
                    When
                  </label>
                  <Select
                    id={triggerId}
                    aria-labelledby={labelId}
                    value={field.state.value.type}
                    items={items}
                    onValueChange={(next): void => {
                      const type = allowed.find((candidate) => candidate === next);
                      if (type !== undefined) {
                        field.handleChange(automationTriggerFor(type));
                      }
                    }}
                  />
                  <Text voice="gloss">{transformOnly ? "Rewrites apply when a reply starts." : "Only supported events are listed."}</Text>
                  {unavailable ? <Text voice="gloss">The stored event is unavailable for this rule. Choose a supported event before saving.</Text> : null}
                </Stack>
              );
            }}
          </form.AppField>
        )}
      </form.Subscribe>
      <form.AppField name="predicateCel">
        {(field): ReactElement =>
          field.state.value === null ? (
            <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange("")}>
              <Icon icon={ChevronRight} size="sm" />
              Add condition
            </Button>
          ) : (
            <Stack gap="tight">
              <field.TextareaField
                label="Condition (CEL)"
                description={
                  chatId === null
                    ? "Library rules cannot read chat, vars or choice. Global variables belong to the rule author."
                    : "A CEL expression filters matching events. A rewrite's condition cannot read the event."
                }
              />
              <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange(null)}>
                Remove condition
              </Button>
            </Stack>
          )
        }
      </form.AppField>
      <form.AppField name="matchAutomationEvents">
        {(field): ReactElement => (
          <field.SwitchField
            label="Include events caused by automation"
            description="Off by default. When on, the existing depth cap still stops recursive chains."
          />
        )}
      </form.AppField>
      <form.AppField name="cooldownSeconds">{(field): ReactElement => <field.NumberField label="Cooldown (seconds)" min={0} />}</form.AppField>
      <form.AppField name="maxFiresPerHour">
        {(field): ReactElement => <field.NumberField label="Maximum runs per hour" min={0} max={AUTOMATION_RULE_MAX_FIRES_PER_HOUR} />}
      </form.AppField>
    </Stack>
  );
}
