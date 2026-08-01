// The reset-password dialog (Settings → Admin → Users → ⋯ → Reset password). ONE controlled password
// input — the §13.4 trivial-input carve-out (a lone field, under the factory threshold; the
// first-run-persona-dialog precedent). A COMPONENT so the Dialog root is legal (rule 7). Submitting
// calls `resetPassword` (which revokes the target's live sessions server-side — the copy says so) and
// closes on success; a failure keeps it open with the sticky mutation error inline. Base UI unmounts
// the closed popup, so a reopen never shows the previous password.

import type { UserId } from "@orb/kit/ids";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog, FormSubmitButton } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { useResetPassword } from "../hooks/use-admin-mutations";
import { ADMIN_MIN_PASSWORD_LENGTH } from "../lib/admin-model";

export interface AdminResetPasswordDialogProps {
  readonly userId: UserId;
  readonly handle: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** The dialog shell — the body mounts fresh per open (Base UI unmounts closed popups). */
export function AdminResetPasswordDialog(props: AdminResetPasswordDialogProps): ReactElement {
  return (
    <FormDialog
      description="Sets a new local password and revokes every live session — they'll need to sign in again on all devices."
      onOpenChange={props.onOpenChange}
      open={props.open}
      testKey="adminResetPasswordDialog"
      title={`Reset password — ${props.handle}`}
    >
      <ResetPasswordBody userId={props.userId} onDone={(): void => props.onOpenChange(false)} />
    </FormDialog>
  );
}

function ResetPasswordBody({ userId, onDone }: { readonly userId: UserId; readonly onDone: () => void }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const resetPassword = useResetPassword({ trpc, invalidation });
  const [password, setPassword] = useState("");
  const [showTooShort, setShowTooShort] = useState(false);

  const submit = async (): Promise<void> => {
    if (password.length < ADMIN_MIN_PASSWORD_LENGTH) {
      setShowTooShort(true);
      return;
    }
    try {
      await resetPassword.mutateAsync({ userId, password });
    } catch {
      // The sticky mutation error renders below (plus the factory's errorToast) — stay open.
      return;
    }
    notify.success("Password reset — their sessions were revoked.");
    onDone();
  };

  return (
    <Stack gap="block">
      <Field label="New password" description={`At least ${ADMIN_MIN_PASSWORD_LENGTH} characters.`}>
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
        <Text voice="label" className="text-destructive">
          Password must be at least {ADMIN_MIN_PASSWORD_LENGTH} characters.
        </Text>
      ) : null}
      {!showTooShort && resetPassword.error !== null ? (
        <Text voice="label" className="text-destructive">
          Couldn't reset the password — try again.
        </Text>
      ) : null}
      <FormSubmitButton
        disabled={resetPassword.isPending}
        label={resetPassword.isPending ? "Resetting…" : "Reset password"}
        onSubmit={(): void => void submit()}
        testKey="adminResetPasswordSubmit"
      />
    </Stack>
  );
}
