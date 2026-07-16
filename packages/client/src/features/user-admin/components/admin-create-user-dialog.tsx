// The Create-user dialog (Settings → Admin → Users). A COMPONENT so the Dialog root is legal
// (client-structure rule 7). The form is the §13.4 factory (`useCreateUserForm` — ≥3 fields +
// validation), button-gated: Create runs `form.handleSubmit()` whose `save` fires the `createUser`
// mutation and closes on success; a failure keeps the dialog open (the mutation's errorToast is the
// failure surface, and the sticky mutation error renders inline). Base UI unmounts the popup content
// while closed, so every open mounts a FRESH form — a reopened dialog never shows the previous
// attempt's values.

import { Button } from "@orb/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import { useCreateUser } from "../hooks/use-admin-mutations";
import { useCreateUserForm } from "../hooks/use-create-user-form";
import type { CreateUserFormValues } from "../lib/admin-model";
import { ADMIN_MIN_PASSWORD_LENGTH, ROLE_ITEMS } from "../lib/admin-model";

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup data-testid={testId("adminCreateUserDialog")}>
        <Stack gap="block">
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            Mint a loginable local account. Admins can manage users and system settings; only the box owner can change roles later.
          </DialogDescription>
          <CreateUserFormBody viewerIsOwner={viewerIsOwner} onDone={(): void => onOpenChange(false)} />
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}

function CreateUserFormBody({ viewerIsOwner, onDone }: { readonly viewerIsOwner: boolean; readonly onDone: () => void }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const createUser = useCreateUser({ trpc, invalidation });

  const save = async (values: CreateUserFormValues): Promise<CreateUserFormValues> => {
    await createUser.mutateAsync({
      handle: values.handle.trim(),
      password: values.password,
      ...(values.role === "admin" ? { role: "admin" as const } : {}),
    });
    onDone();
    return values;
  };

  const { form } = useCreateUserForm({ entityId: "create-user", serverValues: undefined, save });

  return (
    <Stack gap="block">
      <form.AppField name="handle">{(field): ReactElement => <field.TextField label="Handle" placeholder="e.g. mira" autoComplete="off" />}</form.AppField>
      <form.AppField name="password">
        {(field): ReactElement => (
          <field.TextField
            label="Password"
            description={`At least ${ADMIN_MIN_PASSWORD_LENGTH} characters. They can't change it themselves yet — you can reset it here any time.`}
            type="password"
            autoComplete="new-password"
          />
        )}
      </form.AppField>
      {viewerIsOwner ? (
        <form.AppField name="role">
          {(field): ReactElement => <field.SelectField label="Role" description="Admins manage users, workloads, and system settings." items={ROLE_ITEMS} />}
        </form.AppField>
      ) : null}
      {createUser.error === null ? null : (
        <Text size="label" tone="destructive">
          Couldn't create the user — that handle may already be taken.
        </Text>
      )}
      <Stack align="end">
        <Button
          intent="primary"
          disabled={createUser.isPending}
          data-testid={testId("adminCreateUserSubmit")}
          onClick={(): void => {
            void form.handleSubmit();
          }}
        >
          {createUser.isPending ? "Creating…" : "Create user"}
        </Button>
      </Stack>
    </Stack>
  );
}
