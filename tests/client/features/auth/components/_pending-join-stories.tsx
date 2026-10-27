import { stashInboundJoinToken } from "@orb/client/data";
import { LoginShellAnchor, LoginSurface } from "@orb/client/features/auth";
import { useActiveChatId, useActiveSection } from "@orb/client/state";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { CtAppDataProviders, CtAppearanceChannels, CtIsolation } from "@orb/testkit/browser";
import { Container, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import { createBrowserHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useState } from "react";
import { JOIN_DESTINATION_LABEL } from "./pending-join-fixtures.ts";

function JoinDestination(): ReactElement {
  const chatId = useActiveChatId();
  const section = useActiveSection();
  return (
    <Stack>
      <Heading level={1}>{JOIN_DESTINATION_LABEL}</Heading>
      <Text>{`chat=${chatId ?? "none"} section=${section}`}</Text>
    </Stack>
  );
}

function PendingLogin(): ReactElement {
  return (
    <LoginShellAnchor>
      <LoginSurface />
    </LoginShellAnchor>
  );
}

/** Observe the public pre-session surface without mounting authenticated application content after navigation. */
export function PendingJoinStory(): ReactElement {
  const [router] = useState(() => {
    const root = createRootRoute();
    const login = createRoute({ getParentRoute: () => root, path: "/login", component: PendingLogin });
    const destination = createRoute({ getParentRoute: () => root, path: "/", component: JoinDestination });
    return createRouter({ routeTree: root.addChildren([login, destination]), history: createBrowserHistory() });
  });
  return (
    <CtIsolation subject="Pending join card" isolates="isolates controlled sign-up states from OIDC redirects and authenticated route content">
      <CtAppDataProviders>
        <RouterProvider router={router} />
      </CtAppDataProviders>
    </CtIsolation>
  );
}

/** Keep the real pre-session surface and router while constraining its card's content host. */
export function AuthActionGroupsStory({
  width,
  appearance,
  signupToken,
}: {
  readonly width: number;
  readonly appearance: AppearanceSettings;
  readonly signupToken?: string;
}): ReactElement {
  const [router] = useState(() => {
    if (signupToken !== undefined) {
      globalThis.history.replaceState(null, "", `/?join=${encodeURIComponent(signupToken)}`);
      stashInboundJoinToken();
      globalThis.history.replaceState(null, "", "/login");
    }
    const root = createRootRoute();
    const login = createRoute({ getParentRoute: () => root, path: "/login", component: LoginSurface });
    const destination = createRoute({ getParentRoute: () => root, path: "/", component: JoinDestination });
    return createRouter({ routeTree: root.addChildren([login, destination]), history: createBrowserHistory() });
  });
  return (
    <CtIsolation subject="Invite authentication actions" isolates="isolates the pre-session route from authenticated application content">
      <CtAppDataProviders>
        <CtAppearanceChannels settings={appearance}>
          <LoginShellAnchor>
            <Container className="max-inline-full" style={{ inlineSize: width }} data-slot="auth-action-host">
              <RouterProvider router={router} />
            </Container>
          </LoginShellAnchor>
        </CtAppearanceChannels>
      </CtAppDataProviders>
    </CtIsolation>
  );
}
