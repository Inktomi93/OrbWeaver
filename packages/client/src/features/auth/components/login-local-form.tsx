// The local-mode credential form. Deliberately plain controlled state, not a form factory: the editor
// factories bake obligations (server seed/dirty pill/autosave) none of which exist for a submit-once
// credential form — the sanctioned trivial-input carve-out. A real `<form>` element so password
// managers + Enter-to-submit work natively.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, SyntheticEvent } from "react";
import { useState } from "react";
import { login } from "#data";
import { testId } from "#lib";

export interface LoginLocalFormProps {
  /** The seed-handle pre-fill (`/api/auth/config`); null under discreet login → start blank. */
  readonly defaultHandle: string | null;
  /** Fires after the session cookie is minted — the dispatcher navigates home. */
  readonly onLoggedIn: () => void;
}

/** Handle + password → `POST /api/auth/login` → the session cookie. */
export function LoginLocalForm({ defaultHandle, onLoggedIn }: LoginLocalFormProps): ReactElement {
  const [handle, setHandle] = useState(defaultHandle ?? "");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = handle.trim().length > 0 && password.length > 0 && !pending;

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setPending(true);
    setError(null);
    login(castId<Handle>(handle.trim()), password).then(onLoggedIn, (err: unknown) => {
      // `pending` stays true only until the failure lands — a success unmounts via the navigation.
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setPending(false);
    });
  };

  return (
    <form onSubmit={onSubmit} data-testid={testId("loginLocalForm")}>
      <Stack gap="block">
        <Field label="Handle">
          <Input autoComplete="username" value={handle} onValueChange={(value): void => setHandle(value)} data-testid={testId("loginHandle")} />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onValueChange={(value): void => setPassword(value)}
            data-testid={testId("loginPassword")}
          />
        </Field>
        {error === null ? null : (
          // RATIFIED raw axes (#582, the #573 precedent): the SEMANTIC destructive tone is the message —
          // no voice carries a semantic color (every one is foreground/muted/prose-ink by construction).
          <Text size="label" tone="destructive" role="alert" data-testid={testId("loginError")}>
            {error}
          </Text>
        )}
        <Button intent="primary" type="submit" disabled={!canSubmit} data-testid={testId("loginSubmit")}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </Stack>
    </form>
  );
}
