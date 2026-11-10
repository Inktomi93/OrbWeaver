// The switcher's ACCOUNT FOOT — the retired account modal's three facts (handle · role · auth-mode) + the
// mode-aware sign-out, dissolved into the persona switcher (#866 S4, owner-ruled F-3: one concept named
// "account"; D74 survives as You ⊃ Identity). single-user has no session to sign out of; forward-header
// signs out at the proxy/IdP; local/oidc run `signOut` (#data — POST /api/auth/logout, cross-tab notify,
// hard-redirect; the auth reads and the sign-out mechanics all live below the feature tier, which is what
// lets persona render identity without a cross-feature reach into auth).

import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, StatusChip, USER_ROLE_STATUS } from "#components";
import { authConfigOptions, authMeOptions, QueryErrorState, signOut, useSuspenseQuery } from "#data";
import { notify, testId } from "#lib";

/** The identity strip + Log out. The `accountSurface`/`accountLogout` test ids moved here WITH the facts
 *  they mark (the e2e drives follow the anatomy, not the container). */
export function PersonaAccountFoot(): ReactElement {
  return (
    <QueryBoundary
      fallback={<Skeleton width="full" height="controlMd" />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your account" onRetry={retry} />}
      resetKeys={[]}
    >
      <AccountFootBody />
    </QueryBoundary>
  );
}

function AccountFootBody(): ReactElement {
  const { mode } = useSuspenseQuery(authConfigOptions).data;
  const { handle, role } = useSuspenseQuery(authMeOptions).data;
  const [signingOut, setSigningOut] = useState(false);
  const canLogout = mode === "local" || mode === "oidc";
  // The role shows only when it says something the handle does not; the auth mode is plumbing, never shown.
  const showRole = role !== null && role !== handle;

  return (
    <Stack gap="field" data-testid={testId("accountSurface")}>
      <Row gap="row" align="center">
        <Text truncate={true} voice="label">
          {handle === null ? "Signed in" : `Signed in as ${handle}`}
        </Text>
        {showRole ? <StatusChip status={role} vocabulary={USER_ROLE_STATUS} /> : null}
      </Row>
      {canLogout ? (
        <Button
          variant="ghost"
          size="sm"
          justify="start"
          disabled={signingOut}
          data-testid={testId("accountLogout")}
          onClick={(): void => {
            setSigningOut(true);
            // A failed sign-out re-enables the button (the redirect never happened, so the control must
            // still work); a successful one navigates away and the reset is moot.
            signOut().catch((): void => {
              setSigningOut(false);
              notify.error("Couldn't sign out. Try again.");
            });
          }}
        >
          {signingOut ? "Signing out…" : "Log out"}
        </Button>
      ) : (
        <Text voice="gloss">
          {mode === "single-user" ? "Single-user mode: no session to sign out of." : "Sign out at your identity provider / reverse proxy."}
        </Text>
      )}
    </Stack>
  );
}
