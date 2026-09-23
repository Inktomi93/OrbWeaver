// plugins-nav — the Plugins group's nav entries, the ONE home for both ends of the anchor wiring (the
// `workloads-jobs-nav.ts` precedent): each contribution def spells its `nav` from these, and each section body
// stamps `configAnchorId("plugins", …)` from the same constant, so scroll-spy and search jump can never point
// at an anchor nobody rendered. The group itself is a `sections` skimmer —
// these two plus the admin-gated distribute section ARE its rows.

import type { ConfigSubcategory } from "#state";

/** The grant row's id, exported because a DEEP LINK targets it: the Extensions pane's "waiting on you" empty
 *  lands the person on this exact control rather than the section's top (#924). Same one-home reason as the
 *  subcategory ids above — a link and its target must never spell the anchor twice. */
export const PLUGIN_PERMISSIONS_SETTING_ID = "plugin-permissions";

export const PLUGINS_INSTALLED_SUBCATEGORY: ConfigSubcategory = {
  id: "installed",
  label: "Installed",
  keywords: ["plugin", "extension", "script", "sandbox", "enable", "disable", "remove", "uninstall", "update", "upgrade", "log"],
  teach: {
    summary: "Your installed plugins: enable, disable, remove or update each one, and manage the capabilities you grant it.",
    affects: ["which plugins run and what they may do, on this account"],
  },
  settings: [
    {
      id: PLUGIN_PERMISSIONS_SETTING_ID,
      label: "What a plugin is allowed to do",
      keywords: ["permission", "capability", "grant", "consent", "reach", "hosts", "network", "allow"],
      teach: {
        summary: "Every capability a plugin asked for, granted or denied per plugin \u2014 nothing runs with a reach you did not consent to.",
        affects: ["what that plugin may see and do, for your account only"],
      },
    },
  ],
};

export const PLUGINS_INSTALL_SUBCATEGORY: ConfigSubcategory = {
  id: "install",
  label: "Add a plugin",
  keywords: ["install", "bundle", "zip", "manifest", "add", "sideload", "grant", "permission"],
  teach: {
    summary: "Sideload a plugin bundle (zip or manifest) and review its permission requests before granting access.",
    affects: ["which plugins are available to install on this account"],
  },
};
