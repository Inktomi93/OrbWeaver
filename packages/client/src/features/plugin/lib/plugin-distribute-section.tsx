// The "Distribute to everyone" settings-SECTION CONTRIBUTION (D147 clause (d)) — plugin exports it on its
// front door; main.tsx assembles it into the ONE settings-section registry at the `plugins` anchor.
//
// IT CARRIES ITS OWN `when`, and that is the whole placement decision. The Plugins PANE must stay ungated —
// every user has their own plugins and hiding them is the failure D147 exists to prevent — so the admin half
// can only be a section with a viewer gate of its own. `plugins-pane.tsx`'s header predicted exactly this
// shape ("a separate section or pane, never a gate on this one"). The gate is UX, not authority: all three
// verbs behind it are `adminProcedure` + a domain `requireAdmin`, so a member who somehow rendered this could
// still do nothing.
//
// No `owns` claim: the section persists nothing through the settings tiers — a distribution is a row behind
// the `plugin.*` verbs — so it is exempt from the §2.3 key partition.

import type { ConfigSectionContribution } from "#state";
import { PluginDistributeSection } from "../components/plugin-distribute-section.tsx";
import { PLUGIN_DISTRIBUTE_SUBCATEGORY } from "./plugin-distribute-nav.ts";

export const pluginDistributeSection: ConfigSectionContribution = {
  id: "plugin-distribute",
  anchor: "plugins",
  nav: PLUGIN_DISTRIBUTE_SUBCATEGORY,
  when: (viewer) => viewer.isAdmin,
  body: () => <PluginDistributeSection />,
};
