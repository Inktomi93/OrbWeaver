// Check the installer predicate before interpreting a plugin's private manifest capabilities.
import { pluginGrantTasks } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { plugins } from "@orb/db";
import { fetchOwned } from "@orb/db/query";
import type { PluginGrantTasksOf } from "../contract/grant-tasks.ts";

export function createPluginGrantTasksOf(db: Db): PluginGrantTasksOf {
  return async (pluginId, userId): ReturnType<PluginGrantTasksOf> => {
    const row = await fetchOwned(db, plugins, pluginId, userId);
    return row === undefined ? null : pluginGrantTasks(row.manifest.capabilities);
  };
}
