// The Users section's nav entry (SET-SEAMS stage 3) — the ONE `SettingsSubcategory` shared by the
// contribution def and the section body's `<Section>` anchor stamp; split out so neither imports the other
// (the system-tuning-nav precedent). The `(anchor, subId)` pair is byte-identical to the pre-split pane's
// own subcategory (§7.1), so every deep link and search leaf still lands.

import type { SettingsSubcategory } from "#state";

export const ADMIN_USERS_SUBCATEGORY: SettingsSubcategory = {
  id: "users",
  label: "Users",
  keywords: ["accounts", "people", "members", "roles", "agents"],
  settings: [
    {
      id: "create-user",
      label: "Create user",
      keywords: ["add", "invite", "account", "handle", "password"],
    },
    {
      id: "user-roles",
      label: "Roles & access",
      keywords: ["role", "admin", "owner", "promote", "demote", "disable", "enable"],
    },
    {
      id: "user-sessions",
      label: "Sessions",
      keywords: ["devices", "revoke", "sign out", "kick", "password reset"],
    },
  ],
};
