// The header's control for a touch device's plugin panels: one icon that opens a bottom sheet holding them, so
// they stay off the transcript. The sheet holds the panels only while that is their host (`useFlankInSheet`), so a
// plugin frame never mounts twice; a fine pointer's panels live in the room's own column.

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Drawer, DrawerClose, DrawerPopup, DrawerTitle, DrawerTrigger, DrawerVirtualKeyboardProvider } from "@orb/ui/drawer";
import { Blocks, Icon, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useFlankInSheet, useVisibleAnchoredSurfaces } from "../hooks/use-visible-anchored-surfaces.ts";
import { PLUGIN_PANELS_SHEET_LABEL } from "../lib/plugin-copy.ts";
import { PluginAnchoredSurfaces } from "./plugin-anchored-surfaces.tsx";

/** The header control. `null` off a touch device, and while the caller has no showing flank panel, so a room without
 *  plugin panels grows no header control. */
export function PluginFlankSheet({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  const visible = useVisibleAnchoredSurfaces("chat-flank", chatId);
  const inSheet = useFlankInSheet();
  if (visible.length === 0 || !inSheet) {
    return null;
  }
  return (
    <Drawer side="bottom">
      <Tooltip>
        <TooltipTrigger
          render={
            <DrawerTrigger
              render={
                <Button aria-label={PLUGIN_PANELS_SHEET_LABEL} intent="ghost" size="icon-sm" type="button">
                  <Icon icon={Blocks} size="sm" />
                </Button>
              }
            />
          }
        />
        <TooltipPopup side="bottom">{PLUGIN_PANELS_SHEET_LABEL}</TooltipPopup>
      </Tooltip>
      {/* A panel may hold a text field, and on iOS the keyboard covers a sheet's fields unless the provider
          scrolls the focused one clear (the modal host's phone sheet takes the same wrap). */}
      <DrawerVirtualKeyboardProvider>
        <DrawerPopup side="bottom">
          <Stack gap="block">
            <Row align="center" justify="between">
              <DrawerTitle>{PLUGIN_PANELS_SHEET_LABEL}</DrawerTitle>
              <DrawerClose
                render={
                  <Button aria-label="Close" intent="ghost" size="icon" type="button">
                    <Icon icon={X} size="sm" />
                  </Button>
                }
              />
            </Row>
            <PluginAnchoredSurfaces anchor="chat-flank" chatId={chatId} inSheet={true} />
          </Stack>
        </DrawerPopup>
      </DrawerVirtualKeyboardProvider>
    </Drawer>
  );
}
