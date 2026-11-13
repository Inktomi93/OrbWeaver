import { CHAT_PLUGINS_TAB_LABEL, MESSAGE_TOOLS_LABEL } from "#lib";

export const CHAT_PLUGINS_EMPTY_TITLE = "No chat panels here";
const CHAT_PLUGINS_EMPTY_LEAD = "Enabled plugins with chat panels appear here.";
export const CHAT_PLUGINS_EMPTY_DESCRIPTION = `${CHAT_PLUGINS_EMPTY_LEAD} Choose a panel's sidecar action to keep it beside the conversation.`;
/** On touch the sidecar is a sheet, so the copy names its door instead of the conversation. */
export const CHAT_PLUGINS_EMPTY_DESCRIPTION_TOUCH = `${CHAT_PLUGINS_EMPTY_LEAD} Move a panel to the sidecar to keep it one tap away in ${MESSAGE_TOOLS_LABEL}.`;
export const CHAT_PLUGINS_MANAGE_LABEL = "Manage plugins";
/** The Plugin actions menu's door to Context's Plugins tab, named by its destination. */
export const CHAT_PLUGINS_OPEN_LABEL = `Open ${CHAT_PLUGINS_TAB_LABEL} tab`;

/** The plugin dialog's title before any guest content names it. */
export const PLUGIN_DIALOG_TITLE = "Plugin";

/** The plugin dialog's body once its plugin is gone, and the line shown while it loads. */
export const PLUGIN_DIALOG_GONE_TITLE = "That dialog is no longer available";
export const PLUGIN_DIALOG_GONE_BODY = "Its plugin was disabled or removed while it was open.";
export const PLUGIN_DIALOG_LOADING_NAME = "Loading plugin dialog…";

/** The page shell's kicker: it names the class, so a faked app screen inside a plugin is contradicted. */
export const PLUGIN_SURFACE_KICKER = "Plugin";

/** A surface's name, its plugin's then its own; a surface titled exactly like its plugin says the name once. */
export function pluginSurfaceName(pluginName: string, title: string): string {
  return pluginName === title ? pluginName : `${pluginName}: ${title}`;
}

/** The placement action stays distinct when one plugin registers several panels. */
export function movePluginPanelLabel(pluginName: string, title: string, sidecar: boolean): string {
  return `Move to ${sidecar ? "sidecar" : "Context"}: ${pluginSurfaceName(pluginName, title)}`;
}

/** What failed to load, said by a plugin dialog's read. */
export const PLUGIN_DIALOG_READ_LABEL = "this plugin dialog";
