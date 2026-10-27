import { systemTuningSection } from "@orb/client/features/user-admin";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** Mount the production admin contribution, including its real override write and readback. */
export function AdminActionGroupsStory({ width, appearance }: { readonly width: number; readonly appearance: AppearanceSettings }): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container style={{ inlineSize: width }} data-slot="admin-action-host">
          {systemTuningSection.body("admin-action-subject")}
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
