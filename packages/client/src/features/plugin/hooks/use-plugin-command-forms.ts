// The plugin commands as one overflow submenu: the same commands, labels and runner the Plugins menu offers.

import { WandSparkles } from "@orb/ui/icons";
import type { OverflowMenuForm } from "#lib";
import { useActiveChatId } from "#state";
import { pluginCommandAttributedActionLabel, pluginCommandShownName } from "../lib/plugin-command-copy.ts";
import { useLauncherCommands, useRunPluginCommand, useSharedPluginNames } from "./use-plugin-commands.ts";

const PLUGIN_COMMANDS_LABEL = "Plugin commands";

export function usePluginCommandForms(): readonly OverflowMenuForm[] {
  const commands = useLauncherCommands();
  const shared = useSharedPluginNames();
  const { isPending, run } = useRunPluginCommand(useActiveChatId());
  if (commands.length === 0) {
    return [];
  }
  return [
    {
      id: "plugin-commands",
      label: PLUGIN_COMMANDS_LABEL,
      icon: WandSparkles,
      items: commands.map((command) => ({
        id: `${command.pluginId}:${command.name}`,
        label: pluginCommandAttributedActionLabel(pluginCommandShownName(command.pluginName, command.slug, shared), command.group ?? "Commands", command.name),
        icon: WandSparkles,
        disabled: isPending,
        onSelect: (): void => run(command),
      })),
    },
  ];
}
