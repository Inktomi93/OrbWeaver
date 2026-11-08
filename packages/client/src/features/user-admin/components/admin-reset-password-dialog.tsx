// The reset-password dialog (Settings → Admin → Users → ⋯ → Reset password). ONE controlled password
// input — the §13.4 trivial-input carve-out (a lone field, under the factory threshold; the
// first-run-persona-dialog precedent). A COMPONENT so the Dialog root is legal (rule 7). Submitting
// calls `resetPassword` (which revokes the target's live sessions server-side — the copy says so) and
// closes on success; a failure keeps it open with the sticky mutation error inline. Base UI unmounts
// the closed popup, so a reopen never shows the previous password.

import { MIN_PASSWORD_LENGTH } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialogPopup, FormDialogRoot } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { useResetPassword } from "../hooks/use-admin-mutations.ts";
import type { AdminUserDialogProps } from "../lib/admin-model.ts";

/** The dialog shell — the body mounts fresh per open (Base UI unmounts closed popups). */
export function AdminResetPasswordDialog(props: AdminUserDialogProps): ReactElement {
  return (
    <FormDialogRoot onOpenChange={props.onOpenChange} open={props.open}>
      <ResetPasswordBody handle={props.handle} userId={props.userId} onDone={(): void => props.onOpenChange(false)} />
    </FormDialogRoot>
  );
}

function ResetPasswordBody({ handle, userId, onDone }: { readonly handle: string; readonly userId: UserId; readonly onDone: () => void }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const resetPassword = useResetPassword({ trpc, invalidation });
  const [password, setPassword] = useState("");
  const [showTooShort, setShowTooShort] = useState(false);

  const submit = async (): Promise<void> => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setShowTooShort(true);
      return;
    }
    try {
      await resetPassword.mutateAsync({ userId, password });
    } catch {
      // The sticky mutation error renders below (plus the factory's errorToast) — stay open.
      return;
    }
    notify.success("Password reset: their sessions were revoked.");
    onDone();
  };

  return (
    <FormDialogPopup
      description="Sets a new local password and revokes every live session. They'll need to sign in again on all devices."
      submit={{
        label: resetPassword.isPending ? "Resetting…" : "Reset password",
        disabled: resetPassword.isPending,
        testKey: "adminResetPasswordSubmit",
        onSubmit: (): void => void submit().catch(globalThis.reportError),
      }}
      testKey="adminResetPasswordDialog"
      title={`Reset password: ${handle}`}
    >
      <Field label="New password" description={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
        <Input
          autoComplete="new-password"
          onValueChange={(value): void => {
            setPassword(value);
            setShowTooShort(false);
          }}
          type="password"
          value={password}
        />
      </Field>
      {showTooShort ? (
        <Text tone="destructive" voice="label">
          Password must be at least {MIN_PASSWORD_LENGTH} characters.
        </Text>
      ) : null}
      {!showTooShort && resetPassword.error !== null ? (
        <Text role="alert" tone="destructive" voice="label">
          Couldn't reset the password. Try again.
        </Text>
      ) : null}
    </FormDialogPopup>
  );
}
