// The shared Regex-script editor Dialog (clone-audit item 4 / item 10) — binds `regexScripts[index].*` on
// ANY direct-bind form whose values carry a `regexScripts: RegexScript[]` array: name · the find pattern
// (via `@orb/ui/code-editor` — a regex is code) · replaceString · placement · enabled + the ST card-format
// leg flags. ONE home so preset's Regex tab and the owner-global settings Regex pane consume the same dialog.
//
// OWNER RULING: lives client-shared (NOT @orb/ui — it composes the form factory's bound fields). Generic
// over the form value shape: both consumers (`PromptConfig`, the settings `{ regexScripts }` form) hold the
// array at `regexScripts`, so the field paths are identical.

import type { RegexScript } from "@orb/contracts/regex";
import { REGEX_PLACEMENTS } from "@orb/kit/regex";
import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Field } from "@orb/ui/field";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { lazy, Suspense } from "react";
import type { AppFormInstance } from "#forms";

// Lazy — CodeMirror is heavy and this dialog is modal-only.
const CodeEditor = lazy(() => import("@orb/ui/code-editor").then((m) => ({ default: m.CodeEditor })));

/** The minimal form value shape the dialog binds — any editor form carrying a `regexScripts` array. */
export interface RegexScriptsFormValues {
  readonly regexScripts: RegexScript[];
}

/** The placement multi-toggle items (`{value,label}` over the kit tuple — one source of truth). */
const PLACEMENT_ITEMS = REGEX_PLACEMENTS.map((value) => ({ value, label: value }));

// The form the dialog binds — a direct-bind form OR the autosave factory's reset-less form (the dialog
// never calls `reset`, so it accepts the wider shape; both a full `AppFormInstance` and the autosave
// factory's `Omit<…, "reset">` satisfy it).
type RegexEditorForm = Omit<AppFormInstance<RegexScriptsFormValues>, "reset">;

export interface RegexEditorDialogProps {
  readonly form: RegexEditorForm;
  /** The script index this dialog edits (`regexScripts[index].*`). */
  readonly index: number;
  readonly onClose: () => void;
}

/** The regex-script editor — bound to `regexScripts[index].*`; closes via the caller's `onClose`. */
export function RegexEditorDialog({ form, index, onClose }: RegexEditorDialogProps): ReactElement {
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
          <form.AppField name={`regexScripts[${index}].name`}>{(field): ReactElement => <field.TextField label="Name" />}</form.AppField>

          <form.AppField name={`regexScripts[${index}].findRegex`}>
            {(field): ReactElement => (
              <Field label="Find pattern" name={field.name}>
                <Suspense fallback={null}>
                  <CodeEditor ariaLabel="Find pattern" value={field.state.value} onChange={(next): void => field.handleChange(next)} />
                </Suspense>
              </Field>
            )}
          </form.AppField>

          <form.AppField name={`regexScripts[${index}].replaceString`}>
            {(field): ReactElement => <field.TextareaField label="Replace with" description="What each match becomes (macros allowed)." rows={3} />}
          </form.AppField>

          <form.AppField name={`regexScripts[${index}].placement`}>
            {(field): ReactElement => (
              <field.MultiToggleField label="Runs on" description="Which text streams this script applies to." items={PLACEMENT_ITEMS} />
            )}
          </form.AppField>

          <Section heading="Options">
            <form.AppField name={`regexScripts[${index}].enabled`}>{(field): ReactElement => <field.SwitchField label="Enabled" />}</form.AppField>
            <form.AppField name={`regexScripts[${index}].markdownOnly`}>
              {(field): ReactElement => <field.SwitchField label="Display only" description="Only affects what's shown, never the prompt." />}
            </form.AppField>
            <form.AppField name={`regexScripts[${index}].promptOnly`}>
              {(field): ReactElement => <field.SwitchField label="Prompt only" description="Only affects the prompt, never the display." />}
            </form.AppField>
            <form.AppField name={`regexScripts[${index}].runOnEdit`}>
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
