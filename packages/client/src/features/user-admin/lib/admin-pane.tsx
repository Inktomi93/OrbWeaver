// The Admin settings pane (client-architecture-lockdown.md §8) — a HOST of the `admin`-anchored
// settings-section seam (Phase B ③): the AppSettings admin-tier sections (memory tuning, rate limits,
// system tuning) graft in WITHOUT growing this pane (pain-point §7), rendering inside its surface off the
// ONE door-assembled section registry while the shell merges their navs in. `when` replaces the old
// `adminOnly` flag — the §6b "def declares, consumer supplies" inversion.

import { Lock } from "@orb/ui/icons";
import type { SettingsPaneDefinition, SettingsSubcategory } from "#state";
import { AdminSettingsSurface } from "../surfaces/admin-settings-surface";
import { ADMIN_SUBCATEGORY_IDS } from "./admin-nav";

// The pane's OWN subcategories — the contributed section navs are appended after these (declared order).
const OWN_SUBCATEGORIES: readonly SettingsSubcategory[] = [
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
  {
    id: ADMIN_SUBCATEGORY_IDS.catalog,
    label: "Model catalog",
    keywords: ["models", "catalog", "sync", "refresh", "openrouter", "providers"],
  },
  {
    id: ADMIN_SUBCATEGORY_IDS.embeddings,
    label: "Card embeddings",
    keywords: ["embeddings", "cards", "reindex", "vectors", "backfill", "characters"],
  },
];

/** The admin pane — a host of the settings-section seam (Phase B ③). `subcategories` lists only what the
 *  pane itself renders; the shell appends the `admin`-anchored contributions' navs. */
export const adminPane: SettingsPaneDefinition = {
  id: "admin",
  group: "app",
  label: "Admin",
  icon: Lock,
  description: "Accounts, sessions, and the local inference engines on this deployment.",
  when: (viewer) => viewer.isAdmin,
  subcategories: OWN_SUBCATEGORIES,
  body: { kind: "surface", render: () => <AdminSettingsSurface /> },
};
