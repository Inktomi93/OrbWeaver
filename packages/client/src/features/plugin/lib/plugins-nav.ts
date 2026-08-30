// plugins-nav — the Plugins group's nav entries, the ONE home for both ends of the anchor wiring (the
// `workloads-jobs-nav.ts` precedent): each contribution def spells its `nav` from these, and each section body
// stamps `configAnchorId("plugins", …)` from the same constant, so scroll-spy and search jump can never point
// at an anchor nobody rendered. The group itself is a `sections` skimmer (config-revamp-design.md §6.8) —
// these two plus the admin-gated distribute section ARE its rows.

import type { ConfigSubcategory } from "#state";

export const PLUGINS_INSTALLED_SUBCATEGORY: ConfigSubcategory = {
  id: "installed",
  label: "Installed",
  keywords: ["plugin", "extension", "script", "sandbox", "enable", "disable", "remove", "uninstall", "update", "upgrade", "log"],
  settings: [
    {
      id: "plugin-permissions",
      label: "What a plugin is allowed to do",
      keywords: ["permission", "capability", "grant", "consent", "reach", "hosts", "network", "allow"],
    },
  ],
};

export const PLUGINS_INSTALL_SUBCATEGORY: ConfigSubcategory = {
  id: "install",
  label: "Add a plugin",
  keywords: ["install", "bundle", "zip", "manifest", "add", "sideload", "grant", "permission"],
};
