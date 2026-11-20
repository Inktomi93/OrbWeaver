// The `topbar` placement mount: one host-drawn control per placed command, never an aggregate menu. The plugin
// chooses only the label and curated glyph; the house draws attribution, order, pending state and invocation.

import { Button } from "@orb/ui/button";
import { Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { pluginCommandAuditAttributes } from "#lib";
import { useActiveChatId } from "#state";
import { placedItemGlyph, usePlacedCommands } from "../hooks/use-placed-commands.ts";
import { useRunPluginCommand } from "../hooks/use-plugin-commands.ts";
import { placedItemLabel } from "../lib/plugin-command-copy.ts";

export function PluginTopbarCommands({ presentation }: { readonly presentation: "bar" | "sheet" }): ReactElement {
  const placed = usePlacedCommands("topbar");
  // A run outside a room carries `null`, and `chat.current()` throws in the guest.
  const { isPending, run } = useRunPluginCommand(useActiveChatId());
  if (presentation === "sheet") {
    return (
      <>
        {placed.map((item) => (
          <Button
            disabled={isPending}
            focusableWhenDisabled={true}
            key={`${item.command.pluginId}:${item.command.name}`}
            onClick={(): void => run(item.command)}
            size="sm"
            variant="ghost"
            {...pluginCommandAuditAttributes(item.command.pluginId, item.command.name, "topbar", "topbar")}
          >
            <Icon icon={placedItemGlyph(item)} size="sm" />
            <Text ink="inherit" voice="label">
              {placedItemLabel(item)}
            </Text>
          </Button>
        ))}
      </>
    );
  }
  return (
    <Row align="center" gap="field">
      {placed.map((item) => (
        <Tooltip key={`${item.command.pluginId}:${item.command.name}`}>
          <TooltipTrigger
            render={
              <Button
                aria-label={placedItemLabel(item)}
                className="shell-topbar-icon-btn"
                disabled={isPending}
                focusableWhenDisabled={true}
                onClick={(): void => run(item.command)}
                square={true}
                variant="ghost"
                {...pluginCommandAuditAttributes(item.command.pluginId, item.command.name, "topbar", "topbar")}
              >
                <Icon icon={placedItemGlyph(item)} size="sm" />
              </Button>
            }
          />
          <TooltipPopup side="bottom">{placedItemLabel(item)}</TooltipPopup>
        </Tooltip>
      ))}
    </Row>
  );
}
