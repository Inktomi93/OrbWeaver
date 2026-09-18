// B5 — the "Link SSO identity" section's nav entry (the db-surgery-free mode-switch migration surface). The
// ONE `ConfigSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp;
// split out so neither imports the other (the admin-approvals-nav precedent).

import type { ConfigSubcategory } from "#state";

export const ADMIN_LINK_SSO_SUBCATEGORY: ConfigSubcategory = {
  id: "link-sso",
  label: "Link SSO identity",
  keywords: ["sso", "oidc", "external id", "subject", "migrate", "mode switch", "link account", "orphan"],
  teach: {
    summary: "Attach an SSO identity to an existing local account so a mode switch keeps all its data without database surgery.",
    affects: ["accounts migrating between local and SSO sign-in"],
  },
  settings: [
    {
      id: "linkable-accounts",
      label: "Linkable accounts",
      keywords: ["sso", "oidc", "external id", "subject", "link", "migrate"],
      teach: {
        summary: "Attach an SSO identity to an existing local account so a mode switch keeps its data \u2014 no database surgery.",
        affects: ["accounts migrating between local and SSO sign-in"],
      },
    },
  ],
};
