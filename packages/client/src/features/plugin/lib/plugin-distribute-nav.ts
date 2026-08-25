// The "Distribute to everyone" section's nav entry (D147 clause (d) — the admin fan-out). The ONE
// `SettingsSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp; split
// out so neither imports the other (the admin-link-sso-nav precedent).

import type { SettingsSubcategory } from "#state";

export const PLUGIN_DISTRIBUTE_SUBCATEGORY: SettingsSubcategory = {
  id: "distribute",
  label: "Distribute to everyone",
  navLabel: "Distribute",
  keywords: ["distribute", "everyone", "all users", "server-wide", "deploy", "publish", "admin", "roll out", "withdraw"],
  settings: [
    {
      id: "published-plugins",
      label: "Plugins published to every account",
      keywords: ["published", "distributed", "server-wide", "withdraw", "remove for everyone"],
    },
  ],
};
