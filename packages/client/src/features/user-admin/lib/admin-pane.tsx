// The Admin settings pane (client-architecture-lockdown.md §8) — a FACTORY over the `admin`-anchored
// settings-section registry (Phase B ③): it merges each contributed section's nav into its subcategories and
// threads the registry into its surface, so the AppSettings admin-tier sections (memory tuning, rate limits)
// graft in WITHOUT growing this pane (pain-point §7 / the makeChatBehaviorPane precedent). `when` replaces
// the old `adminOnly` flag — the §6b "def declares, consumer supplies" inversion.

import { Lock } from "@orb/ui/icons";
import type { ContributorRegistry } from "#lib";
import type { SettingsPaneDefinition, SettingsSectionContribution, SettingsSubcategory } from "#state";
import { settingsSectionNavs } from "#state";
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

/** The admin pane is a host of the settings-section seam (Phase B ③). `sectionContributors` is the
 *  door-assembled `admin`-anchored registry; the pane merges each contribution's `nav` into its subcategory
 *  list and threads the registry into its surface by prop. Zero contributions ⇒ identical to the pre-seam
 *  pane (the makeChatBehaviorPane precedent). */
export function makeAdminPane(sectionContributors: ContributorRegistry<SettingsSectionContribution>): SettingsPaneDefinition {
  const contributedNavs = settingsSectionNavs(sectionContributors, "admin");
  return {
    id: "admin",
    group: "app",
    label: "Admin",
    icon: Lock,
    description: "Accounts, sessions, and the local inference engines on this deployment.",
    when: (viewer) => viewer.isAdmin,
    subcategories: [...OWN_SUBCATEGORIES, ...contributedNavs],
    body: () => <AdminSettingsSurface sectionContributors={sectionContributors} />,
  };
}
