// D259 — the local-mode signup-through-invite form. The login surface offers it when a signed-out invite
// visit stashed its token. Plain controlled state (the submit-once credential-form carve-out) inside a real
// `<form>` so password managers and Enter-to-submit work. The joiner names their persona here, before the account
// and its seat exist. The server owns every rule; the parses here name a field's problem before the round trip, and
// the submit stays focusable so a screen reader always hears why nothing was sent.

import type { SignupErrorCode } from "@orb/contracts/chat";
import { SIGNUP_HANDLE_MAX_CHARS, SIGNUP_HANDLE_MIN_CHARS, signupRequestSchema } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, SyntheticEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { signUpWithInvite } from "#data";
import { DEAD_INVITE_SENTENCE, testId } from "#lib";
import { joinerPersonaOf } from "../lib/joiner-persona.ts";
import { JoinerPersonaFields } from "./joiner-persona-fields.tsx";

// The handle rule, stated where the handle is typed and again on a refusal, from the limits the server parses with.
const HANDLE_RULE = `${SIGNUP_HANDLE_MIN_CHARS} to ${SIGNUP_HANDLE_MAX_CHARS} letters, digits, dots, dashes or underscores, starting with a letter or digit. No spaces.`;

// A typed handle is judged as it is typed; an empty one only once a submit has asked for it.
function handleErrorOf(handle: string, valid: boolean, shown: boolean): string | null {
  if (valid) {
    return null;
  }
  if (handle !== "") {
    return "This handle breaks the rule above.";
  }
  return shown ? "Choose a handle." : null;
}

/** The copy for a signup refusal. Exhaustive: a new wire code fails `tsc` here. */
function refusalCopy(code: SignupErrorCode | null): string {
  switch (code) {
    case null:
      return "Sign-up didn't go through. Try again in a minute.";
    case "invalid_request":
      return `A handle is ${HANDLE_RULE}`;
    case "already_signed_in":
      return "You're already signed in. Open the invite link again from the app.";
    case "invite_unavailable":
      return DEAD_INVITE_SENTENCE;
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
  /** Fires after the account exists and the session cookie is minted, with the room it is seated in. */
  readonly onSignedUp: (chatId: ChatId) => void;
  /** Switch to the sign-in form; the stash stays, so the join dialog opens after sign-in. */
  readonly onUseSignIn: () => void;
  /** Drop the invite and show the plain sign-in form. */
  readonly onDismiss: () => void;
}

/** Handle + password + persona → `POST /api/auth/signup` → a new account seated in the invite's room as that persona. */
export function LoginSignupForm({ token, onSignedUp, onUseSignIn, onDismiss }: LoginSignupFormProps): ReactElement {
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [personaName, setPersonaName] = useState("");
  const [personaDescription, setPersonaDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Counts submits that met a gap, so each one moves focus to the first field it names.
  const [attempts, setAttempts] = useState(0);
  const formRef = useRef<HTMLFormElement | null>(null);
  const persona = joinerPersonaOf(personaName, personaDescription);
  const handleValid = signupRequestSchema.shape.handle.safeParse(handle).success;
  const shown = attempts > 0;
  const handleError = handleErrorOf(handle, handleValid, shown);
  const passwordError = shown && password.length === 0 ? "Enter a password." : null;
  const personaError = shown && persona === null ? "Give your persona a name." : null;

  useEffect(() => {
    if (attempts > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [attempts]);

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    if (pending) {
      return;
    }
    if (!handleValid || password.length === 0 || persona === null) {
      setAttempts((count) => count + 1);
      return;
    }
    setPending(true);
    setError(null);
    // @orb-waive caught-failure-ownership(signUpWithInvite): the FORM is the owner — a network rejection sets the visible role=alert error and re-enables submit, the same surface a coded refusal lands on. Ends if the form stops rendering its error state.
    signUpWithInvite({ token, handle, password, persona }).then(
      (result) => {
        if (result.ok) {
          onSignedUp(result.chatId);
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
    <form ref={formRef} onSubmit={onSubmit} noValidate={true} data-testid={testId("signupInviteForm")}>
      <Stack gap="block">
        <Field label="Handle" description={`The name you sign in with: ${HANDLE_RULE}`} error={handleError}>
          <Input
            autoComplete="username"
            required={true}
            value={handle}
            onValueChange={(value): void => setHandle(value)}
            data-testid={testId("signupHandle")}
          />
        </Field>
        <Field label="Password" error={passwordError}>
          <Input
            required={true}
            type="password"
            autoComplete="new-password"
            value={password}
            onValueChange={(value): void => setPassword(value)}
            data-testid={testId("signupPassword")}
          />
        </Field>
        <JoinerPersonaFields
          name={personaName}
          nameError={personaError}
          description={personaDescription}
          onNameChange={setPersonaName}
          onDescriptionChange={setPersonaDescription}
        />
        {error === null ? null : (
          <Text voice="label" className="text-destructive" role="alert" data-testid={testId("signupError")}>
            {error}
          </Text>
        )}
        <Button intent="primary" type="submit" disabled={pending} data-testid={testId("signupSubmit")}>
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
