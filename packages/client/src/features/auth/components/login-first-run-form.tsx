// B4 — the local-mode FIRST-RUN owner-password setup form. Shown in place of the credential form on a fresh
// local box (config.localFirstRun) whose owner row has no password yet. Sets the owner password ONCE via the
// origin-gated, one-shot `/api/auth/first-run` (which also mints the session), then the dispatcher navigates
// home. Deliberately plain controlled state (the §13.4 trivial-input carve-out — a submit-once credential
// form has none of the editor-factory obligations); a real `<form>` so password managers + Enter-to-submit
// work. Two fields (password + confirm) with client-side min-length + match checks before the POST.

import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, SyntheticEvent } from "react";
import { useState } from "react";
import { firstRunSetup } from "#data";
import { testId } from "#lib";

/** Mirrors the server + hashing floor (`MIN_PASSWORD_LENGTH` / env `LOCAL_INITIAL_PASSWORD.min(8)`). */
const MIN_PASSWORD_LENGTH = 8;

export interface LoginFirstRunFormProps {
  /** The seeded owner handle to display (from `/api/auth/config`); null under discreet login. The password
   *  is set for THIS owner row — the handle is shown for orientation, not entered. */
  readonly ownerHandle: string | null;
  /** Fires after the session cookie is minted — the dispatcher navigates home. */
  readonly onDone: () => void;
}

/** Set the owner password → `POST /api/auth/first-run` → the `__Host-orb_session` cookie. */
export function LoginFirstRunForm({ ownerHandle, onDone }: LoginFirstRunFormProps): ReactElement {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length >= MIN_PASSWORD_LENGTH && confirm === password && !pending;

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setPending(true);
    setError(null);
    firstRunSetup(password).then(onDone, (err: unknown) => {
      setError(err instanceof Error ? err.message : "Couldn't complete setup.");
      setPending(false);
    });
  };

  return (
    <form onSubmit={onSubmit} data-testid={testId("firstRunSetupForm")}>
      <Stack gap="block">
        <Text voice="label" className="text-muted-foreground">
          {ownerHandle === null
            ? "Set the owner password to finish setting up this server."
            : `Set the password for the owner account “${ownerHandle}” to finish setting up this server.`}
        </Text>
        <Field label="Owner password" description={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onValueChange={(value): void => setPassword(value)}
            data-testid={testId("firstRunPassword")}
          />
        </Field>
        <Field label="Confirm password">
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onValueChange={(value): void => setConfirm(value)}
            data-testid={testId("firstRunConfirm")}
          />
        </Field>
        {tooShort ? (
          <Text voice="label" className="text-destructive" role="alert" data-testid={testId("firstRunError")}>
            Password must be at least {MIN_PASSWORD_LENGTH} characters.
          </Text>
        ) : null}
        {!tooShort && mismatch ? (
          <Text voice="label" className="text-destructive" role="alert" data-testid={testId("firstRunError")}>
            The passwords don't match.
          </Text>
        ) : null}
        {error !== null && !tooShort && !mismatch ? (
          <Text voice="label" className="text-destructive" role="alert" data-testid={testId("firstRunError")}>
            {error}
          </Text>
        ) : null}
        <Button intent="primary" type="submit" disabled={!canSubmit} data-testid={testId("firstRunSubmit")}>
          {pending ? "Setting up…" : "Set password & continue"}
        </Button>
      </Stack>
    </form>
  );
}
