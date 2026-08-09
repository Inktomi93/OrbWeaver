// Auth feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module; the
// same-module value+component split). `LoginLocalFormStory` mounts the credential form standalone (no
// router/query providers needed — plain controlled state + a raw fetch the test stubs via `page.route`)
// and surfaces the `onLoggedIn` callback as rendered text so the test can assert the success path
// without a navigation harness.

import { AccountSurface } from "@orb/client/features/auth";
import type { ReactElement } from "react";
import { useState } from "react";
// The form + the per-mode dispatcher are feature INTERNALS the front door doesn't re-export — the
// settings _ct-stories.tsx precedent for reaching one directly.
import type { AuthConfig } from "../../../../packages/client/src/data/auth-config.ts";
import { LoginFirstRunForm } from "../../../../packages/client/src/features/auth/components/login-first-run-form.tsx";
import { LoginLocalForm } from "../../../../packages/client/src/features/auth/components/login-local-form.tsx";
import { LoginBody } from "../../../../packages/client/src/features/auth/surfaces/login-surface.tsx";
import { CtDataProviders } from "../../../support/ct/ct-data-providers.tsx";

/** The REAL `AccountSurface` (the modal body the desktop rail-foot Account entry opens via
 *  `openModal("account")`) inside the client data layer — the auth `/config` + `/me` reads are stubbed
 *  with `page.route`. Proves the desktop account entry reaches a real, wired surface (P1-c). */
export function AccountSurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 360, padding: 16 }}>
        <AccountSurface />
      </div>
    </CtDataProviders>
  );
}

/** The per-mode login arm (LoginBody) — mounted router-free with a stub `onDone`, so the CT can prove
 *  each mode renders its arm (esp. the forward-header explainer an unauthenticated broken-proxy request
 *  lands on). A partial config is enough — LoginBody reads only `mode` + `defaultHandle`. `authError` (A7)
 *  is the already-resolved OIDC callback error message, rendered above the Continue button in the oidc arm. */
export function LoginArmStory({ config, authError = null }: { readonly config: AuthConfig; readonly authError?: string | null }): ReactElement {
  return (
    <div style={{ width: 360, padding: 16 }}>
      <LoginBody
        config={config}
        authError={authError}
        onDone={(): void => {
          // no-op in the story — the arm rendering is what the CT asserts.
        }}
      />
    </div>
  );
}

export function LoginLocalFormStory({ defaultHandle }: { readonly defaultHandle: string | null }): ReactElement {
  const [loggedIn, setLoggedIn] = useState(false);
  return (
    <div style={{ width: 360, padding: 16 }}>
      {loggedIn ? <p data-testid="ct-logged-in">logged in</p> : <LoginLocalForm defaultHandle={defaultHandle} onLoggedIn={(): void => setLoggedIn(true)} />}
    </div>
  );
}

/** B4 — the first-run owner-password setup form standalone (no router/query providers — plain controlled
 *  state + a raw fetch to `/api/auth/first-run` the CT stubs via `page.route`). `onDone` surfaces as rendered
 *  text so the CT asserts the success path without a navigation harness. */
export function LoginFirstRunFormStory({ ownerHandle }: { readonly ownerHandle: string | null }): ReactElement {
  const [done, setDone] = useState(false);
  return (
    <div style={{ width: 360, padding: 16 }}>
      {done ? <p data-testid="ct-first-run-done">set up</p> : <LoginFirstRunForm ownerHandle={ownerHandle} onDone={(): void => setDone(true)} />}
    </div>
  );
}
