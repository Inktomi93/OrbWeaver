// The create-user form (Settings → Admin → Users; UI-Arch §13.4 — ≥3 fields + validation + save
// semantics ⇒ a form factory, never hand-rolled controlled state). Built on `createSavedEntityForm` at
// MODULE scope (stable hook identity, §13.1). Button-gated: the dialog's Create button submits; the
// `save` seam is supplied at CALL time (it closes over the live `createUser` mutation). `serverValues`
// is always undefined (a CREATE has no server row) so `defaultValues` seeds every open; the dialog
// remounts the subtree per open (a fresh `entityId` per open) so a reopened dialog never shows the
// previous attempt's values.
//
// Validation is plain-function `onDynamic` (revalidateLogic: validate on submit, then live) — the client
// has no zod dep (package.json); the floors mirror the server verb's guards (invalid_handle /
// weak_password) as teaching, with the verb remaining the enforcement floor.

import { createSavedEntityForm } from "#forms";
import type { CreateUserFormValues } from "../lib/admin-model.ts";
import { ADMIN_MIN_PASSWORD_LENGTH, CREATE_USER_DEFAULTS } from "../lib/admin-model.ts";

export const useCreateUserForm = createSavedEntityForm<CreateUserFormValues>({
  defaultValues: CREATE_USER_DEFAULTS,
  options: {
    validators: {
      onDynamic: ({ value }: { value: CreateUserFormValues }): { fields: Record<string, string> } | undefined => {
        const fields: Record<string, string> = {};
        if (value.handle.trim().length === 0) {
          fields["handle"] = "A handle is required.";
        }
        if (value.password.length < ADMIN_MIN_PASSWORD_LENGTH) {
          fields["password"] = `At least ${ADMIN_MIN_PASSWORD_LENGTH} characters.`;
        }
        return Object.keys(fields).length > 0 ? { fields } : undefined;
      },
    },
  },
});
