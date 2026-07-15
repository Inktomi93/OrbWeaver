// The Admin settings pane (client-architecture-lockdown.md §8) — co-located SettingsPaneDefinition
// wrapping the existing surface. TEMPORARY home (M6.1: panes stay put; the user-admin-owned move is M6.2).
// `when` replaces the old `adminOnly` flag — the §6b "def declares, consumer supplies" inversion.

import { Lock } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";
import { AdminSettingsSurface } from "../surfaces/admin-settings-surface";
import { ADMIN_SUBCATEGORY_IDS } from "./admin-nav";

export const adminPane: SettingsPaneDefinition = {
  id: "admin",
  group: "app",
  label: "Admin",
  icon: Lock,
  description: "Accounts, sessions, and the local inference engines on this deployment.",
  when: (viewer) => viewer.isAdmin,
  subcategories: [
    {
      id: ADMIN_SUBCATEGORY_IDS.users,
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
    },
    {
      id: ADMIN_SUBCATEGORY_IDS.engines,
      label: "Engines",
      keywords: ["vllm", "gpu", "inference", "restart", "supervisor", "health"],
      settings: [
        {
          id: "engine-restart",
          label: "Restart an engine",
          keywords: ["vllm", "bounce", "hung", "failed", "embed", "rerank"],
        },
      ],
    },
  ],
  body: () => <AdminSettingsSurface />,
};
