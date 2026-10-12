// Invite signup uses the saved form factory without a persisted credential draft.
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
import { createSavedEntityForm } from "#forms/editor";
import { DEAD_INVITE_SENTENCE, testId } from "#lib";
import { joinerPersonaOf } from "../lib/joiner-persona.ts";
import { JoinerPersonaFields } from "./joiner-persona-fields.tsx";

const useSignupForm = createSavedEntityForm({
  defaultValues: { handle: "", password: "", personaName: "", personaDescription: "" },
});

// The handle rule, stated where the handle is typed and again on a refusal, from the limits the server parses with.
const HANDLE_RULE = `${SIGNUP_HANDLE_MIN_CHARS} to ${SIGNUP_HANDLE_MAX_CHARS} letters, digits, dots, dashes or underscores, starting with a letter or digit. No spaces.`;

// A typed handle is judged as it is typed; an empty one only once a submit has asked for it.
function handleErrorOf(typed: string, valid: boolean, shown: boolean): string | null {
  if (valid) {
    return null;
  }
  if (typed !== "") {
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Counts submits that met a gap, so each one moves focus to the first field it names.
  const [attempts, setAttempts] = useState(0);
  const formRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    if (attempts > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [attempts]);

  const { form } = useSignupForm({
    entityId: token,
    serverValues: undefined,
    save: async (values): Promise<typeof values> => {
      const request = signupRequestSchema.parse({
        token,
        handle: values.handle.trim(),
        password: values.password,
        persona: { name: values.personaName.trim(), description: values.personaDescription.trim() },
      });
      const result = await signUpWithInvite(request);
      if (!result.ok) {
        throw new Error(refusalCopy(result.code));
      }
      onSignedUp(result.chatId);
      return values;
    },
  });

  return (
    <form.Subscribe selector={(state): typeof state.values => state.values}>
      {(values): ReactElement => {
        const { handle, password, personaName, personaDescription } = values;
        const persona = joinerPersonaOf(personaName, personaDescription);
        const handleValid = signupRequestSchema.shape.handle.safeParse(handle).success;
        const shown = attempts > 0;
        const handleError = handleErrorOf(handle, handleValid, shown);
        const passwordError = shown && password.length === 0 ? "Enter a password." : null;
        const personaError = shown && persona === null ? "Give your persona a name." : null;
        const onSubmit = (event: SyntheticEvent): void => {
          event.preventDefault();
          if (form.state.isSubmitting) {
            return;
          }
          if (!handleValid || password.length === 0 || persona === null) {
            setAttempts((count) => count + 1);
            return;
          }
          setPending(true);
          setError(null);
          void form
            .handleSubmit()
            .catch((failure: Error): void => setError(failure.message))
            .finally((): void => setPending(false));
        };
        return (
          <form ref={formRef} onSubmit={onSubmit} noValidate={true} data-testid={testId("signupInviteForm")}>
            <Stack gap="block">
              <Field label="Handle" description={`The name you sign in with: ${HANDLE_RULE}`} error={handleError}>
                <Input
                  autoComplete="username"
                  required={true}
                  value={handle}
                  onValueChange={(value): void => form.setFieldValue("handle", value)}
                  data-testid={testId("signupHandle")}
                />
              </Field>
              <Field label="Password" error={passwordError}>
                <Input
                  required={true}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onValueChange={(value): void => form.setFieldValue("password", value)}
                  data-testid={testId("signupPassword")}
                />
              </Field>
              <JoinerPersonaFields
                name={personaName}
                nameError={personaError}
                description={personaDescription}
                onNameChange={(value): void => form.setFieldValue("personaName", value)}
                onDescriptionChange={(value): void => form.setFieldValue("personaDescription", value)}
              />
              {error === null ? null : (
                <Text tone="destructive" voice="label" role="alert" data-testid={testId("signupError")}>
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
      }}
    </form.Subscribe>
  );
}
