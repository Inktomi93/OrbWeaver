// Private DEV metadata, not data-slot or owner-CSS API. This module holds no observer or plugin state.
import type { PluginCommandPlacementTarget, PluginSurfaceAnchor } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { IS_DEV } from "./dev-flag.ts";

export const PLUGIN_UI_AUDIT_ATTRIBUTES = {
  surface: "data-orb-plugin-surface",
  anchor: "data-orb-plugin-anchor",
  command: "data-orb-plugin-command",
  target: "data-orb-plugin-target",
  location: "data-orb-plugin-location",
  menu: "data-orb-plugin-menu",
} as const;

export const PLUGIN_UI_COMMAND_LOCATIONS = ["menu", "media"] as const;
export type PluginUiCommandLocation = (typeof PLUGIN_UI_COMMAND_LOCATIONS)[number];

type AuditAttributes = Partial<Record<(typeof PLUGIN_UI_AUDIT_ATTRIBUTES)[keyof typeof PLUGIN_UI_AUDIT_ATTRIBUTES], string>>;

/** A local registration id is unique only within its plugin install. */
export function pluginUiAuditKey(pluginId: PluginId, localId: string): string {
  return `${pluginId}:${localId}`;
}

/** Identify an existing host without adding a DOM wrapper or changing its content. */
export function pluginSurfaceAuditAttributes(pluginId: PluginId, surfaceId: string, anchor: PluginSurfaceAnchor): AuditAttributes {
  return IS_DEV ? { [PLUGIN_UI_AUDIT_ATTRIBUTES.surface]: pluginUiAuditKey(pluginId, surfaceId), [PLUGIN_UI_AUDIT_ATTRIBUTES.anchor]: anchor } : {};
}

/** Identify a mounted composer menu control. */
export function pluginCommandAuditAttributes(
  pluginId: PluginId,
  name: string,
  target: PluginCommandPlacementTarget,
  location: PluginUiCommandLocation,
): AuditAttributes {
  return IS_DEV
    ? {
        [PLUGIN_UI_AUDIT_ATTRIBUTES.command]: pluginUiAuditKey(pluginId, name),
        [PLUGIN_UI_AUDIT_ATTRIBUTES.target]: target,
        [PLUGIN_UI_AUDIT_ATTRIBUTES.location]: location,
      }
    : {};
}

/** The closed menu has no mounted items; publish its already-resolved command roster. */
export function pluginMenuAuditAttributes(commands: readonly { readonly pluginId: PluginId; readonly name: string }[]): AuditAttributes {
  return IS_DEV ? { [PLUGIN_UI_AUDIT_ATTRIBUTES.menu]: JSON.stringify(commands.map(({ pluginId, name }) => pluginUiAuditKey(pluginId, name))) } : {};
}
