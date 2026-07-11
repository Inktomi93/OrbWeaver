// The ACCOUNT modal body (UI-Arch §4.2 avatar-chip row — "quick identity card"; the reserved
// `MODAL_SLOTS.account` placeholder this surface replaces, route-composed at home-page.tsx). Identity +
// role + auth-mode at a glance, and the mode-aware sign-out:
//   single-user      → no session concept (nothing to sign out of)
//   forward-header   → sign-out happens at the proxy/IdP, not here
//   local / oidc     → POST /api/auth/logout, then a HARD redirect to /login — a full document load is
//                      the sanctioned post-logout reset (drops every in-memory cache/store so a shared
//                      browser can't leak the prior user's data; the persona-panel logout precedent).
// Reads ride the public bootstrap endpoints (mode + me), so this renders correctly even while tRPC reads
// are still resolving. Mounted inside the ModalHost Dialog (focus-trapped); the surface still manages its
// own mount focus per the surface-a11y-focus contract (the settings-shell precedent).

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { notify, testId, useFocusOnMount } from "#lib";
import { useAuthConfig, useAuthMe } from "../hooks/use-auth-meta";
import { logout } from "../lib/auth-bootstrap";

/** Sign out, then hard-redirect (see the file header for why a full document load is the reset). */
async function signOut(): Promise<void> {
  try {
    await logout();
    globalThis.location.assign("/login");
  } catch {
    notify.error("Couldn't sign out — try again.");
  }
}

/** The quick identity card: handle · role badge · mode badge · mode-aware sign-out. */
export function AccountSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const config = useAuthConfig();
  const me = useAuthMe();
  const [signingOut, setSigningOut] = useState(false);

  if (config.data === undefined || me.data === undefined) {
    return (
      <Stack ref={surfaceRef} tabIndex={-1} gap="row" className="outline-none">
        <Skeleton className="h-control-md w-full" />
      </Stack>
    );
  }

  const { mode } = config.data;
  const { handle, role } = me.data;
  const canLogout = mode === "local" || mode === "oidc";

  return (
    <Stack
      ref={surfaceRef}
      tabIndex={-1}
      gap="block"
      className="outline-none"
      data-testid={testId("accountSurface")}
    >
      <Row gap="row" align="center">
        <Text weight="semibold" className="min-w-0 truncate font-mono">
          {handle ?? "—"}
        </Text>
        {role === null ? null : <Badge>{role}</Badge>}
        <Badge>{mode}</Badge>
      </Row>
      {canLogout ? (
        <Button
          intent="ghost"
          disabled={signingOut}
          data-testid={testId("accountLogout")}
          onClick={(): void => {
            setSigningOut(true);
            void signOut().finally((): void => setSigningOut(false));
          }}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      ) : (
        <Text size="label" tone="muted">
          {mode === "single-user"
            ? "Single-user mode — no session to sign out of."
            : "Sign out at your identity provider / reverse proxy."}
        </Text>
      )}
    </Stack>
  );
}
