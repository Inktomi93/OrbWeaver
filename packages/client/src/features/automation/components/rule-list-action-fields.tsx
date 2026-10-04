import { QUICK_REPLY_MAX_CHOICES, QUICK_REPLY_MODES } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { ENTRY_POSITIONS } from "@orb/kit/world-info";
import { Button } from "@orb/ui/button";
import { Icon, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { SortableList } from "@orb/ui/sortable";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useId, useRef } from "react";
import type { AutosaveSession } from "#forms/editor";
import { touchedFieldError } from "#forms/editor";
import { notify, removeActionName } from "#lib";
import type { RuleEditorValues } from "../lib/contract/rule-editor.ts";
import { RuleBookField } from "./rule-book-field.tsx";

/** Keywords are individual values, not a lossy trim/split textarea projection. */
export function RuleLoreFields({
  form,
  index,
  action,
  chatId,
}: {
  readonly form: AutosaveSession<RuleEditorValues>["form"];
  readonly index: number;
  readonly action: Extract<RuleEditorValues["actions"][number], { type: "insert_world_info_entry" }>;
  readonly chatId: ChatId | null;
}): ReactElement {
  return (
    <Stack gap="block">
      <form.AppField name={`actions[${index}].bookId`}>
        {(field): ReactElement => (
          <RuleBookField
            error={touchedFieldError(field.state.meta)}
            onBlur={field.handleBlur}
            chatId={chatId}
            value={field.state.value}
            onChange={field.handleChange}
          />
        )}
      </form.AppField>
      <form.AppField name={`actions[${index}].entryKey`}>
        {(field): ReactElement => <field.TextField label="Entry key" description="The same key updates the existing entry rather than adding another." />}
      </form.AppField>
      <form.Subscribe selector={(state): string[] => state.values.keywordIds[index] ?? []}>
        {(ids): ReactElement => (
          <Stack gap="tight">
            {ids.map((id, keyword) => (
              <Stack key={id} gap="tight">
                <form.AppField name={`actions[${index}].keys[${keyword}]`}>
                  {(field): ReactElement => <field.TextField label={`Keyword ${keyword + 1}`} />}
                </form.AppField>
                <Button
                  intent="ghost"
                  onClick={(): void => {
                    Promise.all([form.removeFieldValue(`actions[${index}].keys`, keyword), form.removeFieldValue(`keywordIds[${index}]`, keyword)]).catch(() =>
                      notify.error("Couldn't remove the keyword."),
                    );
                  }}
                >
                  Remove keyword {keyword + 1}
                </Button>
              </Stack>
            ))}
            <Button
              intent="ghost"
              onClick={(): void => {
                form.pushFieldValue(`actions[${index}].keys`, "");
                form.pushFieldValue(`keywordIds[${index}]`, crypto.randomUUID());
              }}
            >
              Add keyword
            </Button>
          </Stack>
        )}
      </form.Subscribe>
      <form.AppField name={`actions[${index}].contentTemplate`}>
        {(field): ReactElement => <field.MacroField label="Lore content template" suggestions={[]} />}
      </form.AppField>
      <form.AppField name={`actions[${index}].position`}>
        {(field): ReactElement => <field.SelectField label="Prompt position" items={ENTRY_POSITIONS.map((value) => ({ value, label: value }))} />}
      </form.AppField>
      {chatId === null ? (
        <Text voice="gloss">Library-wide lore writes go directly to an author-owned book; they cannot ask a chat host.</Text>
      ) : (
        <form.AppField name={`actions[${index}].confirmFirst`}>{(field): ReactElement => <field.SwitchField label="Ask the host first" />}</form.AppField>
      )}
      <Text voice="gloss">{action.keys.length} keywords. Keyword order and exact text are preserved.</Text>
    </Stack>
  );
}

interface ReplyFieldsProps {
  readonly form: AutosaveSession<RuleEditorValues>["form"];
  readonly index: number;
  readonly action: Extract<RuleEditorValues["actions"][number], { type: "surface_quick_reply" }>;
}

