// The add-credential form (Settings → Connections → Saved keys; UI-Arch §13.4 — ≥3 fields + validation +
// save semantics ⇒ a form factory, never hand-rolled controlled state). Built on `createSavedEntityForm`
// at MODULE scope (stable hook identity, §13.1). Button-gated: the dialog's "Add key" button submits; the
// `save` seam is supplied at CALL time (it closes over the live `credentials.add` mutation). `serverValues`
// is always undefined (a CREATE has no server row) so `defaultValues` seeds every open; the dialog remounts
// the subtree per open (Base UI unmounts the closed popup) so a reopened dialog never shows a prior attempt.

import { createSavedEntityForm } from "#forms";
import type { AddCredentialFormValues } from "../lib/add-credential-form-model";
import { ADD_CREDENTIAL_DEFAULTS, validateAddCredential } from "../lib/add-credential-form-model";

export const useAddCredentialForm = createSavedEntityForm<AddCredentialFormValues>({
  defaultValues: ADD_CREDENTIAL_DEFAULTS,
  options: {
    validators: {
      onDynamic: ({ value }: { value: AddCredentialFormValues }): { fields: Record<string, string> } | undefined => validateAddCredential(value),
    },
  },
});
