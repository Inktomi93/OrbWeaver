// The shared Regex-script editor Dialog — binds ONE library row's authored fields: name · the find pattern
// (via `@orb/ui/code-editor` — a regex is code) · replaceString · placement · enabled + the ST card-format
// leg flags.
//
// D121-E CHANGED ITS BINDING, and that is the whole point of the reshape: it used to bind
// `regexScripts[index].*` on whichever of THREE embedded carriers was in scope, which is exactly how the
// app ended up with three editors at three capability levels (the settings pane got the full dialog, the
// preset tab got the full dialog, and the character facet got four inline fields and defaulted `placement`
// to `[]` — a script that could never fire). There is now ONE library row, so there is ONE editor at ONE
// capability level, and the pickers attach that row rather than authoring a fourth copy of it.
//
// OWNER RULING (unchanged): lives client-shared (NOT @orb/ui — it composes the form factory's bound fields).

import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Field } from "@orb/ui/field";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { lazy, Suspense } from "react";
import type { AppFormInstance } from "#forms";
import { REGEX_PLACEMENT_ITEMS } from "#lib";

// Lazy — CodeMirror is heavy and this dialog is modal-only.
const CodeEditor = lazy(() => import("@orb/ui/code-editor").then((m) => ({ default: m.CodeEditor })));

/** The placement multi-toggle items. The labels are the SHARED map (side-eye F-23): this dialog used to
 *  offer the raw enum member (`USER_INPUT`) while the Transforms readout printed prose for the same stage,
 *  so one pipeline had two vocabularies and neither surface could be read against the other. */
const PLACEMENT_ITEMS = REGEX_PLACEMENT_ITEMS;

// The form the dialog binds — a direct-bind form OR the autosave factory's reset-less form (the dialog
// never calls `reset`, so it accepts the wider shape).
type RegexEditorForm = Omit<AppFormInstance<CreateRegexScriptInput>, "reset">;

export interface RegexEditorDialogProps {
  readonly form: RegexEditorForm;
  readonly onClose: () => void;
}

/** The regex-script editor — bound to one library row; closes via the caller's `onClose`. */
export function RegexEditorDialog({ form, onClose }: RegexEditorDialogProps): ReactElement {
  return (
    <Dialog
      open={true}
      onOpenChange={(next): void => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogPopup>
        <DialogTitle>Edit regex script</DialogTitle>
        <Stack gap="block" className="min-h-0 overflow-y-auto">
          <form.AppField name="name">{(field): ReactElement => <field.TextField label="Name" />}</form.AppField>

          <form.AppField name="findRegex">
            {(field): ReactElement => (
              <Field label="Find pattern" name={field.name}>
                <Suspense fallback={null}>
                  <CodeEditor ariaLabel="Find pattern" value={field.state.value} onChange={(next): void => field.handleChange(next)} />
                </Suspense>
              </Field>
            )}
          </form.AppField>

          <form.AppField name="replaceString">
            {(field): ReactElement => <field.TextareaField label="Replace with" description="What each match becomes (macros allowed)." rows={3} />}
          </form.AppField>

          <form.AppField name="placement">
            {(field): ReactElement => (
              <field.MultiToggleField label="Runs on" description="Which text streams this script applies to." items={PLACEMENT_ITEMS} />
            )}
          </form.AppField>

          <Section heading="Options">
            <form.AppField name="enabled">{(field): ReactElement => <field.SwitchField label="Enabled" />}</form.AppField>
            <form.AppField name="markdownOnly">
              {(field): ReactElement => <field.SwitchField label="Display only" description="Only affects what's shown, never the prompt." />}
            </form.AppField>
            <form.AppField name="promptOnly">
              {(field): ReactElement => <field.SwitchField label="Prompt only" description="Only affects the prompt, never the display." />}
            </form.AppField>
            <form.AppField name="runOnEdit">
              {(field): ReactElement => <field.SwitchField label="Run on edit" description="Re-apply when a message is edited." />}
            </form.AppField>
          </Section>

          <Row gap="field" justify="end">
            <DialogClose render={<Button intent="primary">Done</Button>} />
          </Row>
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}
