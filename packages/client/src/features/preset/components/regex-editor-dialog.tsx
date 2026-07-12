// The Regex editor Dialog (BUILD-SPEC §8) — binds `regexScripts[i].*` (the `regexScriptSchema`) on the
// direct-bind form: name · the FIND pattern (via `@orb/ui/code-editor`, per spec) · replaceString ·
// placement (the multi-toggle over `REGEX_PLACEMENTS`) · enabled + the ST card-format leg flags. Every
// field round-trips through the editor's Save (the merge flip carries `edited.regexScripts`).
//
// The find pattern is the code-editor (mono + diagnostics layer) rather than a plain input — a regex is
// code. It is controlled (value/onChange), so it's wired through the array-item `form.AppField` by hand.

import type { PromptConfig } from "@orb/contracts/preset";
import { REGEX_PLACEMENTS } from "@orb/kit/regex";
import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Field } from "@orb/ui/field";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver misses react's lazy/Suspense named exports (main.tsx precedent).
import { lazy, Suspense } from "react";
import type { AppFormInstance } from "#forms";

// Lazy — CodeMirror is heavy and this dialog is modal-only; lazying its editor (matching theme-editor's
// CssEditorField) is the last static importer to convert so @orb/ui/code-editor splits out of the entry
// chunk (P1 bundle fix).
const CodeEditor = lazy(() =>
  import("@orb/ui/code-editor").then((m) => ({ default: m.CodeEditor })),
);

type AppForm = AppFormInstance<PromptConfig>;

/** The placement multi-toggle items (`{value,label}` over the kit tuple — one source of truth). */
const PLACEMENT_ITEMS = REGEX_PLACEMENTS.map((value) => ({ value, label: value }));

export interface RegexEditorDialogProps {
  readonly form: AppForm;
  /** The script index this dialog edits (`regexScripts[index].*`). */
  readonly index: number;
  readonly onClose: () => void;
}

/** The regex-script editor — bound to `regexScripts[index].*`; closes via the tab's `onClose`. */
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
          <form.AppField name={`regexScripts[${index}].name`}>
            {(field): ReactElement => <field.TextField label="Name" />}
          </form.AppField>

          <form.AppField name={`regexScripts[${index}].findRegex`}>
            {(field): ReactElement => (
              <Field label="Find pattern" name={field.name}>
                <Suspense fallback={null}>
                  <CodeEditor
                    ariaLabel="Find pattern"
                    value={field.state.value}
                    onChange={(next): void => field.handleChange(next)}
                  />
                </Suspense>
              </Field>
            )}
          </form.AppField>

          <form.AppField name={`regexScripts[${index}].replaceString`}>
            {(field): ReactElement => (
              <field.TextareaField
                label="Replace with"
                description="What each match becomes (macros allowed)."
                rows={3}
              />
            )}
          </form.AppField>

          <form.AppField name={`regexScripts[${index}].placement`}>
            {(field): ReactElement => (
              <field.MultiToggleField
                label="Runs on"
                description="Which text streams this script applies to."
                items={PLACEMENT_ITEMS}
              />
            )}
          </form.AppField>

          <Section heading="Options">
            <form.AppField name={`regexScripts[${index}].enabled`}>
              {(field): ReactElement => <field.SwitchField label="Enabled" />}
            </form.AppField>
            <form.AppField name={`regexScripts[${index}].markdownOnly`}>
              {(field): ReactElement => (
                <field.SwitchField
                  label="Display only"
                  description="Only affects what's shown, never the prompt."
                />
              )}
            </form.AppField>
            <form.AppField name={`regexScripts[${index}].promptOnly`}>
              {(field): ReactElement => (
                <field.SwitchField
                  label="Prompt only"
                  description="Only affects the prompt, never the display."
                />
              )}
            </form.AppField>
            <form.AppField name={`regexScripts[${index}].runOnEdit`}>
              {(field): ReactElement => (
                <field.SwitchField
                  label="Run on edit"
                  description="Re-apply when a message is edited."
                />
              )}
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
