// The /login surface — the per-mode dispatcher. Reads /api/auth/config and renders the matching body:
// single-user (only reachable by direct nav), local (credential form), forward-header (proxy-config
// explainer — an unauthenticated request here means the proxy didn't inject identity headers), oidc
// (whole-window redirect, never fetch). The route owns the shell anchor; this surface owns the card
// content + its own mount focus.

import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Heading, Text } from "@orb/ui/text";
import { useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useRef } from "react";
import type { AuthConfig } from "#data";
import { useAuthConfig } from "#data";
import { testId, useFocusOnMount } from "#lib";
import { LoginLocalForm } from "../components/login-local-form.tsx";
import { authErrorMessage } from "../lib/auth-error.ts";

/** The per-mode login card content (mounted inside `LoginShellAnchor` by the /login route). */
export function LoginSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const config = useAuthConfig();
  const navigate = useNavigate();
  const goHome = (): void => void navigate({ to: "/", replace: true });

  // A7 — the OIDC callback lands here with ?authError=<sanitized code> on any failed sign-in; surface it as a
  // human message above the Continue button. Read from location (the callback is a full-document 302, so the
  // SPA boots fresh with the param present) and mapped to copy — never the raw token.
  const authError = authErrorMessage(new URLSearchParams(globalThis.location.search).get("authError"));

  const body = ((): ReactElement => {
    if (config.isPending) {
      return <LoginLoading />;
    }
    if (config.data === undefined) {
      return <LoginUnreachable onRetry={(): void => void config.refetch()} />;
    }
    return <LoginBody config={config.data} authError={authError} onDone={goHome} />;
  })();

  return (
    <Stack ref={surfaceRef} tabIndex={-1} gap="block" className="outline-none">
      {body}
    </Stack>
  );
}

/** The per-mode arm dispatcher — pure (config in, arm out), router-free and CT-mountable directly.
 *  `authError` (A7) is the already-resolved OIDC callback error MESSAGE (or null); rendered above Continue. */
export function LoginBody({
  config,
  authError = null,
  onDone,
}: {
  readonly config: AuthConfig;
  readonly authError?: string | null;
  readonly onDone: () => void;
}): ReactElement {
  switch (config.mode) {
    case "local":
      return (
        <Stack gap="block">
          <Heading level={1}>Sign in</Heading>
          <LoginLocalForm defaultHandle={config.defaultHandle} onLoggedIn={onDone} />
        </Stack>
      );
    case "oidc":
      return (
        <Stack gap="block">
          <Heading level={1}>Sign in</Heading>
          <Text size="label" tone="muted">
            You'll be redirected to your identity provider, then back here.
          </Text>
          {authError === null ? null : (
            // `voice="label"` is the feature type axis; the destructive color rides a semantic-token className
            // (the same `text-destructive` the internal `tone` axis maps to) so this adds no density-tier debt.
            <Text voice="label" className="text-destructive" role="alert" data-testid={testId("loginAuthError")}>
              {authError}
            </Text>
          )}
          <Button
            intent="primary"
            data-testid={testId("loginOidc")}
            onClick={(): void => {
              // A whole-window navigation — the server 302s to the IdP; fetch can't follow the dance.
              globalThis.location.assign("/api/auth/oidc/login");
            }}
          >
            Continue
          </Button>
        </Stack>
      );
    case "forward-header":
      return (
        <Stack gap="block">
          <Heading level={1}>Authentication happens at your proxy</Heading>
          <Text size="label" tone="muted">
            This deployment uses forward-auth — the reverse proxy should authenticate you and inject identity headers before a request reaches the app. Seeing
            this page means it didn't: check the proxy configuration (authentik/Authelia/oauth2-proxy) and the FORWARD_AUTH_TRUSTED_PROXIES allowlist.
          </Text>
        </Stack>
      );
    case "single-user":
      return (
        <Stack gap="block">
          <Heading level={1}>Single-user mode</Heading>
          <Text size="label" tone="muted">
            No login needed — you're already in.
          </Text>
          <Button intent="primary" onClick={onDone}>
            Back to the app
          </Button>
        </Stack>
      );
    default:
      return assertNeverMode(config.mode);
  }
}

/** Exhaustiveness backstop — a new `AUTH_MODES` member fails `tsc` here. */
function assertNeverMode(mode: never): never {
  throw new Error(`unhandled auth mode: ${String(mode)}`);
}

function LoginLoading(): ReactElement {
  return (
    <Stack gap="row" aria-label="Loading sign-in options">
      <Skeleton className="h-control-md w-full" />
      <Skeleton className="h-control-md w-full" />
    </Stack>
  );
}

function LoginUnreachable({ onRetry }: { readonly onRetry: () => void }): ReactElement {
  return (
    <Stack gap="block">
      <Heading level={1}>Can't reach the server</Heading>
      <Text size="label" tone="muted">
        The app couldn't load its sign-in configuration. Check the server is running, then retry.
      </Text>
      <Button intent="ghost" onClick={onRetry}>
        Retry
      </Button>
    </Stack>
  );
}
