import type { PluginId } from "@orb/kit/ids";
import { configSettingControlId } from "./config-group-registry.ts";
import { openConfigTo } from "./config-nav-store.ts";

export const INSTALLED_PLUGINS_SUBCATEGORY_ID = "installed";

/** The config host scrolls and focuses this plugin's own installed card. */
export function installedPluginControlId(pluginId: PluginId): string {
  return configSettingControlId("plugins", pluginId);
}

/** Open the plugin named by the notification, not whichever installed row sorts first. */
export function openInstalledPlugin(pluginId: PluginId): void {
  openConfigTo("plugins", INSTALLED_PLUGINS_SUBCATEGORY_ID, pluginId);
}
