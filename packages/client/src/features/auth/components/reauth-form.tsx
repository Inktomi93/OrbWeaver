// The rung-1 RE-AUTH form — the body of the
// `reauth` modal, homed in components/ so `lib/reauth-modal.tsx` exports only its definition.
//
// DISMISSAL IS A VERDICT, NOT A NO-OP. The owning modal definition reports a semantic dialog close as
// `dismissed`, so the ladder falls through to rung 2 (interactive login). Leaving a user on a frozen shell
// with a dead session would be the dishonest arm — it is the exact defect this design exists to kill.

import { Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { completeReauth, useAuthConfig } from "#data";
import { testId } from "#lib";
import { closeModal } from "#state";
import { LoginLocalForm } from "./login-local-form.tsx";

/** The modal body: one sentence of reassurance + the same credential form /login renders. */
export function ReauthForm(): ReactElement {
  const config = useAuthConfig();
  return (
    <Stack gap="block" data-testid={testId("reauthSurface")}>
      <Text voice="gloss">Your session expired. Sign back in and you'll pick up exactly where you left off — nothing you were working on has been lost.</Text>
      {/* The form seeds its handle from `defaultHandle` in `useState` — an INITIAL value, so mounting it
          before `/api/auth/config` lands would bake in a blank prefill that never corrects itself. Wait for
          the read (the AccountSurface precedent) rather than ship a field the user has to retype. */}
      {config.data === undefined ? (
        <Skeleton className="h-control-md w-full" />
      ) : (
        <LoginLocalForm
          defaultHandle={config.data.defaultHandle}
          onLoggedIn={(): void => {
            completeReauth("recovered");
            closeModal();
          }}
        />
      )}
    </Stack>
  );
}
