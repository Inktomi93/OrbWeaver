// plugin-model-copy — the copy for a plugin's own model choices (its grant routing). Re-exported by
// plugin-copy.ts, which importers keep using.

import type { PluginGrantTask } from "@orb/contracts/plugin";

/** The disclosure that holds a plugin's own model choices. */
export const PLUGIN_MODEL_HEADING = "Model it uses";
/** Each task a plugin can route through its own grant, named by what the plugin does with it. */
export const PLUGIN_GRANT_TASK_LABELS = { summarize: "Text requests" } as const satisfies Record<PluginGrantTask, string>;
/** The picker's unset option, and the readout when this plugin has no model of its own for the task. */
export const PLUGIN_MODEL_UNSET = "Not set";
/** A grant whose connection was deleted: the binding survives with no row behind it. */
export const PLUGIN_MODEL_DELETED = "The model it used was deleted. Pick another.";
/** No connection of the installer's can serve the task. */
export const PLUGIN_MODEL_NONE_COMPATIBLE = "None of your models can do this. Add one under Connections.";
/** The server refused the binding because this plugin is not the caller's. */
export const PLUGIN_MODEL_NOT_YOURS = "This plugin isn't yours, so you can't pick its model.";
/** A save the server refused for a reason this pane has no sentence for. */
export const PLUGIN_MODEL_SAVE_FAILED = "Couldn't save that choice.";

/** The readout for a grant that names a connection. */
export function pluginModelReadout(label: string, runnable: boolean): string {
  return runnable ? `Runs on ${label}.` : `Set to ${label}, but it can't run right now.`;
}

/** The refusal for a connection that may not run unattended, which a plugin's text requests always are. */
export function pluginModelBackgroundRefused(label: string): string {
  return `${label} isn't allowed to run unattended. Turn on background work for it under Connections.`;
}
