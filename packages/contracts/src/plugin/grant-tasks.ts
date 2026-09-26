// The routable tasks a plugin install's own `plugin-grant` binding routes: each spend capability whose host
// door folds that binding before the installer's own, and the task it folds. A capability absent here spends
// through the installer's own bindings only, so the Plugins pane offers a grant binding for these tasks alone.

import type { RoutableTask } from "../inference/tasks.ts";
import { ROUTABLE_TASKS } from "../inference/tasks.ts";
import type { PluginCapability } from "./manifest.ts";

/** `llm.quiet` folds `summarize`; its structured arm rides that same binding. */
const PLUGIN_GRANT_TASKS = { "llm.quiet": ["summarize"] } as const satisfies Partial<Record<PluginCapability, readonly RoutableTask[]>>;

/** A task some capability routes through a plugin-grant binding. */
export type PluginGrantTask = (typeof PLUGIN_GRANT_TASKS)[keyof typeof PLUGIN_GRANT_TASKS][number];

function isGrantCapability(capability: PluginCapability): capability is keyof typeof PLUGIN_GRANT_TASKS {
  return Object.hasOwn(PLUGIN_GRANT_TASKS, capability);
}

/** The tasks a plugin declaring `declared` can route through its own grant binding, in routable-task order. */
export function pluginGrantTasks(declared: readonly PluginCapability[]): readonly PluginGrantTask[] {
  const tasks = new Set<RoutableTask>(declared.filter(isGrantCapability).flatMap((capability) => PLUGIN_GRANT_TASKS[capability]));
  return ROUTABLE_TASKS.filter((task): task is PluginGrantTask => tasks.has(task));
}
