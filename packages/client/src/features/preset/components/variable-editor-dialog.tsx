// The Variable editor Dialog — binds `variables[i].*` on the direct-bind form: name · question · the
// option list (label/value pairs) · defaultValue · multiSelect · separator · randomPick. The dialog is
// controlled by the tab (open when an index is targeted); closing just drops the local target.

import type { ChoiceBlockSpec, PromptConfig } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Icon, Plus } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";

type AppForm = AppFormInstance<PromptConfig>;

/** A single choice option (label/value) — the schema doesn't export the option type, so derive it. */
type ChoiceBlockOption = ChoiceBlockSpec["options"][number];

export interface VariableEditorDialogProps {
  readonly form: AppForm;
  /** The variable index this dialog edits (`variables[index].*`). */
  readonly index: number;
  readonly onClose: () => void;
}

/** The variable editor — bound to `variables[index].*`; closes via the tab's `onClose`. */
export function VariableEditorDialog({
  form,
  index,
  onClose,
}: VariableEditorDialogProps): ReactElement {
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
        <DialogTitle>Edit variable</DialogTitle>
        <Stack gap="block" className="min-h-0 overflow-y-auto">
          <form.AppField name={`variables[${index}].name`}>
            {(field): ReactElement => (
              <field.TextField
                label="Name"
                description="The macro key — used as {{name}} in your prompt."
              />
            )}
          </form.AppField>
          <form.AppField name={`variables[${index}].question`}>
            {(field): ReactElement => (
              <field.TextField
                label="Question"
                description="What the chat asks you at generation."
              />
            )}
          </form.AppField>

          <OptionList form={form} index={index} />

          <form.AppField name={`variables[${index}].defaultValue`}>
            {(field): ReactElement => (
              <field.TextField
                label="Default value"
                description="Used when you skip the question (optional)."
              />
            )}
          </form.AppField>
          <form.AppField name={`variables[${index}].multiSelect`}>
            {(field): ReactElement => (
              <field.SwitchField
                label="Allow multiple"
                description="Let more than one option be picked."
              />
            )}
          </form.AppField>
          <form.AppField name={`variables[${index}].separator`}>
            {(field): ReactElement => (
              <field.TextField
                label="Separator"
                description="Joins multiple picks (when multiple are allowed)."
              />
            )}
          </form.AppField>
          <form.AppField name={`variables[${index}].randomPick`}>
            {(field): ReactElement => (
              <field.SwitchField
                label="Random pick"
                description="Choose an option at random instead of asking."
              />
            )}
          </form.AppField>

          <Row gap="field" justify="end">
            <DialogClose render={<Button intent="primary">Done</Button>} />
          </Row>
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}

/** A blank option row (label seeded so the ListRow-less list isn't empty-labelled). */
function makeOption(): ChoiceBlockOption {
  return { label: "Option", value: "" };
}

/** The nested option list — label/value pairs bound at `variables[i].options[j].*`, add/remove in place. */
function OptionList({
  form,
  index,
}: {
  readonly form: AppForm;
  readonly index: number;
}): ReactElement {
  const optionsName = `variables[${index}].options` as const;
  return (
    <Section heading="Options">
      <form.Subscribe
        selector={(state): readonly ChoiceBlockOption[] =>
          state.values.variables[index]?.options ?? []
        }
      >
        {(options): ReactElement => (
          <Stack gap="field">
            {options.length === 0 ? (
              <Text size="micro" tone="muted">
                No options yet.
              </Text>
            ) : (
              options.map((_option, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: options are a positional, id-less list edited in place — the index IS the identity (the character-greeting-preview precedent).
                <Row key={j} gap="field" align="end">
                  <form.AppField name={`variables[${index}].options[${j}].label`}>
                    {(field): ReactElement => <field.TextField label="Label" />}
                  </form.AppField>
                  <form.AppField name={`variables[${index}].options[${j}].value`}>
                    {(field): ReactElement => <field.TextField label="Value" />}
                  </form.AppField>
                  <Button
                    intent="ghost"
                    size="sm"
                    onClick={(): void => {
                      void form.removeFieldValue(optionsName, j);
                    }}
                  >
                    Remove
                  </Button>
                </Row>
              ))
            )}
            <Row>
              <Button
                intent="secondary"
                size="sm"
                onClick={(): void => form.pushFieldValue(optionsName, makeOption())}
              >
                <Icon icon={Plus} size="sm" />
                Add option
              </Button>
            </Row>
          </Stack>
        )}
      </form.Subscribe>
    </Section>
  );
}
