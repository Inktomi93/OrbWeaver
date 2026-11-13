import { AUTOMATION_RULE_MAX_FIRES_PER_HOUR, automationTriggerFor, CHAT_TRIGGER_TYPES, DOMAIN_TRIGGER_TYPES, LIVE_TRIGGERS } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { Field } from "@orb/ui/field";
import { Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import type { ReactElement } from "react";
import { SettingSwitchRow } from "#components";
import type { AutosaveSession } from "#forms/editor";
import { RULE_INCLUDE_AUTOMATION_EVENTS_NAME, RULE_NAME_FIELD_NAME } from "../lib/automation-names.ts";
import type { RuleEditorValues } from "../lib/contract/rule-editor.ts";
import { triggerLabel } from "../lib/rule-copy.ts";
import { RuleOptionalField } from "./rule-optional-field.tsx";

/** Scope never changes through an authored update; the trigger choices reflect that scope. */
export function RuleEditorSettings({
  form,
  chatId,
}: {
  readonly form: AutosaveSession<RuleEditorValues>["form"];
  readonly chatId: ChatId | null;
}): ReactElement {
  const triggers = chatId === null ? DOMAIN_TRIGGER_TYPES : [...CHAT_TRIGGER_TYPES, ...DOMAIN_TRIGGER_TYPES];
  return (
    <Stack gap="block">
      <form.AppField name="name">{(field): ReactElement => <field.TextField label={RULE_NAME_FIELD_NAME} />}</form.AppField>
      <form.AppField name="description">
        {(field): ReactElement => (
          <RuleOptionalField
            name="description"
            onAdd={(): void => field.handleChange("")}
            onRemove={(): void => field.handleChange(null)}
            value={field.state.value}
          >
            <field.TextareaField label="Description" />
          </RuleOptionalField>
        )}
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
                <Field
                  label="When"
                  description={
                    <>
                      {transformOnly ? "Rewrites apply when a reply starts." : "Only supported events are listed."}
                      {unavailable ? " The stored event is unavailable for this rule. Choose a supported event before saving." : null}
                    </>
                  }
                >
                  {/* eslint-disable-next-line jsx-a11y/control-has-associated-label -- the label association flows through Base UI's FieldRootContext at render time, the same as `SelectField`. */}
                  <Select
                    value={field.state.value.type}
                    items={items}
                    onValueChange={(next): void => {
                      const type = allowed.find((candidate) => candidate === next);
                      if (type !== undefined) {
                        field.handleChange(automationTriggerFor(type));
                      }
                    }}
                  />
                </Field>
              );
            }}
          </form.AppField>
        )}
      </form.Subscribe>
      <form.AppField name="predicateCel">
        {(field): ReactElement => (
          <RuleOptionalField
            name="condition"
            onAdd={(): void => field.handleChange("")}
            onRemove={(): void => field.handleChange(null)}
            value={field.state.value}
          >
            <field.TextareaField
              label="Condition (CEL)"
              description={
                chatId === null
                  ? "Library rules cannot read chat, vars or choice. Global variables belong to the rule author."
                  : "A CEL expression filters matching events. A rewrite's condition cannot read the event."
              }
            />
          </RuleOptionalField>
        )}
      </form.AppField>
      <form.AppField name="matchAutomationEvents">
        {(field): ReactElement => (
          // The ruled switch row (label left, control right), so a described switch does not stack a third line under the single-line fields.
          <SettingSwitchRow
            label={RULE_INCLUDE_AUTOMATION_EVENTS_NAME}
            description="Off by default. When on, the existing depth cap still stops recursive chains."
            checked={field.state.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
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
