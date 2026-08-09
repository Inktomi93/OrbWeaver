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
import { useEffect, useRef } from "react";
import type { AuthConfig } from "#data";
import { useAuthConfig } from "#data";
import { testId, useFocusOnMount } from "#lib";
import { LoginFirstRunForm } from "../components/login-first-run-form.tsx";
import { LoginLocalForm } from "../components/login-local-form.tsx";
import { authErrorMessage } from "../lib/auth-error.ts";
import { shouldAutoRedirectToSso } from "../lib/sso-redirect.ts";

/** The per-mode login card content (mounted inside `LoginShellAnchor` by the /login route). */
export function LoginSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const config = useAuthConfig();
  const navigate = useNavigate();
  const goHome = (): void => void navigate({ to: "/", replace: true });

  const search = globalThis.location.search;
  // A7 — the OIDC callback lands here with ?authError=<sanitized code> on any failed sign-in; surface it as a
  // human message above the Continue button. Read from location (the callback is a full-document 302, so the
  // SPA boots fresh with the param present) and mapped to copy — never the raw token.
  const authError = authErrorMessage(new URLSearchParams(search).get("authError"));

  // A9 — SSO-only auto-redirect: in oidc mode, send the browser straight to the IdP unless suppressed
  // (?authError after a failed round-trip, or ?form to force the manual button). The route guard already
  // keeps authed users off /login, so this only fires for the genuinely-unauthenticated case.
  const autoRedirect = config.data !== undefined && shouldAutoRedirectToSso(config.data.mode, search);
  useEffect(() => {
    if (autoRedirect) {
      globalThis.location.assign("/api/auth/oidc/login");
    }
  }, [autoRedirect]);

  const body = ((): ReactElement => {
    if (config.isPending) {
      return <LoginLoading />;
    }
    if (config.data === undefined) {
      return <LoginUnreachable onRetry={(): void => void config.refetch()} />;
    }
    if (autoRedirect) {
      // The effect above is navigating away — show a settled "redirecting" note, not the manual button that
      // would flash-then-vanish.
      return <LoginRedirecting providerName={config.data.oidcProviderName} />;
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
      // B4 — a fresh local box (owner has no password yet) renders the first-run setup form instead of the
      // credential form; the server serves `localFirstRun` only on a local/trusted origin, so this arm is
      // reachable exactly where the setup endpoint accepts a claim.
      return config.localFirstRun ? (
        <Stack gap="block">
          <Heading level={1}>Set up your server</Heading>
          <LoginFirstRunForm ownerHandle={config.defaultHandle} onDone={onDone} />
        </Stack>
      ) : (
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
            You'll be redirected to {config.oidcProviderName}, then back here.
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
            Continue with {config.oidcProviderName}
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

/** A9 — the settled "redirecting to the IdP" note shown while the auto-redirect effect navigates away. */
function LoginRedirecting({ providerName }: { readonly providerName: string }): ReactElement {
  return (
    <Stack gap="block">
      <Heading level={1}>Signing in…</Heading>
      <Text voice="label" className="text-muted-foreground">
        Redirecting you to {providerName}.
      </Text>
    </Stack>
  );
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
