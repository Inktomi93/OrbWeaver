// Host-rendered homes for the closed plugin command placement vocabulary. Plugin metadata chooses only a
// target, label and curated glyph; the house owns ordering, attribution, overflow and invocation.

import type { ChatId } from "@orb/kit/ids";
import { GlyphButton } from "@orb/ui/glyph-button";
import { Blocks, Icon, PanelRightOpen } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { pluginCommandAuditAttributes, pluginMenuAuditAttributes } from "#lib";
import { revealContextPanel } from "#state";
import type { PlacedCommand } from "../hooks/use-placed-commands.ts";
import { placedItemGlyph, placedItemLabel, usePlacedCommands } from "../hooks/use-placed-commands.ts";
import { useRunPluginCommand } from "../hooks/use-plugin-commands.ts";
import { useHasChatPluginPanels } from "../hooks/use-visible-anchored-surfaces.ts";
import { PLUGIN_ACTIONS_NAME } from "../lib/plugin-command-copy.ts";
import { CHAT_PLUGINS_OPEN_LABEL } from "../lib/plugin-panel-copy.ts";

interface PlacedCommandGroup {
  readonly id: string;
  readonly label: string;
  readonly commands: readonly PlacedCommand[];
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
            <GlyphButton aria-label={PLUGIN_ACTIONS_NAME} loading={isPending} variant="ghost" shape="pill" glyph="lg" type="button">
              <Icon icon={Blocks} size="sm" />
            </GlyphButton>
          }
        />
        <MenuPopup clamp="belowChrome" side="top" collisionAvoidance={{ side: "shift", align: "shift" }} cap="available">
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
                const glyph = placedItemGlyph(item);
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
            const glyph = placedItemGlyph(item);
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
