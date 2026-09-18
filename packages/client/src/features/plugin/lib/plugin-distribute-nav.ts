// The "Distribute to everyone" section's nav entry (D147 clause (d) — the admin fan-out). The ONE
// `ConfigSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp; split
// out so neither imports the other (the admin-link-sso-nav precedent).

import type { ConfigSubcategory } from "#state";

export const PLUGIN_DISTRIBUTE_SUBCATEGORY: ConfigSubcategory = {
  id: "distribute",
  label: "Distribute to everyone",
  navLabel: "Distribute",
  keywords: ["distribute", "everyone", "all users", "server-wide", "deploy", "publish", "admin", "roll out", "withdraw"],
  teach: {
    summary: "Publish a plugin to every account on this deployment, or withdraw it. Admin only.",
    affects: ["every account on this deployment"],
  },
  settings: [
    {
      id: "published-plugins",
      label: "Plugins published to every account",
      keywords: ["published", "distributed", "server-wide", "withdraw", "remove for everyone"],
      teach: {
        summary: "Plugins published to every account on this deployment; withdrawing removes them for everyone.",
        affects: ["every account on this deployment"],
      },
    },
  ],
};
