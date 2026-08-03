// The regex-script EDITOR FIELDS — one library row's AUTHORED fields: name · the find pattern (via
// `@orb/ui/code-editor` — a regex is code) · replaceString · placement · enabled · run-on-edit.
//
// MOUNTED, NOT POPPED (config-rail-spec.md §2 C-7). This was `components/regex-editor-dialog.tsx`, a
// Dialog stacked on top of the settings modal — a modal inside a modal, with its own focus-return bug
// history (side-eye X-8). The config workspace mounts the SAME fields in the CONTENT pane, so the Dialog
// shell (and the focus-return apparatus it needed) is gone while not one field changed. It moved from
// `components/` into this feature at the same time: the composite had exactly one consumer left, and
// tier 2 is for what TWO features need.
//
// THE DISPLAY/PROMPT TIER IS NOT AMONG THEM, deliberately (side-eye X-1 + X-2, 2026-08-03): `markdownOnly`
// and `promptOnly` are masks over `placement`, so authoring them beside the `Runs on` chips let one editor
// state two contradicting facts about the same script. They are derived at the save boundary now —
// `features/regex/lib/derive-tier-flags.ts` carries the reasoning and the three arms.
//
// D121-E CHANGED ITS BINDING, and that is the whole point of the reshape: it used to bind
// `regexScripts[index].*` on whichever of THREE embedded carriers was in scope, which is exactly how the
// app ended up with three editors at three capability levels. There is now ONE library row, so there is
// ONE editor at ONE capability level, and the pickers attach that row rather than authoring a fourth copy.

import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import { SubstituteFindRegex } from "@orb/kit/regex";
import { Field } from "@orb/ui/field";
import { Section, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Textarea } from "@orb/ui/textarea";
import type { ChangeEvent, ReactElement } from "react";
import { lazy, Suspense, useId } from "react";
import type { AppFormInstance } from "#forms";
import { REGEX_PLACEMENT_ITEMS } from "#lib";
import { RegexTestPanel } from "./regex-test-panel";

// Lazy — CodeMirror is heavy and only this editor needs it.
const CodeEditor = lazy(() => import("@orb/ui/code-editor").then((m) => ({ default: m.CodeEditor })));

/** The placement multi-toggle items. The labels are the SHARED map (side-eye F-23): this editor used to
 *  offer the raw enum member (`USER_INPUT`) while the Transforms readout printed prose for the same stage,
 *  so one pipeline had two vocabularies and neither surface could be read against the other. */
const PLACEMENT_ITEMS = REGEX_PLACEMENT_ITEMS;

/** ONE string for the field's visible label and the trigger's accessible name (the `params-deck` Quality
 *  pattern): jsx-a11y cannot see the Base UI Field association, and two hand-written copies of a label are
 *  two chances for a screen reader to hear something the screen does not say. */
const SUBSTITUTE_LABEL = "Macros in the find pattern";

/** `substituteRegex` — ST's "Macros in Find Regex" (its `substitute_find_regex` select). The knob was in the
 *  schema and honoured by the executor (`compilePattern` macro-substitutes the pattern in `raw`/`escaped`
 *  mode) from the day the library landed, with NO control anywhere in the app: it could only ever arrive on
 *  an imported card. Same story for `Trim out` below. The wire is ST's numeric enum, so the option VALUES
 *  are its numbers stringified (Select is string-valued) and the map back is a lookup, never a cast. */
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

/** Trim strings round-trip through ONE textarea, one per line — and the split is NOT filtered. Dropping
 *  blank lines here (as ST does, but only at its save button) would delete the newline the user just typed
 *  on an autosaving form, so the empty entry is kept: the executor skips a falsy trim string, making it
 *  inert rather than wrong. */
function splitTrimStrings(value: string): string[] {
  return value === "" ? [] : value.split("\n");
}

// The form these fields bind — a direct-bind form OR the autosave factory's reset-less form (nothing here
// calls `reset`, so it accepts the wider shape).
type RegexEditorForm = Omit<AppFormInstance<CreateRegexScriptInput>, "reset">;

export interface RegexEditorFieldsProps {
  readonly form: RegexEditorForm;
}

