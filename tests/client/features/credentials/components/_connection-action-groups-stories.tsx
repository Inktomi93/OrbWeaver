import { connectionsListSection } from "@orb/client/features/credentials";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** The real Connections contribution retains the list-to-editor focus handoff. */
export function ConnectionActionGroupsStory({ width, appearance }: { readonly width: number; readonly appearance: AppearanceSettings }): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container style={{ inlineSize: width }}>{connectionsListSection.body("connection-action-subject")}</Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
