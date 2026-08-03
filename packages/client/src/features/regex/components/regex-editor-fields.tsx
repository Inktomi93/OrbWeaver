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
import { Field } from "@orb/ui/field";
import { Section, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { lazy, Suspense } from "react";
import type { AppFormInstance } from "#forms";
import { REGEX_PLACEMENT_ITEMS } from "#lib";

// Lazy — CodeMirror is heavy and only this editor needs it.
const CodeEditor = lazy(() => import("@orb/ui/code-editor").then((m) => ({ default: m.CodeEditor })));

/** The placement multi-toggle items. The labels are the SHARED map (side-eye F-23): this editor used to
 *  offer the raw enum member (`USER_INPUT`) while the Transforms readout printed prose for the same stage,
 *  so one pipeline had two vocabularies and neither surface could be read against the other. */
const PLACEMENT_ITEMS = REGEX_PLACEMENT_ITEMS;

// The form these fields bind — a direct-bind form OR the autosave factory's reset-less form (nothing here
// calls `reset`, so it accepts the wider shape).
type RegexEditorForm = Omit<AppFormInstance<CreateRegexScriptInput>, "reset">;

export interface RegexEditorFieldsProps {
  readonly form: RegexEditorForm;
}

/** The regex-script field set — bound to one library row, rendered wherever the caller mounts it. */
export function RegexEditorFields({ form }: RegexEditorFieldsProps): ReactElement {
  return (
    <Stack gap="block">
      <form.AppField name="name">{(field): ReactElement => <field.TextField label="Name" />}</form.AppField>

      {/* THE PATTERN FIELD SAYS WHAT A PATTERN LOOKS LIKE (side-eye X-12): every other field on this
          editor carried a description and this one — the only field whose syntax the user can get
          WRONG — carried none, so nothing on screen said whether to type `foo` or `/foo/gi`. Both are
          accepted (`parsePatternFlags` in `@orb/kit/regex` reads the slash form and forces `g`), which
          is exactly why it had to be stated. */}
      <form.AppField name="findRegex">
        {(field): ReactElement => (
          <Field label="Find pattern" name={field.name} description="A regular expression — bare (ooc:.*) or slash-delimited with flags (/ooc:.*/gi).">
            <Suspense fallback={null}>
              <CodeEditor ariaLabel="Find pattern" value={field.state.value} onChange={(next): void => field.handleChange(next)} />
            </Suspense>
          </Field>
        )}
      </form.AppField>

      <form.AppField name="replaceString">
        {(field): ReactElement => <field.TextareaField label="Replace with" description="What each match becomes (macros allowed)." rows={3} />}
      </form.AppField>

      {/* `Runs on` IS THE ONLY HOME FOR WHERE A SCRIPT BITES (side-eye X-1 + X-2). The `markdownOnly` /
          `promptOnly` switches that used to sit under Options are GONE from this editor: they are pure
          MASKS over this very set (the executor skips a `markdownOnly` script on every non-DISPLAY leg
          and a `promptOnly` one on DISPLAY), so as independent switches they could contradict each
          other AND contradict the chips above them. They are now DERIVED from this selection at the
          save boundary — see `features/regex/lib/derive-tier-flags.ts` for the three arms and for why
          the import path is deliberately left alone. */}
      <form.AppField name="placement">
        {(field): ReactElement => <field.MultiToggleField label="Runs on" description="Which text streams this script rewrites." items={PLACEMENT_ITEMS} />}
      </form.AppField>

      <Section heading="Options">
        <form.AppField name="enabled">{(field): ReactElement => <field.SwitchField label="Enabled" />}</form.AppField>
        <form.AppField name="runOnEdit">
          {(field): ReactElement => <field.SwitchField label="Run on edit" description="Re-apply when a message is edited." />}
        </form.AppField>
      </Section>
    </Stack>
  );
}
