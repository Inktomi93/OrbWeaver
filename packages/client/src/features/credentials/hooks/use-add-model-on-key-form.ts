// The "Add another model on this key" form (Settings → Connections, a saved row's menu). Button-gated like
// the add dialog's form (`use-add-connection-form.ts`): the dialog's submit writes one `connection.create`;
// the `save` seam is supplied at call time; `serverValues` is always undefined, so every open seeds from the
// defaults.

import { createSavedEntityForm } from "#forms/editor";
import type { AddModelOnKeyFormValues } from "../lib/add-model-on-key-form-model.ts";
import { ADD_MODEL_ON_KEY_DEFAULTS, validateAddModelOnKey } from "../lib/add-model-on-key-form-model.ts";

export const useAddModelOnKeyForm = createSavedEntityForm<AddModelOnKeyFormValues>({
  defaultValues: ADD_MODEL_ON_KEY_DEFAULTS,
  options: {
    validators: {
      onDynamic: ({ value }: { value: AddModelOnKeyFormValues }): { fields: Record<string, string> } | undefined => validateAddModelOnKey(value),
    },
  },
});
