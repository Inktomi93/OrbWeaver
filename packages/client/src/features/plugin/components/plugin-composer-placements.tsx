// Host-rendered homes for the closed plugin command placement vocabulary. Plugin metadata chooses only a
// target, label and curated glyph; the house owns ordering, attribution, overflow and invocation.

import type { PluginCommandPlacementTarget } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Blocks, Icon } from "@orb/ui/icons";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { usePluginCommands, useRunPluginCommand } from "../hooks/use-plugin-commands.ts";
import { pluginCommandActionLabel, pluginCommandAttributedActionLabel, pluginCommandAttribution } from "../lib/plugin-command-copy.ts";
import { PLUGIN_ICON_GLYPHS } from "../lib/plugin-icon-glyphs.ts";

interface PlacedCommand {
  readonly command: ReturnType<typeof usePluginCommands>[number];
  readonly label: string;
  readonly icon: keyof typeof PLUGIN_ICON_GLYPHS | undefined;
}

interface PlacedCommandGroup {
  readonly id: string;
  readonly label: string;
  readonly commands: readonly PlacedCommand[];
}

function usePlacedCommands(target: PluginCommandPlacementTarget): readonly PlacedCommand[] {
  return usePluginCommands().flatMap((command) => {
    const placement = command.placements.find((candidate) => candidate.target === target);
    return placement === undefined ? [] : [{ command, label: placement.label, icon: placement.icon }];
  });
}

function groupPlacedCommands(placed: readonly PlacedCommand[]): readonly PlacedCommandGroup[] {
  const groups: { id: string; label: string; commands: PlacedCommand[] }[] = [];
  for (const item of placed) {
    const commandGroup = item.command.group ?? "Commands";
    const id = `${item.command.pluginId}:${commandGroup}`;
    const previous = groups.at(-1);
    if (previous?.id === id) {
      previous.commands.push(item);
    } else {
      groups.push({ id, label: `${pluginCommandAttribution(item.command.pluginName, item.command.slug)} · ${commandGroup}`, commands: [item] });
    }
  }
  return groups;
}

export function PluginComposerActions({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  const placed = usePlacedCommands("composer-action");
  const { isPending, run } = useRunPluginCommand(chatId);
  if (placed.length === 0) {
    return null;
  }
  const groups = groupPlacedCommands(placed);
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button aria-label="Plugin actions" disabled={isPending} intent="ghost" shape="pill" size="icon" type="button">
            <Icon icon={Blocks} size="sm" />
          </Button>
        }
      />
      <MenuPopup>
        {groups.map((group) => (
          <MenuGroup key={group.id}>
            <MenuGroupLabel>{group.label}</MenuGroupLabel>
            {group.commands.map((item) => {
              const glyph = item.icon === undefined ? Blocks : PLUGIN_ICON_GLYPHS[item.icon];
              return (
                <MenuItem
                  aria-label={pluginCommandAttributedActionLabel(item.command.pluginName, item.command.slug, item.command.group ?? "Commands", item.label)}
                  disabled={isPending}
                  key={`${item.command.pluginId}:${item.command.name}`}
                  onClick={(): void => run(item.command)}
                >
                  <Icon icon={glyph} size="sm" />
                  {pluginCommandActionLabel(item.label)}
                </MenuItem>
              );
            })}
          </MenuGroup>
        ))}
      </MenuPopup>
    </Menu>
  );
}

export function PluginComposerMediaItems({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  const placed = usePlacedCommands("composer-media");
  const { isPending, run } = useRunPluginCommand(chatId);
  if (placed.length === 0) {
    return null;
  }
  const groups = groupPlacedCommands(placed);
  return (
    <>
      <MenuSeparator />
      {groups.map((group) => (
        <MenuGroup key={group.id}>
          <MenuGroupLabel>{group.label}</MenuGroupLabel>
          {group.commands.map((item) => {
            const glyph = item.icon === undefined ? Blocks : PLUGIN_ICON_GLYPHS[item.icon];
            return (
              <MenuItem
                aria-label={pluginCommandAttributedActionLabel(item.command.pluginName, item.command.slug, item.command.group ?? "Commands", item.label)}
                disabled={isPending}
                key={`${item.command.pluginId}:${item.command.name}`}
                onClick={(): void => run(item.command)}
              >
                <Icon icon={glyph} size="sm" />
                {pluginCommandActionLabel(item.label)}
              </MenuItem>
            );
          })}
        </MenuGroup>
      ))}
    </>
  );
}