/** The regex-script field set — bound to one library row, rendered wherever the caller mounts it. */
export function RegexEditorFields({ form }: RegexEditorFieldsProps): ReactElement {
  const patternId = useId();
  return (
    <Stack gap="block">
      <form.AppField name="name">{(field): ReactElement => <field.TextField label="Name" />}</form.AppField>

      {/* THE PATTERN FIELD SAYS WHAT A PATTERN LOOKS LIKE (side-eye X-12): every other field on this
          editor carried a description and this one — the only field whose syntax the user can get
          WRONG — carried none, so nothing on screen said whether to type `foo` or `/foo/gi`. Both are
          accepted (`parsePatternFlags` in `@orb/kit/regex` reads the slash form and forces `g`), which
          is exactly why it had to be stated. */}
      {/* IT LOOKS AND BEHAVES LIKE A FIELD (side-eye 2026-08-03 P2). Three tells said otherwise: a 31px
          line-number gutter on a one-line regex (`setup="line"` drops it), text starting flush against the
          frame (the seal now insets `.cm-content` like an `<Input>`), and a `<label for>` that resolved to
          nothing — Base UI mints the `for` from the Field context, and CodeMirror's editable is not a
          `Field.Control`, so it pointed at an element that never mounts. `labelFor` + `contentId` make the
          association real and the label click focus the editor. */}
      <form.AppField name="findRegex">
        {(field): ReactElement => (
          <Field
            label="Find pattern"
            labelFor={patternId}
            name={field.name}
            description="A regular expression — bare (ooc:.*) or slash-delimited with flags (/ooc:.*/gi)."
          >
            <Suspense fallback={null}>
              <CodeEditor
                ariaLabel="Find pattern"
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
        {(field): ReactElement => <field.TextareaField label="Replace with" description="What each match becomes (macros allowed)." rows={3} />}
      </form.AppField>

      <form.AppField name="trimStrings">
        {(field): ReactElement => (
          <Field
            label="Trim out"
            name={field.name}
            description="Text stripped from every match before it is spliced into the replacement — one per line. Leave empty to keep matches whole."
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

      {/* `Runs on` IS THE ONLY HOME FOR WHERE A SCRIPT BITES (side-eye X-1 + X-2). The `markdownOnly` /
          `promptOnly` switches that used to sit under Options are GONE from this editor: they are pure
          MASKS over this very set (the executor skips a `markdownOnly` script on every non-DISPLAY leg
          and a `promptOnly` one on DISPLAY), so as independent switches they could contradict each
          other AND contradict the chips above them. They are now DERIVED from this selection at the
          save boundary — see `features/regex/lib/derive-tier-flags.ts` for the three arms and for why
          the import path is deliberately left alone. */}
      <form.AppField name="placement">
        {(field): ReactElement => (
          <field.MultiToggleField
            description="Which text streams this script rewrites."
            items={PLACEMENT_ITEMS}
            label="Runs on"
            // The F3 defect, stated (side-eye 2026-08-03 P2): every chip off is SAVEABLE — the schema stays
            // lenient because the card-boundary heal needs it — and the script then runs nowhere with
            // nothing on screen saying so. The row's scent says it too ("runs nowhere").
            {...(field.state.value.length === 0 ? { error: "No stream selected — this script is saved, but nothing will ever run it." } : {})}
          />
        )}
      </form.AppField>

      <Section heading="Options">
        <form.AppField name="enabled">{(field): ReactElement => <field.SwitchField label="Enabled" />}</form.AppField>
        <form.AppField name="runOnEdit">
          {(field): ReactElement => <field.SwitchField label="Run on edit" description="Re-apply when a message is edited." />}
        </form.AppField>
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

      {/* THE TESTER (see `./regex-test-panel`). It sits LAST because every field above it feeds it —
          pattern, replacement, trim list and macro mode all change what it shows — so reading the editor
          top to bottom ends on the answer.
          The children param is deliberately UNANNOTATED: react-form infers `Subscribe`'s selected type
          from the selector, and annotating the child's parameter blocks that inference (TSelected falls
          back to the whole `FormState` and the call stops typechecking). */}
      <form.Subscribe selector={(state): CreateRegexScriptInput => state.values}>{(values): ReactElement => <RegexTestPanel script={values} />}</form.Subscribe>
    </Stack>
  );
}
