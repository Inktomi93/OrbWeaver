import type { PluginGrantTask } from "@orb/contracts/plugin";
import type { PluginId, UserId } from "@orb/kit/ids";

export type PluginGrantTasksOf = (pluginId: PluginId, userId: UserId) => Promise<readonly PluginGrantTask[] | null>;