/** Choices keep their identity through edits and ordering without adding fields to wire actions. */
export function RuleReplyFields({ form, index, action }: ReplyFieldsProps): ReactElement {
  return (
    <form.Subscribe selector={(state): string[] => state.values.choiceIds[index] ?? []}>
      {(ids): ReactElement => <ReplyList form={form} index={index} action={action} ids={ids} />}
    </form.Subscribe>
  );
}

function ReplyList({ form, index, action, ids }: ReplyFieldsProps & { readonly ids: readonly string[] }): ReactElement {
  const emptyId = useId();
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  // A keyboard removal unmounts the focused control. Once the list re-renders, focus goes to the reply that
  // moved into the removed slot, or to Add when none did.
  const focusSlot = useRef<number | null>(null);
  useEffect(() => {
    const slot = focusSlot.current;
    if (slot === null) {
      return;
    }
    focusSlot.current = null;
    const next = ids[slot];
    (next === undefined ? addButton.current : removeButtons.current.get(next))?.focus();
  }, [ids]);
  return (
    <Stack gap="block">
      <SortableList
        items={ids}
        getItemKey={(id): string => id}
        handle="inline"
        aria-label="Quick replies"
        itemLabel={(id): string => {
          const label = action.choices[ids.indexOf(id)]?.label ?? "";
          return label.length === 0 ? `reply ${ids.indexOf(id) + 1}` : label;
        }}
        onReorder={(ordered): void => {
          form.setFieldValue(
            `actions[${index}].choices`,
            ordered.flatMap((id) => action.choices[ids.indexOf(String(id))] ?? []),
          );
          form.setFieldValue(`choiceIds[${index}]`, ordered.map(String));
        }}
        renderItem={(id, choice, grip): ReactElement | null => (
          <Stack gap="tight">
            {/* A rule between replies, not a nested card: ordered replies read as separate items. */}
            {choice > 0 ? <Separator /> : null}
            <Row gap="field" align="center">
              {grip}
              <Text className="min-w-0 flex-1">Reply {choice + 1}</Text>
              <Button
                ref={(button): void => {
                  if (button === null) {
                    removeButtons.current.delete(id);
                  } else {
                    removeButtons.current.set(id, button);
                  }
                }}
                intent="ghost"
                size="icon"
                aria-label={removeActionName(`reply ${choice + 1}`)}
                onClick={(): void => {
                  focusSlot.current = choice;
                  Promise.all([form.removeFieldValue(`actions[${index}].choices`, choice), form.removeFieldValue(`choiceIds[${index}]`, choice)]).catch(() =>
                    notify.error("Couldn't remove the reply."),
                  );
                }}
              >
                <Icon icon={Trash2} size="sm" />
              </Button>
            </Row>
            <form.AppField name={`actions[${index}].choices[${choice}].label`}>
              {(field): ReactElement => <field.TextField label={`Reply ${choice + 1} label`} />}
            </form.AppField>
            <form.AppField name={`actions[${index}].choices[${choice}].sendTemplate`}>
              {(field): ReactElement => <field.MacroField label={`Reply ${choice + 1} template`} suggestions={[]} />}
            </form.AppField>
            <form.AppField name={`actions[${index}].choices[${choice}].mode`}>
              {(field): ReactElement => (
                <field.SelectField
                  label={`Reply ${choice + 1} behavior`}
                  items={QUICK_REPLY_MODES.map((value) => ({ value, label: value === "send" ? "Send immediately" : "Put in the composer's draft" }))}
                />
              )}
            </form.AppField>
          </Stack>
        )}
      />
      {ids.length === 0 ? (
        <Text id={emptyId} voice="gloss">
          Add at least one reply, or remove this action.
        </Text>
      ) : null}
      {ids.length >= QUICK_REPLY_MAX_CHOICES ? (
        <Text voice="gloss">This action has reached its reply limit.</Text>
      ) : (
        <Button
          ref={addButton}
          intent="ghost"
          aria-describedby={ids.length === 0 ? emptyId : undefined}
          onClick={(): void => {
            form.pushFieldValue(`actions[${index}].choices`, { label: "", sendTemplate: "", mode: "send" });
            form.pushFieldValue(`choiceIds[${index}]`, crypto.randomUUID());
          }}
        >
          Add quick reply
        </Button>
      )}
    </Stack>
  );
}
