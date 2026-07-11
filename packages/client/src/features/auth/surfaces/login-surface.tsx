// The /login SURFACE — the per-mode dispatcher (FINAL-Auth-Modes §7 P0; the neo login-surface shape,
// re-cut over orb's bootstrap seam). Reads `/api/auth/config` (cached, session-immutable) and renders
// the matching body:
//   single-user    → "no login needed" explainer + back-to-app (only reachable by direct navigation —
//                    the reverse-gate normally bounces this mode home before mount)
//   local          → the credential form (components/login-local-form.tsx)
//   forward-header → proxy-config explainer (an unauthenticated request here means the proxy did not
//                    inject the identity headers — an operator issue, not a user form)
//   oidc           → the IdP redirect button (a WHOLE-WINDOW navigation — the 302 dance must run in the
//                    browser, never fetch)
// The route owns the shell anchor; this surface owns the card content + its own mount focus (the
// surface-a11y-focus contract). Post-login lands on `/` (no `next` carry — the URL-pinned shell,
// UI-Arch §5.1).

import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Heading, Text } from "@orb/ui/text";
import { useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useRef } from "react";
import { testId, useFocusOnMount } from "#lib";
import { LoginLocalForm } from "../components/login-local-form";
import { useAuthConfig } from "../hooks/use-auth-meta";
import type { AuthConfig } from "../lib/auth-bootstrap";

/** The per-mode login card content (mounted inside `LoginShellAnchor` by the /login route). */
export function LoginSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const config = useAuthConfig();
  const navigate = useNavigate();
  const goHome = (): void => void navigate({ to: "/", replace: true });

  const body = ((): ReactElement => {
    if (config.isPending) {
      return <LoginLoading />;
    }
    if (config.data === undefined) {
      return <LoginUnreachable onRetry={(): void => void config.refetch()} />;
    }
    return <LoginBody config={config.data} onDone={goHome} />;
  })();

  return (
    <Stack ref={surfaceRef} tabIndex={-1} gap="block" className="outline-none">
      {body}
    </Stack>
  );
}

/** The per-mode arm dispatcher — pure (config in, arm out; `onDone` is the only side channel, so it is
 *  router-free and CT-mountable directly). Exported for the mode-arm reachability CT (the settings
 *  `SystemSettingsSurface` internal-export precedent). `LoginSurface` wraps it with the config read +
 *  the `useNavigate` home-nav. */
export function LoginBody({
  config,
  onDone,
}: {
  readonly config: AuthConfig;
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
            This deployment uses forward-auth — the reverse proxy should authenticate you and inject
            identity headers before a request reaches the app. Seeing this page means it didn't:
            check the proxy configuration (authentik/Authelia/oauth2-proxy) and the
            FORWARD_AUTH_TRUSTED_PROXIES allowlist.
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

/** Exhaustiveness backstop — a new `AUTH_MODES` member fails `tsc` here (spine §5.5 dispatch discipline). */
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
