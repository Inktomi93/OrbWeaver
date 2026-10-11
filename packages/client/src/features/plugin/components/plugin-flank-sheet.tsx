// A touch device's plugin panels: a bottom sheet opened from the composer's Message tools, so the panels stay off
// the transcript and the phone topbar keeps one row. `PluginChatFlank` mounts exactly one host per pointer type, so
// a plugin frame never mounts twice.

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Drawer, DrawerClose, DrawerPopup, DrawerTitle, DrawerVirtualKeyboardProvider } from "@orb/ui/drawer";
import { Blocks, Icon, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { MenuItem, MenuSeparator } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { setFlankSheetOpen, useFlankSheetOpen } from "#lib";
import { useFlankInSheet, useVisibleAnchoredSurfaces } from "../hooks/use-visible-anchored-surfaces.ts";
import { PLUGIN_PANELS_SHEET_LABEL } from "../lib/plugin-copy.ts";
import { PluginAnchoredSurfaces } from "./plugin-anchored-surfaces.tsx";

/** The `chat-flank` anchor's body: the room's own column on a fine pointer, the sheet on a touch device. */
export function PluginChatFlank({ chatId }: { readonly chatId?: ChatId }): ReactElement | null {
  const chat = chatId === undefined ? {} : { chatId };
  return useFlankInSheet() ? <PluginFlankSheet {...chat} /> : <PluginAnchoredSurfaces anchor="chat-flank" {...chat} />;
}

/** The sheet itself, mounted only while the caller has a showing flank panel. A portal leaves nothing in the room's
 *  column, so the column still collapses on `:empty`. */
export function PluginFlankSheet({ chatId }: { readonly chatId?: ChatId }): ReactElement | null {
  const visible = useVisibleAnchoredSurfaces("chat-flank", chatId);
  const hasPanels = visible.length > 0;
  return hasPanels ? <FlankSheet {...(chatId === undefined ? {} : { chatId })} /> : null;
}

function FlankSheet({ chatId }: { readonly chatId?: ChatId }): ReactElement {
  const open = useFlankSheetOpen();
  // Leaving the room, or losing the last panel, must not leave the next room's sheet open.
  useEffect(() => (): void => setFlankSheetOpen(false), []);
  return (
    <Drawer onOpenChange={setFlankSheetOpen} open={open} side="bottom">
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
            <PluginAnchoredSurfaces anchor="chat-flank" inSheet={true} {...(chatId === undefined ? {} : { chatId })} />
          </Stack>
        </DrawerPopup>
      </DrawerVirtualKeyboardProvider>
    </Drawer>
  );
}

/** The sheet's door in Message tools: on a touch device, and only while there is a panel to show. It leads the
 *  menu, so it closes with the separator. */
export function PluginPanelsMenuItem({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  const visible = useVisibleAnchoredSurfaces("chat-flank", chatId);
  const touch = useFlankInSheet();
  if (!touch || visible.length === 0) {
    return null;
  }
  return (
    <>
      <MenuItem onClick={(): void => setFlankSheetOpen(true)}>
        <Icon icon={Blocks} size="sm" />
        {PLUGIN_PANELS_SHEET_LABEL}
      </MenuItem>
      <MenuSeparator />
    </>
  );
}
