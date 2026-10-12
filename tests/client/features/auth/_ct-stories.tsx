// Auth feature CT stories (docs/law/Spine-Testing.md §7 — CT mounts ONLY from a non-test module; the
// same-module value+component split). `LoginLocalFormStory` mounts the credential form standalone (no
// router/query providers needed — plain controlled state + a raw fetch the test stubs via `page.route`)
// and surfaces the `onLoggedIn` callback as rendered text so the test can assert the success path
// without a navigation harness.

import { recoverIfUnauthorizedCode, useSessionRecovery, useTRPC } from "@orb/client/data";
import { LoginShellAnchor } from "@orb/client/features/auth";
import { closeModal, useActiveChatId, useActiveSection, useOpenModal } from "@orb/client/state";
import { CtDataProviders, CtRealSectionRegistry } from "@orb/testkit/browser/ct-data-providers.tsx";
import { storyTestId } from "@orb/testkit/browser/story-test-ids.ts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { StrictMode, useState } from "react";
// The form + the per-mode dispatcher are feature INTERNALS the front door doesn't re-export — the
// settings _ct-stories.tsx precedent for reaching one directly.
import type { AuthConfig } from "#client/data/auth-config.ts";
// The shell's modal HOST — the seam that owns the re-auth prompt's dismissal verdict.
import { ModalHost } from "#client/features/app-shell/components/modal-host.tsx";
import { LoginFirstRunForm } from "#client/features/auth/components/login-first-run-form.tsx";
import { LoginLocalForm } from "#client/features/auth/components/login-local-form.tsx";
import { LoginBody } from "#client/features/auth/surfaces/login-surface.tsx";
import { LoginPage } from "#client/routes/login-page.tsx";

/** The per-mode login arm (LoginBody) — mounted router-free with a stub `onDone`, so the CT can prove
 *  each mode renders its arm (esp. the forward-header explainer an unauthenticated broken-proxy request
 *  lands on). A partial config is enough — LoginBody reads only `mode` + `defaultHandle`. `authError` (A7)
 *  is the already-resolved OIDC callback error message, rendered above the Continue button in the oidc arm. */
export function LoginArmStory({
  config,
  authError = null,
  joinToken = null,
}: {
  readonly config: AuthConfig;
  readonly authError?: string | null;
  readonly joinToken?: string | null;
}): ReactElement {
  const [done, setDone] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Where the shell would land after the arm finishes: a sign-up through an invite selects the joined room.
  const activeChatId = useActiveChatId();
  const activeSection = useActiveSection();
  return (
    <CtDataProviders>
      <div style={{ width: 360, padding: 16 }}>
        <LoginBody
          config={config}
          authError={authError}
          joinToken={joinToken}
          onDismissJoin={(): void => setDismissed(true)}
          onDone={(): void => {
            setDone(true);
          }}
        />
        {done ? <p data-testid={storyTestId("ctLoginDone")}>done</p> : null}
        <output data-testid={storyTestId("ctLoginInviteDismissed")}>{String(dismissed)}</output>
        <output data-testid={storyTestId("ctLoginLanding")}>{`chat=${activeChatId ?? "none"} section=${activeSection}`}</output>
      </div>
    </CtDataProviders>
  );
}

/** D259 — the oidc arm on the callback's pending-join landing, inside the query providers the preview read needs.
 *  `onDone` (joined and signed in) and `onLeavePendingJoin` (left the card) surface as rendered text. */
export function LoginPendingJoinStory({ config }: { readonly config: AuthConfig }): ReactElement {
  const [done, setDone] = useState(false);
  const [left, setLeft] = useState(false);
  // Where the shell would land after the join: a signed-in confirm selects the joined room.
  const activeChatId = useActiveChatId();
  const activeSection = useActiveSection();
  return (
    <CtDataProviders>
      <div style={{ width: 360, padding: 16 }}>
        <LoginBody
          config={config}
          pendingJoin={!left}
          onLeavePendingJoin={(): void => {
            setLeft(true);
          }}
          onDone={(): void => {
            setDone(true);
          }}
        />
        {done ? <p data-testid={storyTestId("ctLoginDone")}>done</p> : null}
        <output data-testid={storyTestId("ctLoginLanding")}>{`chat=${activeChatId ?? "none"} section=${activeSection}`}</output>
      </div>
    </CtDataProviders>
  );
}

/** The WHOLE login scene (anchor + web backdrop + wordmark + card body) at a FIXED container width —
 *  the §0 container-model law: phone-vs-desktop is proven at the CONTAINER, not the viewport. The
 *  backdrop reads `/api/auth/config` through the query layer, so the story wraps CtDataProviders and
 *  the CT stubs the route. `overflow: visible` so a horizontal overflow defect stays measurable. */
