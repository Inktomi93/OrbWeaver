// The invite-mint form (FINAL-Chats §8.2 — the invite dialog; §13.4: mode + handle + expiry + max-uses
// = a multi-field form with validation ⇒ a form factory, never hand-rolled controlled state). Built on
// `createSavedEntityForm` at MODULE scope (stable hook identity, §13.1). Button-gated: the dialog's
// Create button submits; the `save` seam is supplied at CALL time (it closes over the live
// `invites.createInvite` mutation + the chatId). `serverValues` is always undefined (a mint has no
// server row) so `defaultValues` seeds every open; the dialog remounts the subtree per open (Base UI
// unmounts the closed popup) so a reopened dialog never shows a prior attempt.

import { createSavedEntityForm } from "#forms";
import type { InviteFormValues } from "../lib/invite-form-model";
import { INVITE_FORM_DEFAULTS, validateInviteForm } from "../lib/invite-form-model";

export const useInviteForm = createSavedEntityForm<InviteFormValues>({
  defaultValues: INVITE_FORM_DEFAULTS,
  options: {
    validators: {
      onDynamic: ({
        value,
      }: {
        value: InviteFormValues;
      }): { fields: Record<string, string> } | undefined => validateInviteForm(value),
    },
  },
});
