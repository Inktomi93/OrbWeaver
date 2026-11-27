// The Global settings section's nav entry (the read-only list of the server-wide settings rows). The ONE
// `ConfigSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp; split
// out so neither imports the other (the admin-approvals-nav precedent).

import type { ConfigSubcategory } from "#state";

export const ADMIN_GLOBAL_SETTINGS_SUBCATEGORY: ConfigSubcategory = {
  id: "global-settings",
  label: "Global settings",
  keywords: ["settings", "keys", "values", "stored", "kv", "server-wide", "inspect"],
  teach: {
    summary: "The server-wide settings rows stored for this deployment, each with its value and the time it was last written.",
    affects: ["nothing: a read-only view of what is stored"],
  },
  settings: [
    {
      id: "stored-rows",
      label: "Stored rows",
      keywords: ["key", "value", "updated", "kv"],
      teach: { summary: "Each stored global settings row with its value and last-written time.", affects: ["nothing: read-only"] },
    },
  ],
};
