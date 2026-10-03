import { AUTOMATION_VARIABLE_SCOPES, AUTOMATION_VARIABLE_VALUE_MAX } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronRight, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import { useTRPC } from "#data";
import type { AutosaveSession } from "#forms/editor";
import { touchedFieldError } from "#forms/editor";
import type { RuleEditorValues } from "../lib/contract/rule-editor.ts";
import { ruleToolArgumentGuidance, ruleToolParameterGuidance } from "../lib/rule-tool-arguments.ts";

/** Catalog visibility is the caller's; selecting a tool never impersonates the stored rule author. */
export function RuleToolFields({
  form,
  index,
  action,
  chatId,
}: {
  readonly form: AutosaveSession<RuleEditorValues>["form"];
  readonly index: number;
  readonly action: Extract<RuleEditorValues["actions"][number], { type: "run_tool" }>;
  readonly chatId: ChatId | null;
}): ReactElement {
  const trpc = useTRPC();
  const id = useId();
  const labelId = `${id}-label`;
  const catalog = useQuery(trpc.automation.listRuleTools.queryOptions());
  const tools = catalog.data ?? [];
  const selected = tools.find((tool) => tool.name === action.name);
  const items = tools.map((tool) => ({ value: tool.name, label: tool.name }));
  if (selected === undefined && action.name.length > 0) {
    items.push({ value: action.name, label: `${action.name} (not listed for you)` });
  }
  return (
    <Stack gap="block">
      <form.AppField name={`actions[${index}].name`}>
        {(field): ReactElement => (
          <Stack gap="tight">
            <label id={labelId} htmlFor={id}>
              Tool
            </label>
            <Select
              id={id}
              aria-labelledby={labelId}
              aria-invalid={touchedFieldError(field.state.meta) !== null || undefined}
              {...(touchedFieldError(field.state.meta) === null ? {} : { "aria-describedby": `${id}-error` })}
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
            {touchedFieldError(field.state.meta) === null ? null : (
              <Text id={`${id}-error`} role="alert" className="text-destructive">
                {touchedFieldError(field.state.meta)}
              </Text>
            )}
          </Stack>
        )}
      </form.AppField>
      {catalog.isPending ? <Text voice="gloss">Loading your available tools…</Text> : null}
      {catalog.isError ? (
        <>
          <Text voice="gloss">Couldn't load your tool catalog. Existing selections are kept.</Text>
          <Button
            intent="ghost"
            onClick={(): void => {
              catalog.refetch().catch(() => undefined);
            }}
          >
            Retry tools
          </Button>
        </>
      ) : null}
      {!(catalog.isPending || catalog.isError) && tools.length === 0 ? (
        <Text voice="gloss">You have no available automation tools. Activate a plugin with a tool you have permitted.</Text>
      ) : null}
      {selected === undefined ? null : <Text voice="gloss">{selected.description}</Text>}
      <form.AppField name={`actions[${index}].argsTemplate`}>
        {(field): ReactElement => (
          <field.MacroField
            label="Argument template (JSON)"
            suggestions={[]}
            description="Arguments must become a JSON object after macros expand. Only your tools are listed; a shared rule also needs its author’s access. Test does not invoke tools or capture results."
          />
        )}
      </form.AppField>
      {action.name.length === 0 ? null : <Text voice="gloss">{ruleToolArgumentGuidance(action.argsTemplate, selected)}</Text>}
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
        intent="ghost"
        onClick={(): void => {
          catalog.refetch().catch(() => undefined);
        }}
      >
        Refresh tools
      </Button>
      <form.AppField name={`actions[${index}].resultVar`}>
        {(field): ReactElement =>
          field.state.value === undefined ? (
            <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange("")}>
              <Icon icon={ChevronRight} size="sm" />
              Capture tool result
            </Button>
          ) : (
            <Stack gap="tight">
              <field.TextField label="Result variable name" />
              <Button intent="ghost" className="justify-start" onClick={(): void => field.handleChange(undefined)}>
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
