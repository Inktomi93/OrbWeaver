import { pluginDistributeSection, pluginsInstalledSection, pluginsInstallSection } from "@orb/client/features/plugin";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** The registered install contribution, with its real preview and consent state. */
export function PluginInstallActionsStory({ width, appearance }: { readonly width: number; readonly appearance: Partial<AppearanceSettings> }): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container data-slot="plugin-install-subject" style={{ inlineSize: width }}>
          {pluginsInstallSection.body("plugin-install-subject")}
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}

/** Actual plugin settings contributions, isolated only from unrelated settings sections and shell layout. */
export function PluginActionGroupsStory({
  width,
  appearance,
  distribution = false,
}: {
  readonly width: number;
  readonly appearance: Partial<AppearanceSettings>;
  readonly distribution?: boolean;
}): ReactElement {
  const section = distribution ? pluginDistributeSection : pluginsInstalledSection;
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container data-slot="plugin-action-subject" style={{ inlineSize: width }}>
          {section.body("plugin-action-subject")}
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
