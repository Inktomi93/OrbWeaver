// The phone's home for the room's plugin panels: one header icon that opens a bottom sheet holding them, so they
// stop sitting under the last message. The sheet's panels are the room's only copy on a touch device — the inline
// flank is not mounted there (`chat-anchors.tsx`), so a plugin frame never mounts twice.

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Drawer, DrawerClose, DrawerPopup, DrawerTitle, DrawerTrigger, DrawerVirtualKeyboardProvider } from "@orb/ui/drawer";
import { Blocks, Icon, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useVisibleAnchoredSurfaces } from "../hooks/use-visible-anchored-surfaces.ts";
import { PLUGIN_PANELS_SHEET_LABEL } from "../lib/plugin-copy.ts";
import { PluginAnchoredSurfaces } from "./plugin-anchored-surfaces.tsx";

/** The header icon and its sheet. `null` while the caller has no showing flank panel, so a room without plugin
 *  panels grows no header control. */
export function PluginFlankSheet({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  const visible = useVisibleAnchoredSurfaces("chat-flank", chatId);
  if (visible.length === 0) {
    return null;
  }
  return (
    <Drawer side="bottom">
      <DrawerTrigger
        render={
          <Button aria-label={PLUGIN_PANELS_SHEET_LABEL} intent="ghost" size="icon" type="button">
            <Icon icon={Blocks} size="sm" />
          </Button>
        }
      />
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