export function LoginSceneStory({ width, config }: { readonly width: number; readonly config: AuthConfig }): ReactElement {
  return (
    <CtDataProviders>
      <div data-testid={storyTestId("ctLoginScene")} style={{ width, overflow: "visible" }}>
        <LoginShellAnchor>
          <LoginBody
            config={config}
            onDone={(): void => {
              // no-op — the scene rendering is what the CT asserts.
            }}
          />
        </LoginShellAnchor>
      </div>
    </CtDataProviders>
  );
}

/** #310 — the whole login scene at the VIEWPORT (no fixed-width wrapper) with a stashed invite, so the local arm
 *  renders the tallest card the page carries: the invite sign-up form. The geometry CT sizes the viewport itself
 *  and scrolls the anchor with a real wheel or thumb. */
export function LoginInviteSceneStory({ config, joinToken }: { readonly config: AuthConfig; readonly joinToken: string }): ReactElement {
  return (
    <CtDataProviders>
      <LoginShellAnchor>
        <LoginBody
          config={config}
          joinToken={joinToken}
          onDone={(): void => {
            // no-op — the scene geometry is what the CT asserts.
          }}
        />
      </LoginShellAnchor>
    </CtDataProviders>
  );
}

/** The production login route with its real query-driven surface. This story exists for the load-to-form
 *  geometry seam: the CT can hold `/api/auth/config` pending, measure the skeleton card, release the same
 *  request, and measure the resolved sign-in form without substituting either state. */
export function LoginConfigTransitionStory(): ReactElement {
  const [router] = useState(() => {
    const root = createRootRoute();
    const login = createRoute({ getParentRoute: () => root, path: "/", component: LoginPage });
    return createRouter({ routeTree: root.addChildren([login]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  });
  return (
    <CtDataProviders>
      <RouterProvider router={router} />
    </CtDataProviders>
  );
}

export function LoginLocalFormStory({ defaultHandle }: { readonly defaultHandle: string | null }): ReactElement {
  const [loggedIn, setLoggedIn] = useState(false);
  return (
    <div style={{ width: 360, padding: 16 }}>
      {loggedIn ? (
        <p data-testid={storyTestId("ctLoggedIn")}>logged in</p>
      ) : (
        <LoginLocalForm defaultHandle={defaultHandle} onLoggedIn={(): void => setLoggedIn(true)} />
      )}
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
      {done ? <p data-testid={storyTestId("ctFirstRunDone")}>set up</p> : <LoginFirstRunForm ownerHandle={ownerHandle} onDone={(): void => setDone(true)} />}
    </div>
  );
}

/** THE SESSION LADDER, end to end, through the production mount. `useSessionRecovery` binds the recovery host
 *  exactly as `app-root` does and the shell's real `ModalHost` shows the re-auth prompt, so the probe only kills
 *  the session the way the socket does: UNAUTHORIZED → probe says signed-out → local mode → the modal opens → a
 *  password → resume IN PLACE. Resuming re-reads the identity, so the rendered `resumes` counter (completed
 *  `sessions.me` reads after the first) is the claim: recovery happened and the surface was never navigated away
 *  from (a rung-2 redirect would tear this mount down). Dismissing the prompt is the other verdict: the wire is
 *  `Dialog onOpenChange(false)` → `def.onClose()` → `completeReauth("dismissed")` → rung 2, and if it breaks
 *  NOTHING renders differently while `runLadder` holds the `orb:session-recovery` Web Lock forever, so the CT
 *  observes the rung-2 navigation itself. */
function ReauthLadderProbe(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const open = useOpenModal();
  useSessionRecovery();
  useQuery(trpc.sessions.me.queryOptions());
  const resumes = Math.max((queryClient.getQueryState(trpc.sessions.me.queryKey())?.dataUpdateCount ?? 0) - 1, 0);
  return (
    <div style={{ width: 420, padding: 16 }}>
      <button type="button" data-testid={storyTestId("ctKillSession")} onClick={(): void => void recoverIfUnauthorizedCode("UNAUTHORIZED")}>
        kill the session
      </button>
      <output data-testid={storyTestId("ctResumes")}>{String(resumes)}</output>
      <ModalHost onClose={closeModal} openModal={open} />
    </div>
  );
}

export function ReauthLadderStory(): ReactElement {
  return (
    <StrictMode>
      <CtDataProviders>
        <CtRealSectionRegistry>
          <ReauthLadderProbe />
        </CtRealSectionRegistry>
      </CtDataProviders>
    </StrictMode>
  );
}

export function ReauthDismissalStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <ReauthLadderProbe />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}
