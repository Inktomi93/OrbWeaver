// The Plugins settings pane (client-architecture-lockdown.md §8) — co-located SettingsPaneDefinition
// wrapping the feature's own surface. `surface` mode because this pane is an install/grant/lifecycle CRUD
// screen, not a knob stack (the `connections`/`backup` shape).
//
// WHY THE SETTINGS MODAL AND NOT A SECTION INSIDE `automation` (the alternative, recorded so it is not
// re-litigated): the plugin program's own design set names no client home, and §7's one-shell law offers
// CONTENT / CONTEXT→sheet / a modal / the settings modal. A grant screen is the SECURITY surface of this
// feature, and the `automation` pane is `{placeholder: true}` today — anchoring a consent screen inside a
// stub would hide the one screen a person must be able to find. An app-tier pane beside Connections (the
// other "credentials and reach" screen) is where a reader already looks for this class of thing.
//
// ADMIN-GATED: every `plugin.*` management verb runs `can(caller,"admin",{kind:"global"})`, so for a
// non-admin this pane is not a smaller screen, it is a screen where every control throws. `when` consumes
// the state-owned `SettingsViewerView` projection, the same declarative gate the admin pane uses.

import { Blocks } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";
import { PluginsSettingsSurface } from "../surfaces/plugins-settings-surface.tsx";
import { PLUGINS_SUBCATEGORY_IDS } from "./plugins-nav.ts";

export const pluginsPane: SettingsPaneDefinition = {
  id: "plugins",
  group: "app",
  label: "Plugins",
  icon: Blocks,
  description: "Sandboxed scripts that can extend chats — each one runs only with the permissions you grant it.",
  when: (viewer) => viewer.isAdmin,
  subcategories: [
    {
      id: PLUGINS_SUBCATEGORY_IDS.installed,
      label: "Installed",
      keywords: ["plugin", "extension", "script", "sandbox", "enable", "disable", "remove", "uninstall", "update", "upgrade", "log"],
      settings: [
        {
          id: "plugin-permissions",
          label: "What a plugin is allowed to do",
          keywords: ["permission", "capability", "grant", "consent", "reach", "hosts", "network", "allow"],
        },
      ],
    },
    {
      id: PLUGINS_SUBCATEGORY_IDS.install,
      label: "Add a plugin",
      keywords: ["install", "bundle", "zip", "manifest", "add", "sideload", "grant", "permission"],
    },
  ],
  body: { kind: "surface", render: () => <PluginsSettingsSurface /> },
};
