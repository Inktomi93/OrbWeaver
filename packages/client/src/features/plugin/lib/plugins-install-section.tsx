// The Plugins ADD-A-PLUGIN config-section CONTRIBUTION — the install/grant
// flow as the group's second row, ahead of the admin-gated distribute section (your plugins first, the
// deployment-wide control last — the order a person meets them in). Ungated (D147); no `owns`.

import type { ConfigSectionContribution } from "#state";
import { PluginsInstallSection } from "../components/plugins-install-section.tsx";
import { PLUGINS_INSTALL_SUBCATEGORY } from "./plugins-nav.ts";

export const pluginsInstallSection: ConfigSectionContribution = {
  id: "plugins-install",
  anchor: "plugins",
  nav: PLUGINS_INSTALL_SUBCATEGORY,
  body: () => <PluginsInstallSection />,
};
