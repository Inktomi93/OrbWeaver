// A2 — the Approvals section's nav entry (the account-approval queue for OIDC_REQUIRE_APPROVAL). The ONE
// `ConfigSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp; split
// out so neither imports the other (the admin-users-nav precedent).

import type { ConfigSubcategory } from "#state";

export const ADMIN_APPROVALS_SUBCATEGORY: ConfigSubcategory = {
  id: "approvals",
  label: "Approvals",
  keywords: ["pending", "approve", "sso", "oidc", "disabled", "grant access", "new users"],
  settings: [
    {
      id: "pending-accounts",
      label: "Pending accounts",
      keywords: ["approve", "enable", "grant", "sso", "oidc", "awaiting"],
    },
  ],
};
