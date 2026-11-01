// The commands a host mount shows at one closed placement target, in host order with host attribution.

import type { PluginCommandPlacementTarget, PluginCommandView } from "@orb/contracts/plugin";
import type { LucideIcon } from "@orb/ui/icons";
import { Blocks } from "@orb/ui/icons";
import { pluginCommandShownName } from "../lib/plugin-command-copy.ts";
import { PLUGIN_ICON_GLYPHS } from "../lib/plugin-icon-glyphs.ts";
import { usePluginCommands, useSharedPluginNames } from "./use-plugin-commands.ts";

export interface PlacedCommand {
  readonly command: PluginCommandView;
  readonly label: string;
  readonly icon: keyof typeof PLUGIN_ICON_GLYPHS | undefined;
  /** What the host calls the plugin: its display name, plus the slug only when another install shares it. */
  readonly shownName: string;
}

export function placedItemLabel(item: PlacedCommand): string {
  return `${item.shownName} · ${item.command.group ?? "Commands"} · ${item.label}`;
}

export function placedItemGlyph(item: PlacedCommand): LucideIcon {
  return item.icon === undefined ? Blocks : PLUGIN_ICON_GLYPHS[item.icon];
}

// Host order: the shown attribution (name, then slug), then group, then the label shown at THIS target. The
// plugin id keeps each install's entries contiguous; the catalog order keys on command names, not these labels.
function comparePlaced(a: PlacedCommand, b: PlacedCommand): number {
  return (
    a.command.pluginName.localeCompare(b.command.pluginName) ||
    a.command.slug.localeCompare(b.command.slug) ||
    a.command.pluginId.localeCompare(b.command.pluginId) ||
    (a.command.group ?? "").localeCompare(b.command.group ?? "") ||
    a.label.localeCompare(b.label) ||
    a.command.name.localeCompare(b.command.name)
  );
}

export function usePlacedCommands(target: PluginCommandPlacementTarget): readonly PlacedCommand[] {
  const commands = usePluginCommands(true);
  // A display name is not an identity, so the slug stays on screen exactly when two installs share a name.
  const shared = useSharedPluginNames();
  return commands
    .filter(
      (command) =>
        target !== "composer-media" || (command.composerDraft !== true && !command.placements.some((placement) => placement.target === "composer-action")),
    )
    .flatMap((command) => {
      const placement = command.placements.find((candidate) => candidate.target === target);
      const shownName = pluginCommandShownName(command.pluginName, command.slug, shared);
      return placement === undefined ? [] : [{ command, label: placement.label, icon: placement.icon, shownName }];
    })
    .toSorted(comparePlaced);
}
