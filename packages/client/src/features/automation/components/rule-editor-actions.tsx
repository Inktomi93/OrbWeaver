import type { AutomationActionType } from "@orb/contracts/automation";
import { AUTOMATION_ACTION_ARMS_MAX, AUTOMATION_ACTION_TYPES, AUTOMATION_ARM_SCOPE, automationTriggerFor } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { SortableList } from "@orb/ui/sortable";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import type { AutosaveSession } from "#forms/editor";
import { notify } from "#lib";
import type { RuleEditorValues } from "../lib/contract/rule-editor.ts";
import { armLabel } from "../lib/rule-copy.ts";
import { newRuleAction } from "../lib/rule-editor-model.ts";
import { RuleActionFields } from "./rule-action-fields.tsx";

/** Every structural edit changes the canonical form store; the factory owns its debounce and teardown. */
export function RuleEditorActions({
  form,
  chatId,
}: {
  readonly form: AutosaveSession<RuleEditorValues>["form"];
  readonly chatId: ChatId | null;
}): ReactElement {
  const incompatibilityId = useId();
  const limitId = useId();
  const [nextType, setNextType] = useState<AutomationActionType>("set_variable");
  const available = AUTOMATION_ACTION_TYPES.filter((type) => chatId !== null || AUTOMATION_ARM_SCOPE[type] === "chat-independent");
  return (
    <form.Subscribe selector={(state): RuleEditorValues => state.values}>
      {(values): ReactElement => {
        const transformOnly = values.actions.some((action) => action.type === "transform_draft");
        const incompatible = values.actions.length > 0 && (nextType === "transform_draft") !== transformOnly;
        const full = values.actions.length >= AUTOMATION_ACTION_ARMS_MAX;
        return (
          <Stack gap="block">
            <Text>Actions run in this order</Text>
            {values.actions.length === 0 ? <Text voice="gloss">Add an action and finish its fields before this rule can be saved.</Text> : null}
            <SortableList
              items={values.actionIds}
              getItemKey={(id): string => id}
              handle={true}
              itemLabel={(id): string => {
                const index = values.actionIds.indexOf(id);
                const action = values.actions[index];
                return action === undefined ? "action" : `${index + 1}. ${armLabel(action.type)}`;
              }}
              aria-label="Rule actions"
              onReorder={(ids): void => {
                const indexes = ids.map((id) => values.actionIds.indexOf(String(id)));
                form.setFieldValue(
                  "actions",
                  indexes.flatMap((index) => values.actions[index] ?? []),
                );
                form.setFieldValue(
                  "choiceIds",
                  indexes.map((index) => values.choiceIds[index] ?? []),
                );
                form.setFieldValue(
                  "keywordIds",
                  indexes.map((index) => values.keywordIds[index] ?? []),
                );
                form.setFieldValue("actionIds", ids.map(String));
              }}
              renderItem={(_id, index): ReactElement | null => {
                const action = values.actions[index];
                if (action === undefined) {
                  return null;
                }
                return (
                  <Card>
                    <Stack gap="block">
                      <Row gap="field" align="center" className="justify-between">
                        <Text>
                          {index + 1}. {armLabel(action.type)}
                        </Text>
                        <Button
                          intent="ghost"
                          onClick={(): void => {
                            Promise.all([
                              form.removeFieldValue("actions", index),
                              form.removeFieldValue("actionIds", index),
                              form.removeFieldValue("choiceIds", index),
                              form.removeFieldValue("keywordIds", index),
                            ]).catch(() => notify.error("Couldn't remove the action."));
                          }}
                        >
                          Remove action {index + 1}
                        </Button>
                      </Row>
                      <RuleActionFields form={form} index={index} action={action} chatId={chatId} />
                    </Stack>
                  </Card>
                );
              }}
            />
            <Select
              aria-label="Action to add"
              value={nextType}
              items={available.map((type) => ({ value: type, label: armLabel(type) }))}
              onValueChange={(value): void => {
                const type = available.find((candidate) => candidate === value);
                if (type !== undefined) {
                  setNextType(type);
                }
              }}
            />
            {incompatible ? (
              <Text id={incompatibilityId} voice="gloss">
                Draft transformations cannot mix with other actions. Remove the existing actions before changing kinds.
              </Text>
            ) : null}
            {full ? (
              <Text id={limitId} voice="gloss">
                This rule has reached its action limit.
              </Text>
            ) : null}
            <Button
              disabled={incompatible || full}
              aria-describedby={[incompatible && incompatibilityId, full && limitId].filter(Boolean).join(" ") || undefined}
              onClick={(): void => {
                form.pushFieldValue("actions", newRuleAction(nextType, chatId));
                form.pushFieldValue("actionIds", crypto.randomUUID());
                form.pushFieldValue("choiceIds", []);
                form.pushFieldValue("keywordIds", []);
                if (nextType === "post_notification") {
                  form.setFieldMeta("cooldownSeconds", (meta) => ({ ...meta, isTouched: true }));
                }
                if (nextType === "transform_draft") {
                  form.setFieldValue("trigger", automationTriggerFor("turnStarted"));
                }
              }}
            >
              Add action
            </Button>
          </Stack>
        );
      }}
    </form.Subscribe>
  );
}
