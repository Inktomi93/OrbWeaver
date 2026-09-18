// The Users section's nav entry (SET-SEAMS stage 3) — the ONE `ConfigSubcategory` shared by the
// contribution def and the section body's `<Section>` anchor stamp; split out so neither imports the other
// (the system-tuning-nav precedent). The `(anchor, subId)` pair is byte-identical to the pre-split pane's
// own subcategory (§7.1), so every deep link and search leaf still lands.

import type { ConfigSubcategory } from "#state";

export const ADMIN_USERS_SUBCATEGORY: ConfigSubcategory = {
  id: "users",
  label: "Users",
  keywords: ["accounts", "people", "members", "roles", "agents"],
  teach: {
    summary: "Account management: create local users, assign global roles, and revoke individual sessions.",
    affects: ["who can sign in and what each account may administer, deployment-wide"],
  },
  settings: [
    {
      id: "create-user",
      label: "Create user",
      keywords: ["add", "invite", "account", "handle", "password"],
      teach: {
        summary: "Mint a local account with a handle and password. SSO deployments provision through the identity provider instead.",
        affects: ["who can sign in to this deployment"],
      },
    },
    {
      id: "user-roles",
      label: "Roles & access",
      keywords: ["role", "admin", "owner", "promote", "demote", "disable", "enable"],
      teach: {
        summary: "Each account's global role \u2014 what it may administer, not what it may chat about.",
        affects: ["that account's reach across the whole deployment"],
      },
    },
    {
      id: "user-sessions",
      label: "Sessions",
      keywords: ["devices", "revoke", "sign out", "kick", "password reset"],
      teach: { summary: "An account's live sessions, revocable one by one.", affects: ["that account's signed-in devices"] },
    },
  ],
};
