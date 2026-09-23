// The Plugins INSTALLED config-section CONTRIBUTION — the first of the
// Plugins group's rows, assembled into the ONE config-section registry at the `plugins` anchor by the door.
// UNGATED on purpose (D147): every user has their own plugins. No `owns`: plugin verbs, not settings.

import type { ConfigSectionContribution } from "#state";
import { PluginsInstalledSection } from "../components/plugins-installed-section.tsx";
import { PLUGINS_INSTALLED_SUBCATEGORY } from "./plugins-nav.ts";

export const pluginsInstalledSection: ConfigSectionContribution = {
  id: "plugins-installed",
  anchor: "plugins",
  nav: PLUGINS_INSTALLED_SUBCATEGORY,
  body: () => <PluginsInstalledSection />,
};
