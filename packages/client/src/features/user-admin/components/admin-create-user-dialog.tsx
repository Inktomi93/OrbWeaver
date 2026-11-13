// The Create-user dialog (Settings → Admin → Users). A COMPONENT so the Dialog root is legal
// (`orb/surface-consumes-container` refuses a surface's own modal root). The form is the §13.4 factory (`useCreateUserForm` — ≥3 fields +
// validation), button-gated: Create runs `form.handleSubmit()` whose `save` fires the `createUser`
// mutation and closes on success; a failure keeps the dialog open and the sticky mutation error renders
// inline, so the call declares `failureShownInline` and no toast repeats it. Base UI unmounts the popup content
// while closed, so every open mounts a FRESH form — a reopened dialog never shows the previous
// attempt's values.

import { handleSchema, MIN_PASSWORD_LENGTH } from "@orb/contracts/identity";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { FormDialogPopup, FormDialogRoot } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { ACCOUNT_HANDLE_FIELD_NAME, ACCOUNT_PASSWORD_FIELD_NAME } from "#lib";
import { useCreateUser } from "../hooks/use-admin-mutations.ts";
import { useCreateUserForm } from "../hooks/use-create-user-form.ts";
import type { CreateUserFormValues } from "../lib/admin-model.ts";
import { ROLE_ITEMS } from "../lib/admin-model.ts";
import { ADMIN_CREATE_USER_NAME, adminCreateUserLabel } from "../lib/user-admin-names.ts";

export interface AdminCreateUserDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Only the box owner may MINT an admin (`createUser` gates `role:"admin"` on `requireOwner` — the same
   *  owner-only floor as `setRole`). A delegated admin sees no Role picker: they can create users only. */
  readonly viewerIsOwner: boolean;
}

/** The dialog shell — the form body mounts fresh per open (Base UI unmounts closed popups). */
export function AdminCreateUserDialog({ open, onOpenChange, viewerIsOwner }: AdminCreateUserDialogProps): ReactElement {
  return (
    <FormDialogRoot onOpenChange={onOpenChange} open={open}>
      <CreateUserFormBody viewerIsOwner={viewerIsOwner} onDone={(): void => onOpenChange(false)} />
    </FormDialogRoot>
  );
}

function CreateUserFormBody({ viewerIsOwner, onDone }: { readonly viewerIsOwner: boolean; readonly onDone: () => void }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const createUser = useCreateUser({ trpc, invalidation, failureShownInline: "the create-user dialog's alert line" });

  const save = async (values: CreateUserFormValues): Promise<CreateUserFormValues> => {
    await createUser.mutateAsync({
      handle: handleSchema.parse(values.handle.trim()),
      password: values.password,
      role: values.role,
    });
    onDone();
    return values;
  };

  const { form } = useCreateUserForm({ entityId: "create-user", serverValues: undefined, save });

  return (
    <FormDialogPopup
      description="Mint a loginable local account. Admins can manage users and system settings; only the box owner can change roles later."
      submit={{
        label: adminCreateUserLabel(createUser.isPending),
        disabled: createUser.isPending,
        testKey: "adminCreateUserSubmit",
        onSubmit: (): void => {
          // The save's failure is already said, inline or by the toast; the rethrow carries nothing new.
          form.handleSubmit().catch(() => undefined);
        },
      }}
      testKey="adminCreateUserDialog"
      title={ADMIN_CREATE_USER_NAME}
    >
      <form.AppField name="handle">
        {(field): ReactElement => <field.TextField label={ACCOUNT_HANDLE_FIELD_NAME} placeholder="e.g. mira" autoComplete="off" />}
      </form.AppField>
      <form.AppField name="password">
        {(field): ReactElement => (
          <field.TextField
            label={ACCOUNT_PASSWORD_FIELD_NAME}
            description={`At least ${MIN_PASSWORD_LENGTH} characters. They can't change it themselves yet: you can reset it here any time.`}
            type="password"
            autoComplete="new-password"
          />
        )}
      </form.AppField>
      {viewerIsOwner ? (
        <form.AppField name="role">
          {(field): ReactElement => <field.SelectField label="Role" description="Admins manage users, jobs, and system settings." items={ROLE_ITEMS} />}
        </form.AppField>
      ) : null}
      {createUser.error === null ? null : (
        <Text role="alert" tone="destructive" voice="label">
          Couldn't create the user. That handle may already be taken.
        </Text>
      )}
    </FormDialogPopup>
  );
}
