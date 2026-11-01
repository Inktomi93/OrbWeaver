import type { OverflowMenuForm } from "#lib";
import { useActiveChatId } from "#state";
import { placedItemGlyph, placedItemLabel, usePlacedCommands } from "./use-placed-commands.ts";
import { useRunPluginCommand } from "./use-plugin-commands.ts";

/** The top bar's placed commands as "More" menu items, each with the attribution its icon button names. */
export function usePluginTopbarForms(): readonly OverflowMenuForm[] {
  const placed = usePlacedCommands("topbar");
  const { isPending, run } = useRunPluginCommand(useActiveChatId());
  return placed.map((item) => ({
    id: `${item.command.pluginId}:${item.command.name}`,
    label: placedItemLabel(item),
    icon: placedItemGlyph(item),
    disabled: isPending,
    onSelect: (): void => run(item.command),
  }));
}
