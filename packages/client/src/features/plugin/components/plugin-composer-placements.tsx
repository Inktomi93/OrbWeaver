// Host-rendered homes for the closed plugin command placement vocabulary. Plugin metadata chooses only a
// target, label and curated glyph; the house owns ordering, attribution, overflow and invocation.

import type { PluginCommandPlacementTarget } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Blocks, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { usePluginCommands, useRunPluginCommand, useSharedPluginNames } from "../hooks/use-plugin-commands.ts";
import { pluginCommandActionLabel, pluginCommandShownName } from "../lib/plugin-command-copy.ts";
import { PLUGIN_ICON_GLYPHS } from "../lib/plugin-icon-glyphs.ts";

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

const DIRECT_ACTION_LIMIT = 3;

function PlacedActionButton({
  item,
  isPending,
  onRun,
}: {
  readonly item: PlacedCommand;
  readonly isPending: boolean;
  readonly onRun?: () => void;
}): ReactElement {
  const glyph = item.icon === undefined ? Blocks : PLUGIN_ICON_GLYPHS[item.icon];
  return (
    <Button aria-label={placedActionLabel(item)} className="shrink-0" intent="ghost" loading={isPending} onClick={onRun} shape="pill" size="sm" type="button">
      <Icon icon={glyph} size="sm" />
      {item.shownName} · {pluginCommandActionLabel(item.label)}
    </Button>
  );
}

function placedActionLabel(item: PlacedCommand): string {
  return `${item.shownName} · ${item.command.group ?? "Commands"} · ${pluginCommandActionLabel(item.label)}`;
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
    .filter((command) => target === "composer-action" || command.composerDraft !== true)
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
  const { isPending, run, undo, undoLabel } = useRunPluginCommand(chatId, true);
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [directCount, setDirectCount] = useState(0);
  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (row === null || measure === null) {
      return;
    }
    const measureActions = (): void => {
      const widths = Array.from(measure.children, (child) => child.getBoundingClientRect().width);
      const doorWidth = widths.pop() ?? 0;
      const gap = Number.parseFloat(getComputedStyle(measure).columnGap);
      let count = widths.length;
      // Reserve the overflow door before admitting a prefix, so adding it cannot displace Send or wrap the rail.
      while (count > 0) {
        const hasOverflow = count < placed.length;
        const required = widths.slice(0, count).reduce((total, width) => total + width, 0) + gap * (count - 1) + (hasOverflow ? doorWidth + gap : 0);
        if (required <= row.getBoundingClientRect().width) {
          break;
        }
        count -= 1;
      }
      setDirectCount(count);
    };
    measureActions();
    const observer = new ResizeObserver(measureActions);
    observer.observe(row);
    observer.observe(measure);
    return (): void => observer.disconnect();
  }, [placed]);
  if (placed.length === 0) {
    return null;
  }
  const direct = placed.slice(0, directCount);
  const groups = groupPlacedCommands(placed.slice(directCount));
  return (
    <Row aria-label="Plugin composer actions" className="relative min-w-control-md flex-1" gap="field" ref={rowRef} role="group">
      {/* The inert measurement copy keeps full attribution in the fit calculation without adding tab stops or scroll overflow. */}
      <Row aria-hidden={true} className="pointer-events-none invisible absolute inset-0 overflow-hidden" inert={true}>
        <Row className="w-max shrink-0" gap="field" ref={measureRef}>
          {placed.slice(0, DIRECT_ACTION_LIMIT).map((item) => (
            <PlacedActionButton isPending={false} item={item} key={`${item.command.pluginId}:${item.command.name}`} />
          ))}
          <Button aria-label="Plugin actions" intent="ghost" shape="pill" size="icon" type="button">
            <Icon icon={Blocks} size="sm" />
          </Button>
        </Row>
      </Row>
      {direct.map((item) => (
        <PlacedActionButton isPending={isPending} item={item} key={`${item.command.pluginId}:${item.command.name}`} onRun={(): void => run(item.command)} />
      ))}
      {undo === null ? null : (
        <Button intent="ghost" onClick={undo} shape="pill" size="sm">
          {undoLabel}
        </Button>
      )}
      {groups.length === 0 ? null : (
        <Menu>
          <MenuTrigger
            render={
              <Button aria-label="Plugin actions" loading={isPending} intent="ghost" shape="pill" size="icon" type="button">
                <Icon icon={Blocks} size="sm" />
              </Button>
            }
          />
          <MenuPopup className="max-w-(--available-width)">
            {groups.map((group) => (
              <MenuGroup key={group.id}>
                <MenuGroupLabel>{group.label}</MenuGroupLabel>
                {group.commands.map((item) => {
                  const glyph = item.icon === undefined ? Blocks : PLUGIN_ICON_GLYPHS[item.icon];
                  return (
                    <MenuItem
                      aria-label={placedActionLabel(item)}
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
      )}
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
                aria-label={placedActionLabel(item)}
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
