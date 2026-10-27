import type { ChromePresentation } from "@orb/client/state";
import { useChromeRegistry } from "@orb/client/state";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

function RegisteredNotifications({ presentation = "bar" }: { readonly presentation?: ChromePresentation }): ReactNode {
  const widget = useChromeRegistry()
    .list()
    .find((entry) => entry.id === "notifications-bell");
  if (widget?.behavior.kind !== "widget") {
    throw new Error("Production composition omitted the notifications widget");
  }
  return widget.behavior.body(presentation);
}

/** The same registered notification owner in its inline phone lens. */
export function NotificationActionGroupsStory({
  width,
  appearance,
  presentation,
}: {
  readonly width: number;
  readonly appearance: AppearanceSettings;
  readonly presentation: ChromePresentation;
}): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container style={{ inlineSize: width }} data-slot="notification-action-host">
          <RegisteredNotifications presentation={presentation} />
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}

/** Mount the production widget contribution, not the shell or a copied feature assembly. */
export function NotificationInboxStory(): ReactElement {
  return (
    <CtClientProviders>
      <RegisteredNotifications />
    </CtClientProviders>
  );
}
