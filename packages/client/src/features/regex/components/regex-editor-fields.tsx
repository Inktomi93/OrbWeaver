// The regex-script EDITOR FIELDS: one library row's authored fields, mounted in the config CONTENT pane.
//
// TWO AXES, TWO CONTROLS. "What it changes" picks the targets and "When it runs" picks one of four pass sets
// (`../lib/regex-when.ts`). A choice that would read none of the chosen targets is disabled with its reason, and a
// target its passes cannot read is disabled while unselected. A stored target the passes do not read stays selected
// and is named as not applying; nothing clears it. Depth and the author scope exist only beside a display or prompt choice, and run on edit only beside the
// save choice, so the controls a script cannot use are absent rather than inert. The save boundary
// (`../lib/regex-save-boundary.ts`) keeps the stored row in step with what is shown.

import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import type { RegexDepth, RegexPass, RegexTarget } from "@orb/kit/regex";
import { REGEX_DEPTH_FLOOR, REGEX_DEPTH_MAX, REGEX_TARGETS, SubstituteFindRegex } from "@orb/kit/regex";
import { CodeEditorFallback } from "@orb/ui/code-editor/fallback";
import { Field } from "@orb/ui/field";
import { Row, Section, Stack } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ChangeEvent, ReactElement } from "react";
import { lazy, Suspense, useId } from "react";
import { SettingSwitchRow } from "#components";
import type { AppFormInstance } from "#forms/editor";
import { REGEX_TARGET_ITEMS, regexPassesRead } from "#lib";
import {
  REGEX_DEPTH_CONTINUED_NAME,
  REGEX_DEPTH_FROM_NAME,
  REGEX_DEPTH_TO_NAME,
  REGEX_FIND_PATTERN_NAME,
  REGEX_NAME_FIELD_NAME,
  REGEX_REPLACE_WITH_NAME,
  REGEX_RUN_ON_EDIT_NAME,
  REGEX_TARGETS_FIELD_NAME,
  REGEX_WHEN_FIELD_NAME,
} from "../lib/regex-names.ts";
import type { RegexWhenChoice } from "../lib/regex-when.ts";
import { regexUnreadReasons, regexUnreadTargetsNote, regexWhenIsEphemeral, regexWhenItems, regexWhenOf, regexWhenPasses } from "../lib/regex-when.ts";
import { RegexAuthorScopeFields } from "./regex-author-scope-fields.tsx";
import { RegexPipelinePanel } from "./regex-pipeline-panel.tsx";
import { RegexTestPanel } from "./regex-test-panel.tsx";

// Lazy: CodeMirror is heavy and only this editor needs it.
const CodeEditor = lazy(() => import("@orb/ui/code-editor").then((m) => ({ default: m.CodeEditor })));

/** One string for the field's visible label and the trigger's accessible name: jsx-a11y cannot see the Base UI
 *  Field association. */
const SUBSTITUTE_LABEL = "Macros in the find pattern";

/** The wire is SillyTavern's numeric enum, so the option values are its numbers stringified and the map back is a
 *  lookup, never a cast. */
const SUBSTITUTE_ITEMS: readonly { readonly value: string; readonly label: string }[] = [
  { value: String(SubstituteFindRegex.none), label: "Leave macros alone" },
  { value: String(SubstituteFindRegex.raw), label: "Resolve macros first" },
  { value: String(SubstituteFindRegex.escaped), label: "Resolve macros, match them literally" },
];

const SUBSTITUTE_BY_VALUE: ReadonlyMap<string, SubstituteFindRegex> = new Map([
  [String(SubstituteFindRegex.none), SubstituteFindRegex.none],
  [String(SubstituteFindRegex.raw), SubstituteFindRegex.raw],
  [String(SubstituteFindRegex.escaped), SubstituteFindRegex.escaped],
]);

const WHEN_CHOICES_BY_VALUE: ReadonlyMap<string, RegexWhenChoice> = new Map(regexWhenItems([]).map((item) => [item.value, item.value]));

/** Trim strings round-trip through one textarea, one per line, and the split is not filtered: dropping blank lines
 *  would delete the newline the user just typed on an autosaving form. The executor skips an empty trim string. */
function splitTrimStrings(value: string): string[] {
  return value === "" ? [] : value.split("\n");
}

/** Every position, the reading of an absent depth: the floor that includes the reply being continued, no ceiling. */
const EVERY_POSITION: RegexDepth = { min: REGEX_DEPTH_FLOOR, max: null };

// The form these fields bind: a direct-bind form or the autosave factory's reset-less form.
type RegexEditorForm = Omit<AppFormInstance<CreateRegexScriptInput>, "reset">;

/** The error the when field shows for a pass set no choice spells. */
function whenError(passes: readonly RegexPass[]): string | null {
  if (passes.length === 0) {
    return "Not set: this script is saved, but nothing will ever run it.";
  }
  return regexWhenOf(passes) === null ? "This script's timing is not one of these choices. Pick one so it runs the way you expect." : null;
}

