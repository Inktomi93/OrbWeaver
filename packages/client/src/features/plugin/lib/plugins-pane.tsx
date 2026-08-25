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
// UNGATED — every user has this pane, and that is the ruling, not an oversight (D147). Plugins are
// USER-SCOPED: anyone installs for themselves and the plugin runs under them, so `plugin.list` returns the
// CALLER's own rows and every control on this screen acts on a row they own. There is deliberately no `when`
// here. Do NOT re-add `when: (viewer) => viewer.isAdmin` — the pane used to carry it because every management
// verb was admin-gated on the server, and both halves moved together when that gate came off. A future
// SERVER-WIDE install (admin-only) would be a separate section or pane, never a gate on this one: hiding a
// person's own installed plugins from them is the failure this line exists to prevent.

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
