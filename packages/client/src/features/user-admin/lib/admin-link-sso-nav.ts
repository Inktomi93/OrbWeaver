// B5 — the "Link SSO identity" section's nav entry (the db-surgery-free mode-switch migration surface). The
// ONE `ConfigSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp;
// split out so neither imports the other (the admin-approvals-nav precedent).

import type { ConfigSubcategory } from "#state";

export const ADMIN_LINK_SSO_SUBCATEGORY: ConfigSubcategory = {
  id: "link-sso",
  label: "Link SSO identity",
  keywords: ["sso", "oidc", "external id", "subject", "migrate", "mode switch", "link account", "orphan"],
  settings: [
    {
      id: "linkable-accounts",
      label: "Linkable accounts",
      keywords: ["sso", "oidc", "external id", "subject", "link", "migrate"],
    },
  ],
};
