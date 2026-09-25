// The /login surface — the per-mode dispatcher. Reads /api/auth/config and renders the matching body:
// single-user (only reachable by direct nav), local (credential form), forward-header (proxy-config
// explainer — an unauthenticated request here means the proxy didn't inject identity headers), oidc
// (whole-window redirect, never fetch; or the pending-join card when the callback held a join, D259). The
// route owns the shell anchor; this surface owns the card content + its own mount focus.

import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { WebSpinner } from "@orb/ui/spinner";
import { Heading, Text } from "@orb/ui/text";
import { useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import type { AuthConfig } from "#data";
import { clearJoinStash, peekJoinStash, useAuthConfig } from "#data";
import { testId, useFocusOnMount } from "#lib";
import { LoginFirstRunForm } from "../components/login-first-run-form.tsx";
import { LoginLocalForm } from "../components/login-local-form.tsx";
import { LoginPendingJoin } from "../components/login-pending-join.tsx";
import { LoginSignupForm } from "../components/login-signup-form.tsx";
import { LoginTransportNotice } from "../components/login-transport-notice.tsx";
import { authErrorMessage } from "../lib/auth-error.ts";
import { isPendingJoinLanding, oidcLoginUrl, shouldAutoRedirectToSso } from "../lib/sso-redirect.ts";

/** The per-mode login card content (mounted inside `LoginShellAnchor` by the /login route). */
export function LoginSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const config = useAuthConfig();
  const navigate = useNavigate();
  const goHome = (): void => void navigate({ to: "/", replace: true });
  // D259 — a signed-out invite visit stashed its token before the guard sent it here; the URL never carries it.
  const [joinToken, setJoinToken] = useState(peekJoinStash);
  const dismissJoin = (): void => {
    clearJoinStash();
    setJoinToken(null);
  };
  // D259 — the OIDC callback held a pending join and landed here with `?pendingJoin=1` (no secret in the URL).
  const [pendingJoin, setPendingJoin] = useState(() => isPendingJoinLanding(globalThis.location.search));
  const leavePendingJoin = (): void => {
    globalThis.history.replaceState(null, "", globalThis.location.pathname);
    setPendingJoin(false);
  };

  const search = globalThis.location.search;
  // A7 — the OIDC callback lands here with ?authError=<sanitized code> on any failed sign-in; surface it as a
  // human message above the Continue button. Read from location (the callback is a full-document 302, so the
  // SPA boots fresh with the param present) and mapped to copy — never the raw token.
  const authError = authErrorMessage(new URLSearchParams(search).get("authError"));

  // A9 (default flipped 2026-08-09) — DEFAULT is to render the branded login card; auto-redirect to the IdP
  // only on explicit ?sso (the instant-bounce opt-in), and never with ?authError (a failed round-trip). The
  // route guard already keeps authed users off /login, so this only ever runs for the unauthenticated case.
  const autoRedirect = config.data !== undefined && shouldAutoRedirectToSso(config.data.mode, search);
  const oidcLoginTarget = oidcLoginUrl(config.data?.multiHumanCapable === true ? joinToken : null);
  useEffect(() => {
    if (autoRedirect) {
      globalThis.location.assign(oidcLoginTarget);
    }
  }, [autoRedirect, oidcLoginTarget]);

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
    return (
      <LoginBody
        config={config.data}
        authError={authError}
        joinToken={joinToken}
        onDismissJoin={dismissJoin}
        pendingJoin={pendingJoin}
        onLeavePendingJoin={leavePendingJoin}
        onDone={goHome}
      />
    );
  })();

  return (
    <Stack ref={surfaceRef} tabIndex={-1} gap="block" className="outline-none">
      {body}
    </Stack>
  );
}

