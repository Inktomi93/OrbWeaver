import { ANALYSIS_APPLY_MODES } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronRight, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { SettingSwitchRow } from "#components";
import type { AutosaveSession } from "#forms/editor";
import { touchedFieldError } from "#forms/editor";
import type { RuleEditorValues } from "../lib/contract/rule-editor.ts";
import { RuleBookField } from "./rule-book-field.tsx";

const APPLY_ITEMS = ANALYSIS_APPLY_MODES.map((value) => ({ value, label: value === "direct" ? "Apply directly" : "Ask the host first" }));

/** Route absence is the output gate; disabling a route removes it from the authored action. */
export function RuleAnalysisFields({
  form,
  index,
  action,
  chatId,
}: {
  readonly form: AutosaveSession<RuleEditorValues>["form"];
  readonly index: number;
  readonly action: Extract<RuleEditorValues["actions"][number], { type: "run_analysis" }>;
  readonly chatId: ChatId | null;
}): ReactElement {
  const confirmations =
    Number(action.routes.steer?.apply === "confirm") +
    Number(action.routes.lore?.apply === "confirm") +
    Number(action.routes.suggest !== undefined) +
    Number(action.routes.rewrite !== undefined);
  return (
    <Stack gap="block">
      <form.AppField name={`actions[${index}].brief`}>{(field): ReactElement => <field.MacroField label="Analysis brief" suggestions={[]} />}</form.AppField>
      <form.AppField name={`actions[${index}].steer`}>
        {(field): ReactElement =>
          field.state.value === undefined ? (
            <Button variant="ghost" className="justify-start" onClick={(): void => field.handleChange("")}>
              <Icon icon={ChevronRight} size="sm" />
              Add standing direction
            </Button>
          ) : (
            <Stack gap="tight">
              <field.MacroField label="Standing direction" suggestions={[]} />
              <Button variant="ghost" className="justify-start" onClick={(): void => field.handleChange(undefined)}>
                Remove standing direction
              </Button>
            </Stack>
          )
        }
      </form.AppField>
      <Text voice="gloss">
        Enable at least one output route. Only one route may ask for confirmation. Analysis is unavailable while this chat has an active game.
      </Text>
      {confirmations > 1 ? <Text role="alert">More than one route asks for confirmation. Choose only one.</Text> : null}
      <Stack gap="block" role="group" aria-label="Outputs">
        <Text voice="label">Outputs</Text>
        <form.AppField name={`actions[${index}].routes.steer`}>
          {(field): ReactElement => (
            <SettingSwitchRow
              label="Guidance"
              checked={field.state.value !== undefined}
              onChange={(checked): void => field.handleChange(checked ? { apply: "direct" } : undefined)}
            />
          )}
        </form.AppField>
        {action.routes.steer === undefined ? null : (
          <form.AppField name={`actions[${index}].routes.steer.apply`}>
            {(field): ReactElement => <field.SelectField label="Guidance application" items={APPLY_ITEMS} />}
          </form.AppField>
        )}
        <form.AppField name={`actions[${index}].routes.lore`}>
          {(field): ReactElement => (
            <SettingSwitchRow
              label="World book"
              checked={field.state.value !== undefined}
              onChange={(checked): void => field.handleChange(checked ? { apply: "confirm", bookId: "" } : undefined)}
            />
          )}
        </form.AppField>
        {action.routes.lore === undefined ? null : (
          <>
            <form.AppField name={`actions[${index}].routes.lore.bookId`}>
              {(field): ReactElement => (
                <RuleBookField
                  error={touchedFieldError(field.state.meta)}
                  onBlur={field.handleBlur}
                  chatId={chatId}
                  value={field.state.value ?? ""}
                  onChange={field.handleChange}
                />
              )}
            </form.AppField>
            <form.AppField name={`actions[${index}].routes.lore.apply`}>
              {(field): ReactElement => <field.SelectField label="World book application" items={APPLY_ITEMS} />}
            </form.AppField>
          </>
        )}
        <form.AppField name={`actions[${index}].routes`}>
          {(field): ReactElement => (
            <Stack gap="tight">
              <SettingSwitchRow
                label="Suggested turns"
                checked={action.routes.suggest !== undefined}
                onChange={(checked): void => {
                  const { suggest: _removed, ...rest } = action.routes;
                  field.handleChange(checked ? { ...rest, suggest: {} } : rest);
                }}
              />
              <SettingSwitchRow
                label="Rewrite suggestions"
                checked={action.routes.rewrite !== undefined}
                onChange={(checked): void => {
                  const { rewrite: _removed, ...rest } = action.routes;
                  field.handleChange(checked ? { ...rest, rewrite: {} } : rest);
                }}
              />
            </Stack>
          )}
        </form.AppField>
        <form.AppField name={`actions[${index}].routes.vars`}>
          {(field): ReactElement => (
            <SettingSwitchRow
              label="Score variable"
              checked={field.state.value !== undefined}
              onChange={(checked): void => field.handleChange(checked ? { key: "" } : undefined)}
            />
          )}
        </form.AppField>
        {action.routes.vars === undefined ? null : (
          <form.AppField name={`actions[${index}].routes.vars.key`}>
            {(field): ReactElement => (
              <field.TextField
                label="Score variable name"
                description="Only the bounded numeric score is published to chat variables, not the analysis prose."
              />
            )}
          </form.AppField>
        )}
      </Stack>
    </Stack>
  );
}
