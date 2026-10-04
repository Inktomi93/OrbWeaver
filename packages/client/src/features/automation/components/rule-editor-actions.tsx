import type { AutomationActionType } from "@orb/contracts/automation";
import { AUTOMATION_ACTION_ARMS_MAX, AUTOMATION_ACTION_TYPES, AUTOMATION_ARM_SCOPE, automationTriggerFor } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Icon, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { SortableList } from "@orb/ui/sortable";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import type { AutosaveSession } from "#forms/editor";
import { notify } from "#lib";
import type { RuleEditorValues } from "../lib/contract/rule-editor.ts";
import { armGroups, armLabel, armTitle } from "../lib/rule-copy.ts";
import { newRuleAction } from "../lib/rule-editor-model.ts";
import { RuleActionFields } from "./rule-action-fields.tsx";

// Why a rewrite and the other kinds cannot be picked together, shown on the option it rules out.
const REWRITE_ALONE = "A rewrite cannot share its rule with other kinds of action.";

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
        const ruledOut = (type: AutomationActionType): boolean => values.actions.length > 0 && (type === "transform_draft") !== transformOnly;
        const incompatible = ruledOut(nextType);
        const full = values.actions.length >= AUTOMATION_ACTION_ARMS_MAX;
        const pickerItems = armGroups(available).map((group) => ({
          label: group.label,
          items: group.types.map((type) => ({
            value: type,
            label: armLabel(type),
            ...(ruledOut(type) ? { disabled: true, description: REWRITE_ALONE } : {}),
          })),
        }));
        return (
          <Stack gap="block">
            <Text>Actions run in this order</Text>
            {values.actions.length === 0 ? <Text voice="gloss">Add an action and finish its fields before this rule can be saved.</Text> : null}
            <SortableList
              items={values.actionIds}
              getItemKey={(id): string => id}
              // The grip sits in each card's header row, so the card keeps the pane's full width.
              handle="inline"
              // The bare noun the primitive asks for: a position here would go stale the moment the row moves.
              itemLabel={(id): string => {
                const action = values.actions[values.actionIds.indexOf(id)];
                return action === undefined ? "action" : armTitle(action.type);
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
              renderItem={(_id, index, grip): ReactElement | null => {
                const action = values.actions[index];
                if (action === undefined) {
                  return null;
                }
                return (
                  <Card>
                    <Stack gap="block">
                      <Row gap="field" align="center">
                        {grip}
                        <Text className="min-w-0 flex-1">
                          {index + 1}. {armTitle(action.type)}
                        </Text>
                        <Button
                          intent="ghost"
                          size="icon"
                          aria-label={`Remove action ${index + 1}`}
                          onClick={(): void => {
                            Promise.all([
                              form.removeFieldValue("actions", index),
                              form.removeFieldValue("actionIds", index),
                              form.removeFieldValue("choiceIds", index),
                              form.removeFieldValue("keywordIds", index),
                            ]).catch(() => notify.error("Couldn't remove the action."));
                          }}
                        >
                          <Icon icon={Trash2} size="sm" />
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
              items={pickerItems}
              onValueChange={(value): void => {
                const type = available.find((candidate) => candidate === value);
                if (type !== undefined) {
                  setNextType(type);
                }
              }}
            />
            {incompatible ? (
              <Text id={incompatibilityId} voice="gloss">
                {REWRITE_ALONE} Remove the existing actions to switch kinds.
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
