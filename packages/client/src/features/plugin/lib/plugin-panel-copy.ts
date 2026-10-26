export const CHAT_PLUGINS_EMPTY_TITLE = "No chat panels here";
export const CHAT_PLUGINS_EMPTY_DESCRIPTION =
  "Enabled plugins with chat panels appear here. Choose a panel's sidecar action to keep it beside the conversation.";
export const CHAT_PLUGINS_MANAGE_LABEL = "Manage plugins";
export const CHAT_PLUGINS_OPEN_LABEL = "Plugin panels";

/** The placement action stays distinct when one plugin registers several panels. */
export function movePluginPanelLabel(pluginName: string, title: string, sidecar: boolean): string {
  const name = pluginName === title ? pluginName : `${pluginName} — ${title}`;
  return `Move to ${sidecar ? "sidecar" : "Context"}: ${name}`;
}
