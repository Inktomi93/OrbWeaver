import { useChromeRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser/ct-data-providers.tsx";
import type { ReactElement, ReactNode } from "react";

function RegisteredNotifications(): ReactNode {
  const widget = useChromeRegistry()
    .list()
    .find((entry) => entry.id === "notifications-bell");
  if (widget?.behavior.kind !== "widget") {
    throw new Error("Production composition omitted the notifications widget");
  }
  return widget.behavior.body("bar");
}

/** Mount the production widget contribution, not the shell or a copied feature assembly. */
export function NotificationInboxStory(): ReactElement {
  return (
    <CtClientProviders>
      <RegisteredNotifications />
    </CtClientProviders>
  );
}
