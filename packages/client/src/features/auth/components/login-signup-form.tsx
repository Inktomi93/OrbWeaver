// D254 — the local-mode signup-through-invite form. The login surface offers it when a signed-out invite
// visit stashed its token. Plain controlled state (the submit-once credential-form carve-out) inside a real
// `<form>` so password managers and Enter-to-submit work. The server owns every rule; the handle parse here
// only keeps the button honest.

import type { SignupErrorCode } from "@orb/contracts/identity";
import { signupHandleSchema } from "@orb/contracts/identity";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, SyntheticEvent } from "react";
import { useState } from "react";
import { signUpWithInvite } from "#data";
import { testId } from "#lib";

/** The copy for a signup refusal. Exhaustive: a new wire code fails `tsc` here. */
function refusalCopy(code: SignupErrorCode | null): string {
  switch (code) {
    case null:
      return "Sign-up didn't go through. Try again in a minute.";
    case "invalid_request":
      return "Use 2 to 32 letters, digits, dots, dashes or underscores for the handle.";
    case "already_signed_in":
      return "You're already signed in. Open the invite link again from the app.";
    case "invite_unavailable":
      return "This invite link has expired or is used up. Ask the host for a new one.";
    case "handle_unavailable":
      return "That handle is taken. Pick another one.";
    case "weak_password":
      return "Use a password of at least 8 characters.";
    default: {
      const exhaustive: never = code;
      return String(exhaustive);
    }
  }
}

export interface LoginSignupFormProps {
  /** The stashed raw invite token. It rides the POST body only. */
  readonly token: string;
  /** Fires after the account exists and the session cookie is minted. */
  readonly onSignedUp: () => void;
  /** Switch to the sign-in form; the stash stays, so the join dialog opens after sign-in. */
  readonly onUseSignIn: () => void;
  /** Drop the invite and show the plain sign-in form. */
  readonly onDismiss: () => void;
}

/** Handle + password → `POST /api/auth/signup` → a new account seated in the invite's room. */
export function LoginSignupForm({ token, onSignedUp, onUseSignIn, onDismiss }: LoginSignupFormProps): ReactElement {
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = signupHandleSchema.safeParse(handle).success && password.length > 0 && !pending;

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setPending(true);
    setError(null);
    signUpWithInvite({ token, handle, password }).then(
      (result) => {
        if (result.ok) {
          onSignedUp();
          return;
        }
        setError(refusalCopy(result.code));
        setPending(false);
      },
      () => {
        setError(refusalCopy(null));
        setPending(false);
      },
    );
  };

  return (
    <form onSubmit={onSubmit} data-testid={testId("signupInviteForm")}>
      <Stack gap="block">
        <Field label="Handle">
          <Input autoComplete="username" value={handle} onValueChange={(value): void => setHandle(value)} data-testid={testId("signupHandle")} />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onValueChange={(value): void => setPassword(value)}
            data-testid={testId("signupPassword")}
          />
        </Field>
        {error === null ? null : (
          <Text size="label" tone="destructive" role="alert" data-testid={testId("signupError")}>
            {error}
          </Text>
        )}
        <Button intent="primary" type="submit" disabled={!canSubmit} data-testid={testId("signupSubmit")}>
          {pending ? "Creating your account…" : "Create account and join"}
        </Button>
        <Row gap="row">
          <Button intent="ghost" onClick={onUseSignIn} data-testid={testId("signupUseSignIn")}>
            I already have an account
          </Button>
          <Button intent="ghost" onClick={onDismiss} data-testid={testId("signupDismiss")}>
            Not now
          </Button>
        </Row>
      </Stack>
    </form>
  );
}
