// The admin OPS settings-SECTION CONTRIBUTIONS (SET-SEAMS stage 3) — the two ops utilities user-admin
// exports on its front door; main.tsx assembles them into the ONE settings-section registry at the `admin`
// anchor. They share a file because their bodies do (`components/admin-ops-section.tsx`), and they stay TWO
// sections so their `(anchor, subId)` pairs survive the move byte-identically (§7.1).
//
// No `owns` claim on either: both drive verbs (catalog refresh, inline card embed), persisting nothing
// through the settings tiers, so they are exempt from the §2.3 key partition. No `when`: the admin pane
// carries the viewer gate.

import type { SettingsSectionContribution } from "#state";
import { AdminCatalogSection, AdminEmbedCardSection } from "../components/admin-ops-section.tsx";
import { ADMIN_CATALOG_SUBCATEGORY, ADMIN_EMBEDDINGS_SUBCATEGORY } from "./admin-ops-nav.ts";

export const adminCatalogSection: SettingsSectionContribution = {
  id: "admin-model-catalog",
  anchor: "admin",
  nav: ADMIN_CATALOG_SUBCATEGORY,
  body: () => <AdminCatalogSection />,
};

export const adminEmbeddingsSection: SettingsSectionContribution = {
  id: "admin-card-embeddings",
  anchor: "admin",
  nav: ADMIN_EMBEDDINGS_SUBCATEGORY,
  body: () => <AdminEmbedCardSection />,
};
