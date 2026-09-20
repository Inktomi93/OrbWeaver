// The add-connection form (Settings → Connections; UI-Arch §13.4 — ≥3 fields + validation + save semantics
// ⇒ a form factory, never hand-rolled controlled state). Built on `createSavedEntityForm` at MODULE scope
// (stable hook identity, §13.1). Button-gated: the dialog's "Add connection" button submits; the `save` seam
// is supplied at CALL time; the validator reads the derived `auth` value the provider field writes. `serverValues` is always undefined
// (a CREATE has no server row) so `defaultValues` seeds every open; the dialog remounts the subtree per open.

import { createSavedEntityForm } from "#forms/editor";
import type { AddConnectionFormValues } from "../lib/add-connection-form-model.ts";
import { ADD_CONNECTION_DEFAULTS, validateAddConnection } from "../lib/add-connection-form-model.ts";

export const useAddConnectionForm = createSavedEntityForm<AddConnectionFormValues>({
  defaultValues: ADD_CONNECTION_DEFAULTS,
  options: {
    validators: {
      onDynamic: ({ value }: { value: AddConnectionFormValues }): { fields: Record<string, string> } | undefined => validateAddConnection(value),
    },
  },
});
