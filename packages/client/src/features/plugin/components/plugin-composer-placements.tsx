// Host-rendered homes for the closed plugin command placement vocabulary. Plugin metadata chooses only a
// target, label and curated glyph; the house owns ordering, attribution, overflow and invocation.

import type { PluginCommandPlacementTarget } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Blocks, Icon, PanelRightOpen } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { pluginCommandAuditAttributes, pluginMenuAuditAttributes } from "#lib";
import { revealContextPanel } from "#state";
import { usePluginCommands, useRunPluginCommand, useSharedPluginNames } from "../hooks/use-plugin-commands.ts";
import { useHasChatPluginPanels } from "../hooks/use-visible-anchored-surfaces.ts";
import { pluginCommandShownName } from "../lib/plugin-command-copy.ts";
import { PLUGIN_ICON_GLYPHS } from "../lib/plugin-icon-glyphs.ts";
import { CHAT_PLUGINS_OPEN_LABEL } from "../lib/plugin-panel-copy.ts";

interface PlacedCommand {
  readonly command: ReturnType<typeof usePluginCommands>[number];
  readonly label: string;
  readonly icon: keyof typeof PLUGIN_ICON_GLYPHS | undefined;
  /** What the composer calls the plugin: its display name, plus the slug only when another install shares it. */
  readonly shownName: string;
}

interface PlacedCommandGroup {
  readonly id: string;
  readonly label: string;
  readonly commands: readonly PlacedCommand[];
}

function placedItemLabel(item: PlacedCommand): string {
  return `${item.shownName} · ${item.command.group ?? "Commands"} · ${item.label}`;
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

function usePlacedCommands(target: PluginCommandPlacementTarget): readonly PlacedCommand[] {
  const commands = usePluginCommands(true);
  // A display name is not an identity, so the slug stays on screen exactly when two installs share a name.
  const shared = useSharedPluginNames();
  return commands
    .filter(
      (command) =>
        target === "composer-action" || (command.composerDraft !== true && !command.placements.some((placement) => placement.target === "composer-action")),
    )
    .flatMap((command) => {
      const placement = command.placements.find((candidate) => candidate.target === target);
      const shownName = pluginCommandShownName(command.pluginName, command.slug, shared);
      return placement === undefined ? [] : [{ command, label: placement.label, icon: placement.icon, shownName }];
    })
    .toSorted(comparePlaced);
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
      groups.push({ id, label: `${item.shownName} · ${commandGroup}`, commands: [item] });
    }
  }
  return groups;
}

export function PluginComposerActions({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  const placed = usePlacedCommands("composer-action");
  const hasPanels = useHasChatPluginPanels();
  const { isPending, run, undo, undoLabel } = useRunPluginCommand(chatId, true);
  if (placed.length === 0 && !hasPanels) {
    return null;
  }
  const groups = groupPlacedCommands(placed);
  return (
    <Row aria-label="Plugin composer actions" className="shrink-0" role="group" {...pluginMenuAuditAttributes(placed.map(({ command }) => command))}>
      <Menu>
        <MenuTrigger
          render={
            <Button aria-label="Plugin actions" loading={isPending} intent="ghost" shape="pill" size="glyph-lg" type="button">
              <Icon icon={Blocks} size="sm" />
            </Button>
          }
        />
        <MenuPopup clamp="belowChrome" side="top" className="max-inline-(--available-width)">
          {undo === null ? null : (
            <>
              <MenuItem onClick={undo}>{undoLabel}</MenuItem>
              <MenuSeparator />
            </>
          )}
          {groups.map((group) => (
            <MenuGroup key={group.id}>
              <MenuGroupLabel>{group.label}</MenuGroupLabel>
              {group.commands.map((item) => {
                const glyph = item.icon === undefined ? Blocks : PLUGIN_ICON_GLYPHS[item.icon];
                return (
                  <MenuItem
                    aria-label={placedItemLabel(item)}
                    disabled={isPending}
                    key={`${item.command.pluginId}:${item.command.name}`}
                    onClick={(): void => run(item.command)}
                    {...pluginCommandAuditAttributes(item.command.pluginId, item.command.name, "composer-action", "menu")}
                  >
                    <Icon icon={glyph} size="sm" />
                    {item.label}
                  </MenuItem>
                );
              })}
            </MenuGroup>
          ))}
          {hasPanels ? (
            <>
              {groups.length === 0 ? null : <MenuSeparator />}
              <MenuItem onClick={(): void => revealContextPanel("plugins")}>
                <Icon icon={PanelRightOpen} size="sm" />
                {CHAT_PLUGINS_OPEN_LABEL}
              </MenuItem>
            </>
          ) : null}
        </MenuPopup>
      </Menu>
    </Row>
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
                aria-label={placedItemLabel(item)}
                disabled={isPending}
                key={`${item.command.pluginId}:${item.command.name}`}
                onClick={(): void => run(item.command)}
                {...pluginCommandAuditAttributes(item.command.pluginId, item.command.name, "composer-media", "media")}
              >
                <Icon icon={glyph} size="sm" />
                {item.label}
              </MenuItem>
            );
          })}
        </MenuGroup>
      ))}
    </>
  );
}
