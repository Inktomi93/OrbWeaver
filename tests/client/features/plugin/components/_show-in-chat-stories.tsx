import { pluginsInstalledSection } from "@orb/client/features/plugin";
import { CtClientProviders, CtConfigGroupBody, isolationRegistry } from "@orb/testkit/browser";
import type { ReactElement } from "react";

const sections = isolationRegistry("configSections", "isolates the installed plugin cards from the other Plugins sections", [pluginsInstalledSection]);

/** The production installed-plugins section at the settings pane's width, with the card's real rows. */
export function InstalledPluginsStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtClientProviders>
      <div style={{ width, overflow: "visible" }}>
        <CtConfigGroupBody anchor={pluginsInstalledSection.anchor} sections={sections} />
      </div>
    </CtClientProviders>
  );
}
