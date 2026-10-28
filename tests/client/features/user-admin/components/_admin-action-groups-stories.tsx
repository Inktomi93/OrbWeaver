import { systemTuningSection } from "@orb/client/features/user-admin";
import { useConfigSectionRegistry } from "@orb/client/state";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { CtAppearanceChannels, CtClientProviders, CtConfigGroupBody } from "@orb/testkit/browser";
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

function AdminResetNamesBody(): ReactElement {
  const sections = useConfigSectionRegistry();
  return <CtConfigGroupBody anchor="admin" sections={sections} />;
}

/** The actual registered Admin bodies share a pane, so section-level actions must remain distinguishable. */
export function AdminResetNamesStory({ width, appearance }: { readonly width: number; readonly appearance: AppearanceSettings }): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container style={{ inlineSize: width }} data-slot="admin-reset-host">
          <AdminResetNamesBody />
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
