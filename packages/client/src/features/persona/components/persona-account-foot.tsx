// The switcher's ACCOUNT FOOT — the retired account modal's three facts (handle · role · auth-mode) + the
// mode-aware sign-out, dissolved into the persona switcher (#866 S4, owner-ruled F-3: one concept named
// "account"; D74 survives as You ⊃ Identity). single-user has no session to sign out of; forward-header
// signs out at the proxy/IdP; local/oidc run `signOut` (#data — POST /api/auth/logout, cross-tab notify,
// hard-redirect; the auth reads and the sign-out mechanics all live below the feature tier, which is what
// lets persona render identity without a cross-feature reach into auth).

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { signOut, useAuthConfig, useAuthMe } from "#data";
import { notify, testId } from "#lib";

/** The identity strip + Log out. The `accountSurface`/`accountLogout` test ids moved here WITH the facts
 *  they mark (the e2e drives follow the anatomy, not the container). */
export function PersonaAccountFoot(): ReactElement {
  const config = useAuthConfig();
  const me = useAuthMe();
  const [signingOut, setSigningOut] = useState(false);

  if (config.data === undefined || me.data === undefined) {
    return <Skeleton className="h-control-md w-full" />;
  }

  const { mode } = config.data;
  const { handle, role } = me.data;
  const canLogout = mode === "local" || mode === "oidc";

  return (
    <Stack gap="field" data-testid={testId("accountSurface")}>
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
          size="sm"
          className="justify-start"
          disabled={signingOut}
          data-testid={testId("accountLogout")}
          onClick={(): void => {
            setSigningOut(true);
            // A failed sign-out re-enables the button (the redirect never happened, so the control must
            // still work); a successful one navigates away and the reset is moot.
            signOut().catch((): void => {
              setSigningOut(false);
              notify.error("Couldn't sign out — try again.");
            });
          }}
        >
          {signingOut ? "Signing out…" : "Log out"}
        </Button>
      ) : (
        <Text size="label" tone="muted">
          {mode === "single-user" ? "Single-user mode — no session to sign out of." : "Sign out at your identity provider / reverse proxy."}
        </Text>
      )}
    </Stack>
  );
}
