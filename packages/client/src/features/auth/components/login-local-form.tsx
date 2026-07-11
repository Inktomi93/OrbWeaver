// The local-mode credential form (FINAL-Auth-Modes §7 P0 — the only mode where the client collects a
// credential). Deliberately PLAIN CONTROLLED state, not a form factory: the §13.4 factories bake
// entity-editor obligations (server seed / reset-re-baseline / dirty pill / autosave) — none exist for a
// submit-once credential form with two required fields; this is the sanctioned trivial-input carve-out
// (UI-Arch §6.1 threshold note). A real `<form>` element (attribute-free — the compose-only rule bans
// styling raw intrinsics, not semantics) so password managers + Enter-to-submit work natively.
//
// Error posture: the server answers a GENERIC "invalid credentials" (constant-time dummy-hash floor —
// no user enumeration); we surface it verbatim and add nothing. Under discreet login `defaultHandle`
// arrives null → the form starts blank (ST `enableDiscreetLogin` parity).

import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, SyntheticEvent } from "react";
import { useState } from "react";
import { testId } from "#lib";
import { login } from "../lib/auth-bootstrap";

export interface LoginLocalFormProps {
  /** The seed-handle pre-fill (`/api/auth/config`); null under discreet login → start blank. */
  readonly defaultHandle: string | null;
  /** Fires after the session cookie is minted — the dispatcher navigates home. */
  readonly onLoggedIn: () => void;
}

/** Handle + password → `POST /api/auth/login` → the `__Host-orb_session` cookie. */
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
    login(handle.trim(), password).then(onLoggedIn, (err: unknown) => {
      // `pending` stays true only until the failure lands — a success unmounts via the navigation.
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setPending(false);
    });
  };

  return (
    <form onSubmit={onSubmit} data-testid={testId("loginLocalForm")}>
      <Stack gap="block">
        <Field label="Handle">
          <Input
            autoComplete="username"
            value={handle}
            onValueChange={(value): void => setHandle(value)}
            data-testid={testId("loginHandle")}
          />
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
          <Text size="label" tone="destructive" role="alert" data-testid={testId("loginError")}>
            {error}
          </Text>
        )}
        <Button
          intent="primary"
          type="submit"
          disabled={!canSubmit}
          data-testid={testId("loginSubmit")}
        >
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </Stack>
    </form>
  );
}
