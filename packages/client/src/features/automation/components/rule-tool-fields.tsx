import { AUTOMATION_VARIABLE_SCOPES, AUTOMATION_VARIABLE_VALUE_MAX } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { ChevronRight, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useSuspenseQuery, useTRPC } from "#data";
import type { AutosaveSession } from "#forms/editor";
import { touchedFieldError } from "#forms/editor";
import { RULE_CAPTURE_TOOL_RESULT_NAME, RULE_TOOL_ARGUMENTS_NAME, RULE_TOOL_FIELD_NAME } from "../lib/automation-names.ts";
import type { RuleEditorValues } from "../lib/contract/rule-editor.ts";
import { ruleToolArgumentGuidance, ruleToolParameterGuidance } from "../lib/rule-tool-arguments.ts";

type RunToolAction = Extract<RuleEditorValues["actions"][number], { type: "run_tool" }>;

/** Catalog visibility is the caller's; selecting a tool never impersonates the stored rule author. Only the tool Select and its
 *  descriptions wait on the catalog: the saved tool name and the argument template stay on screen while it loads or fails. */
export function RuleToolFields({
  form,
  index,
  action,
  chatId,
}: {
  readonly form: AutosaveSession<RuleEditorValues>["form"];
  readonly index: number;
  readonly action: RunToolAction;
  readonly chatId: ChatId | null;
}): ReactElement {
  const trpc = useTRPC();
  // The template's guidance names the selected tool's schema once the catalog is known, and says the metadata is unavailable until then.
  const { data: tools } = useQuery(trpc.automation.listRuleTools.queryOptions());
  const selected = tools?.find((tool) => tool.name === action.name);
  return (
    <Stack gap="block">
      <QueryBoundary
        resetKeys={[]}
        fallback={
          <Stack gap="tight">
            <SavedToolName name={action.name} />
            <SkeletonRows count={2} shape="line" />
          </Stack>
        }
        renderError={(_error, retry): ReactElement => (
          <Stack gap="tight">
            <SavedToolName name={action.name} />
            <QueryErrorState label="your tool catalog" onRetry={retry} />
          </Stack>
        )}
      >
        <ToolCatalogFields form={form} index={index} action={action} />
      </QueryBoundary>
      <form.AppField name={`actions[${index}].argsTemplate`}>
        {(field): ReactElement => (
          <field.MacroField
            label={RULE_TOOL_ARGUMENTS_NAME}
            suggestions={[]}
            description="Arguments must become a JSON object after macros expand. Only your tools are listed; a shared rule also needs its author’s access. Test does not invoke tools or capture results."
          />
        )}
      </form.AppField>
      {action.name.length === 0 ? null : <Text voice="gloss">{ruleToolArgumentGuidance(action.argsTemplate, selected)}</Text>}
      <form.AppField name={`actions[${index}].resultVar`}>
        {(field): ReactElement =>
          field.state.value === undefined ? (
            <Button variant="ghost" justify="start" onClick={(): void => field.handleChange("")}>
              <Icon icon={ChevronRight} size="sm" />
              {RULE_CAPTURE_TOOL_RESULT_NAME}
            </Button>
          ) : (
            <Stack gap="tight">
              <field.TextField label="Result variable name" />
              <Button variant="ghost" justify="start" onClick={(): void => field.handleChange(undefined)}>
                Stop capturing result
              </Button>
            </Stack>
          )
        }
      </form.AppField>
      {action.resultVar === undefined ? null : (
        <>
          <form.AppField name={`actions[${index}].resultScope`}>
            {(field): ReactElement => (
              <field.SelectField
                label="Result scope"
                items={AUTOMATION_VARIABLE_SCOPES.filter((scope) => chatId !== null || scope === "global").map((value) => ({
                  value,
                  label: value === "chat" ? "This chat (visible to members)" : "Rule author's global variables",
                }))}
              />
            )}
          </form.AppField>
          <Text voice="gloss">
            Captured results are data, never chat messages or templates to execute. Chat variables are room-visible; global variables belong to the rule author.
            Results are truncated to {AUTOMATION_VARIABLE_VALUE_MAX} characters.
          </Text>
        </>
      )}
    </Stack>
  );
}

/** The stored tool, named while the catalog that would list it is unknown, so an unread catalog never hides what the rule runs. */
function SavedToolName({ name }: { readonly name: string }): ReactElement | null {
  if (name.length === 0) {
    return null;
  }
  return <Text voice="gloss">Saved tool: {name}. Existing selections are kept.</Text>;
}

function ToolCatalogFields({
  form,
  index,
  action,
}: {
  readonly form: AutosaveSession<RuleEditorValues>["form"];
  readonly index: number;
  readonly action: RunToolAction;
}): ReactElement {
  const trpc = useTRPC();
  const catalog = useSuspenseQuery(trpc.automation.listRuleTools.queryOptions());
  const tools = catalog.data;
  const selected = tools.find((tool) => tool.name === action.name);
  const items = tools.map((tool) => ({ value: tool.name, label: tool.name }));
  if (selected === undefined && action.name.length > 0) {
    items.push({ value: action.name, label: `${action.name} (not listed for you)` });
  }
  return (
    <Stack gap="block">
      <form.AppField name={`actions[${index}].name`}>
        {(field): ReactElement => (
          <Field label={RULE_TOOL_FIELD_NAME} error={touchedFieldError(field.state.meta)}>
            {/* eslint-disable-next-line jsx-a11y/control-has-associated-label -- Base UI's FieldRootContext injects `aria-labelledby` at render time, as in SelectField. */}
            <Select
              onOpenChange={(open): void => {
                if (!open) {
                  field.handleBlur();
                }
              }}
              value={field.state.value || null}
              items={items}
              placeholder="Choose a tool…"
              onValueChange={(value): void => {
                if (value !== null) {
                  field.handleChange(value);
                }
              }}
            />
          </Field>
        )}
      </form.AppField>
      {tools.length === 0 ? <Text voice="gloss">You have no available automation tools. Activate a plugin with a tool you have permitted.</Text> : null}
      {selected === undefined ? null : <Text voice="gloss">{selected.description}</Text>}
      {selected === undefined ? null : (
        <Stack gap="tight">
          {ruleToolParameterGuidance(selected).map((line) => (
            <Text key={line} voice="gloss">
              {line}
            </Text>
          ))}
        </Stack>
      )}
      <Button
        variant="ghost"
        onClick={(): void => {
          catalog.refetch().catch(() => undefined);
        }}
      >
        Refresh tools
      </Button>
    </Stack>
  );
}
