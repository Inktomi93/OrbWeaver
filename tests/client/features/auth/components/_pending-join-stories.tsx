import { LoginShellAnchor, LoginSurface } from "@orb/client/features/auth";
import { useActiveChatId, useActiveSection } from "@orb/client/state";
import { CtAppDataProviders } from "@orb/testkit/browser/ct-data-providers.tsx";
import { CtIsolation } from "@orb/testkit/browser/ct-isolated-subject.tsx";
import { Stack } from "@orb/ui/layout";
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