/** A target the passes cannot read is disabled while unselected, so none can be added; a selected one stays pressed so
 *  it can be removed, and the field names it as not applying. */
function targetItems(passes: readonly RegexPass[], selected: readonly RegexTarget[]): readonly { value: string; label: string; disabled: boolean }[] {
  return REGEX_TARGET_ITEMS.map((item) => ({
    value: item.value,
    label: item.label,
    disabled: passes.length > 0 && !selected.includes(item.value) && !regexPassesRead(passes, item.value),
  }));
}

/** The unread note comes first: it is the one that asks for a fix. Then the reasons for the texts that cannot be added. */
function targetsDescription(passes: readonly RegexPass[], selected: readonly RegexTarget[], blocked: readonly RegexTarget[]): string {
  return regexUnreadTargetsNote(selected, passes) ?? (blocked.length > 0 ? regexUnreadReasons(blocked) : "Which text this script rewrites.");
}

function TargetsField({ form, passes }: { readonly form: RegexEditorForm; readonly passes: readonly RegexPass[] }): ReactElement {
  return (
    <form.AppField name="targets">
      {(field): ReactElement => {
        const items = targetItems(passes, field.state.value);
        return (
          <field.MultiToggleField
            description={targetsDescription(
              passes,
              field.state.value,
              REGEX_TARGETS.filter((target) => items.some((item) => item.disabled && item.value === target)),
            )}
            items={items}
            label={REGEX_TARGETS_FIELD_NAME}
            {...(field.state.value.length === 0 ? { error: "No text selected: this script is saved, but nothing will ever run it." } : {})}
          />
        );
      }}
    </form.AppField>
  );
}

function WhenField({ form, targets }: { readonly form: RegexEditorForm; readonly targets: readonly RegexTarget[] }): ReactElement {
  const items = regexWhenItems(targets);
  return (
    <form.AppField name="passes">
      {(field): ReactElement => {
        const choice = regexWhenOf(field.state.value);
        const chosen = items.find((item) => item.value === choice);
        return (
          <Field description={chosen?.description ?? null} error={whenError(field.state.value)} label={REGEX_WHEN_FIELD_NAME} name={field.name}>
            <Select<RegexWhenChoice>
              aria-label={REGEX_WHEN_FIELD_NAME}
              items={items}
              placeholder="Pick when it runs"
              value={choice}
              onValueChange={(next: RegexWhenChoice | null): void => {
                const picked = next === null ? undefined : WHEN_CHOICES_BY_VALUE.get(next);
                if (picked !== undefined) {
                  field.handleChange(regexWhenPasses(picked));
                }
              }}
            />
          </Field>
        );
      }}
    </form.AppField>
  );
}

/** The depth bounds. Depth 0 is the newest message and counts backwards; the reply a continue extends sits before it
 *  at -1, which the switch adds while the range starts at the newest message. */
function DepthFields({ form }: { readonly form: RegexEditorForm }): ReactElement {
  return (
    <form.AppField name="depth">
      {(field): ReactElement => {
        const scope = field.state.value ?? EVERY_POSITION;
        const from = Math.max(scope.min, 0);
        return (
          <Section heading="How far back it reaches">
            <Stack gap="field">
              <Row gap="field" stackBelow="cq-28">
                <Field description="0 is the newest message." label={REGEX_DEPTH_FROM_NAME}>
                  <NumberField
                    aria-label={REGEX_DEPTH_FROM_NAME}
                    max={REGEX_DEPTH_MAX}
                    min={0}
                    onValueChange={(next: number | null): void => {
                      const min = next ?? 0;
                      // Moving the start off the newest message leaves the continued reply out with the rest.
                      field.handleChange({
                        min: min === 0 && scope.min === REGEX_DEPTH_FLOOR ? REGEX_DEPTH_FLOOR : min,
                        max: scope.max === null ? null : Math.max(scope.max, min),
                      });
                    }}
                    value={from}
                  />
                </Field>
                <Field description="Leave empty to reach the whole chat." label={REGEX_DEPTH_TO_NAME}>
                  <NumberField
                    aria-label={REGEX_DEPTH_TO_NAME}
                    max={REGEX_DEPTH_MAX}
                    min={from}
                    onValueChange={(next: number | null): void => {
                      field.handleChange({ ...scope, max: next });
                    }}
                    placeholder="no limit"
                    value={scope.max}
                  />
                </Field>
              </Row>
              {from === 0 ? (
                <SettingSwitchRow
                  checked={scope.min === REGEX_DEPTH_FLOOR}
                  description="When you ask for a reply to be continued, change that reply as well."
                  label={REGEX_DEPTH_CONTINUED_NAME}
                  onChange={(on: boolean): void => {
                    field.handleChange({ ...scope, min: on ? REGEX_DEPTH_FLOOR : 0 });
                  }}
                />
              ) : null}
            </Stack>
          </Section>
        );
      }}
    </form.AppField>
  );
}

