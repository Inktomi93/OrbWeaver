// The ADD-A-PLUGIN section (Settings → Plugins) — the install/grant flow: the dropzone → the grant screen →
// the confirm card (`plugin-install-card.tsx`). The grant screen is the SECURITY surface of the feature
// (#24), which is why it lives beside Connections on the app shelf where a reader already looks for "what
// can reach what". Per-user and ungated, like the Installed section above it (D147).

import { Section } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { configAnchorId } from "#state";
import { PLUGINS_INSTALL_SUBCATEGORY } from "../lib/plugins-nav.ts";
import { PluginInstallCard } from "./plugin-install-card.tsx";

export function PluginsInstallSection(): ReactElement {
  return (
    <Section divider={true} heading={PLUGINS_INSTALL_SUBCATEGORY.label} id={configAnchorId("plugins", PLUGINS_INSTALL_SUBCATEGORY.id)}>
      <PluginInstallCard />
    </Section>
  );
}
