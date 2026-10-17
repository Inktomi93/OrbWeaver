// Check the installer predicate before interpreting a plugin's private manifest capabilities.
import { pluginGrantTasks, pluginManifestSchema } from "@orb/contracts/plugin";
import { plugins } from "@orb/db";
import { fetchOwned } from "@orb/db/query";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { PluginGrantTasksOf } from "../contract/grant-tasks.ts";

export function createPluginGrantTasksOf(handle: DatabaseHandle): PluginGrantTasksOf {
  const db = databaseForOwner(handle);
  return async (pluginId, userId): ReturnType<PluginGrantTasksOf> => {
    const row = await fetchOwned(db, plugins, pluginId, userId);
    return row === undefined ? null : pluginGrantTasks(pluginManifestSchema.parse(row.manifest).capabilities);
  };
}