export interface RegexEditorFieldsProps {
  readonly form: RegexEditorForm;
  /** The row id of the script being edited, or `null` before it has one; the pipeline panel needs it to find the
   *  script in the always-on set. */
  readonly scriptId: RegexScriptId | null;
}

/** The regex-script field set, bound to one library row. */
export function RegexEditorFields({ form, scriptId }: RegexEditorFieldsProps): ReactElement {
  const patternId = useId();
  return (
    <Stack gap="block">
      <form.AppField name="name">{(field): ReactElement => <field.TextField label={REGEX_NAME_FIELD_NAME} />}</form.AppField>

      {/* The pattern field says what a pattern looks like, because it is the one field whose syntax can be wrong.
          `labelFor` + `contentId` make the label reach CodeMirror's editable, which is not a `Field.Control`. */}
      <form.AppField name="findRegex">
        {(field): ReactElement => (
          <Field
            label={REGEX_FIND_PATTERN_NAME}
            labelFor={patternId}
            name={field.name}
            description="A regular expression: bare (ooc:.*) or slash-delimited with flags (/ooc:.*/gi)."
          >
            <Suspense fallback={<CodeEditorFallback value={field.state.value} />}>
              <CodeEditor
                ariaLabel={REGEX_FIND_PATTERN_NAME}
                contentId={patternId}
                onChange={(next): void => field.handleChange(next)}
                setup="line"
                value={field.state.value}
              />
            </Suspense>
          </Field>
        )}
      </form.AppField>

      <form.AppField name="replaceString">
        {(field): ReactElement => <field.TextareaField label={REGEX_REPLACE_WITH_NAME} description="What each match becomes (macros allowed)." rows={3} />}
      </form.AppField>

      <form.AppField name="trimStrings">
        {(field): ReactElement => (
          <Field
            label="Trim out"
            name={field.name}
            description="Text stripped from every match before it is spliced into the replacement. One per line. Leave empty to keep matches whole."
          >
            <Textarea
              rows={2}
              value={field.state.value.join("\n")}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => {
                field.handleChange(splitTrimStrings(event.target.value));
              }}
            />
          </Field>
        )}
      </form.AppField>

      {/* Each axis control reads the other's value, so each subscribes to that one array alone. */}
      <form.Subscribe selector={(state): readonly RegexPass[] => state.values.passes}>
        {(passes): ReactElement => <TargetsField form={form} passes={passes} />}
      </form.Subscribe>
      <form.Subscribe selector={(state): readonly RegexTarget[] => state.values.targets}>
        {(targets): ReactElement => <WhenField form={form} targets={targets} />}
      </form.Subscribe>

      <form.Subscribe selector={(state): readonly RegexPass[] => state.values.passes}>
        {(passes): ReactElement => {
          const choice = regexWhenOf(passes);
          if (choice === "save") {
            return (
              <form.AppField name="runOnEdit">
                {(field): ReactElement => <field.SwitchField label={REGEX_RUN_ON_EDIT_NAME} description="Rewrite a message again when someone edits it." />}
              </form.AppField>
            );
          }
          if (!regexWhenIsEphemeral(choice)) {
            return <Text voice="gloss">Pick when it runs to set how far back it reaches and whose messages it changes.</Text>;
          }
          return (
            <>
              <DepthFields form={form} />
              <RegexAuthorScopeFields form={form} />
            </>
          );
        }}
      </form.Subscribe>

      <Section heading="Options">
        <form.AppField name="enabled">{(field): ReactElement => <field.SwitchField label="Enabled" />}</form.AppField>
        <form.AppField name="substituteRegex">
          {(field): ReactElement => (
            <Field
              label={SUBSTITUTE_LABEL}
              name={field.name}
              description="Whether {{macros}} inside the pattern are resolved before it compiles. “Match them literally” escapes the resolved text, so a name containing . or ( still matches as written."
            >
              <Select
                aria-label={SUBSTITUTE_LABEL}
                items={SUBSTITUTE_ITEMS}
                value={String(field.state.value)}
                onValueChange={(next: string | null): void => {
                  const mode = next === null ? undefined : SUBSTITUTE_BY_VALUE.get(next);
                  if (mode !== undefined) {
                    field.handleChange(mode);
                  }
                }}
              />
            </Field>
          )}
        </form.AppField>
      </Section>

      {/* TWO PANELS, TWO QUESTIONS. "Try it" answers what the find/replace does, with the run gates open so a
          switched-off draft still previews. "In the pipeline" answers what will happen on one text at one time,
          honouring every gate. They sit last because every field above feeds them. The children parameter stays
          unannotated so react-form infers the selected type from the selector. */}
      <form.Subscribe selector={(state): CreateRegexScriptInput => state.values}>
        {(values): ReactElement => (
          <>
            <RegexTestPanel script={values} scriptId={scriptId} />
            <RegexPipelinePanel script={values} scriptId={scriptId} />
          </>
        )}
      </form.Subscribe>
    </Stack>
  );
}
