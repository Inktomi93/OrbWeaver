// CT story for focus-invalid-field.ct.tsx. It mounts the public saved-editor factory with the same
// bound fields and onDynamic validation used by production editors, then submits through a real form.

import { createSavedEntityForm } from "@orb/client/forms/editor";
import type { ReactElement } from "react";

interface InvalidFocusValues {
  readonly name: string;
  readonly summary: string;
}

const useInvalidFocusForm = createSavedEntityForm<InvalidFocusValues>({
  defaultValues: { name: "", summary: "" },
  save: (values): Promise<InvalidFocusValues> => Promise.resolve(values),
  options: {
    validators: {
      onDynamic: ({ value }: { value: InvalidFocusValues }): { fields: Record<string, string> } | undefined => {
        const fields: Record<string, string> = {};
        if (value.name.trim().length === 0) {
          fields["name"] = "A name is required.";
        }
        if (value.summary.trim().length === 0) {
          fields["summary"] = "A summary is required.";
        }
        return Object.keys(fields).length > 0 ? { fields } : undefined;
      },
    },
  },
});

/** A button-gated editor with two invalid bound controls in document order. */
export function InvalidFocusSavedFormStory(): ReactElement {
  const { form } = useInvalidFocusForm({
    entityId: "invalid-focus-story",
    serverValues: undefined,
  });

  return (
    <form.AppForm>
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.AppField name="name">{(field): ReactElement => <field.TextField label="Name" />}</form.AppField>
        <form.AppField name="summary">{(field): ReactElement => <field.TextField label="Summary" />}</form.AppField>
        <button type="submit">Save</button>
      </form>
    </form.AppForm>
  );
}