/** The per-mode arm dispatcher — pure (config in, arm out), router-free and CT-mountable directly.
 *  `authError` is the already-resolved OIDC callback error MESSAGE (or null); rendered above Continue.
 *  `joinToken` is the stashed invite token (or null); the local arm offers the signup form while it is set, and
 *  the oidc arm hands it to the login route. `pendingJoin` shows the oidc arm's pending-join card.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function LoginBody({
  config,
  authError = null,
  joinToken = null,
  onDismissJoin,
  pendingJoin = false,
  onLeavePendingJoin,
  onDone,
}: {
  readonly config: AuthConfig;
  readonly authError?: string | null;
  readonly joinToken?: string | null;
  readonly onDismissJoin?: () => void;
  readonly pendingJoin?: boolean;
  readonly onLeavePendingJoin?: () => void;
  readonly onDone: () => void;
}): ReactElement {
  switch (config.mode) {
    case "local":
      // B4 — a fresh local box (owner has no password yet) renders the first-run setup form instead of the
      // credential form; the server serves `localFirstRun` only on a local/trusted origin, so this arm is
      // reachable exactly where the setup endpoint accepts a claim.
      if (config.localFirstRun) {
        return (
          <Stack gap="block">
            <Heading level={1}>Set up your server</Heading>
            <LoginTransportNotice transport={config.transport} clientScope={config.clientScope} />
            <LoginFirstRunForm ownerHandle={config.defaultHandle} onDone={onDone} />
          </Stack>
        );
      }
      return joinToken !== null && config.multiHumanCapable ? (
        <LocalInviteArm config={config} joinToken={joinToken} onDismissJoin={onDismissJoin} onDone={onDone} />
      ) : (
        <Stack gap="block">
          <Heading level={1}>Sign in</Heading>
          <LoginTransportNotice transport={config.transport} clientScope={config.clientScope} />
          <LoginLocalForm defaultHandle={config.defaultHandle} onLoggedIn={onDone} />
        </Stack>
      );
    case "oidc":
      if (pendingJoin) {
        return (
          <LoginPendingJoin
            providerName={config.oidcProviderName}
            onJoined={(): void => {
              // The account is already seated in the room, so the stash has nothing left to open.
              onDismissJoin?.();
              onDone();
            }}
            onDismiss={(): void => onLeavePendingJoin?.()}
          />
        );
      }
      return (
        <Stack gap="block">
          <Heading level={1}>Sign in</Heading>
          <LoginTransportNotice transport={config.transport} clientScope={config.clientScope} />
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
              // A whole-window navigation — the server 302s to the IdP; fetch can't follow the dance. A stashed
              // invite rides along (D259) so a new identity can join through it.
              globalThis.location.assign(oidcLoginUrl(config.multiHumanCapable ? joinToken : null));
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

/** D259 — the local arm while an invite is stashed: create an account through it, or sign in to an existing
 *  one (the stash stays, so the join dialog opens after sign-in), or dismiss it. */
function LocalInviteArm({
  config,
  joinToken,
  onDismissJoin,
  onDone,
}: {
  readonly config: AuthConfig;
  readonly joinToken: string;
  readonly onDismissJoin: (() => void) | undefined;
  readonly onDone: () => void;
}): ReactElement {
  const [signIn, setSignIn] = useState(false);
  if (signIn) {
    return (
      <Stack gap="block">
        <Heading level={1}>Sign in to join</Heading>
        <LoginTransportNotice transport={config.transport} clientScope={config.clientScope} />
        <LoginLocalForm defaultHandle={config.defaultHandle} onLoggedIn={onDone} />
      </Stack>
    );
  }
  return (
    <Stack gap="block">
      <Heading level={1}>You're invited</Heading>
      <LoginTransportNotice transport={config.transport} clientScope={config.clientScope} />
      <Text size="label" tone="muted">
        Pick a handle and a password to create your account and join the room.
      </Text>
      <LoginSignupForm
        token={joinToken}
        onSignedUp={(): void => {
          // The account is already seated in the room, so the stash has nothing left to open.
          onDismissJoin?.();
          onDone();
        }}
        onUseSignIn={(): void => setSignIn(true)}
        onDismiss={(): void => onDismissJoin?.()}
      />
    </Stack>
  );
}

/** Exhaustiveness backstop — a new `AUTH_MODES` member fails `tsc` here. */
function assertNeverMode(mode: never): never {
  throw new Error(`unhandled auth mode: ${String(mode)}`);
}

/** A9 — the settled "redirecting to the IdP" note shown while the auto-redirect effect navigates away.
 *  The brand loader rides beside the copy (the backdrop's strand-out beat is the signature animation;
 *  this is the in-card heartbeat while the whole-window navigation lands). The copy carries the words,
 *  so the spinner's own status label stays terse. */
function LoginRedirecting({ providerName }: { readonly providerName: string }): ReactElement {
  return (
    <Stack gap="block">
      <Heading level={1}>Signing in…</Heading>
      <Row align="center" gap="row">
        <WebSpinner size="xl" label="Redirecting" className="text-primary" />
        <Text voice="label" className="text-muted-foreground">
          Redirecting you to {providerName}.
        </Text>
      </Row>
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
