// The header's one control for the room's plugin panels. Where the panels live in a sheet (a touch device, or a
// room too narrow for the transcript to keep its floor beside them) it opens that sheet; where they sit inline it
// collapses and expands the column, so the transcript can take the width. The sheet holds the panels only while
// that is their host (`useFlankInSheet`), so a plugin frame never mounts twice.

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Drawer, DrawerClose, DrawerPopup, DrawerTitle, DrawerTrigger, DrawerVirtualKeyboardProvider } from "@orb/ui/drawer";
import { Blocks, Icon, PanelRightClose, PanelRightOpen, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { usePluginFlankCollapsed } from "../hooks/use-plugin-chat-visibility.ts";
import { useFlankInSheet, useVisibleAnchoredSurfaces } from "../hooks/use-visible-anchored-surfaces.ts";
import { flankToggleLabel, PLUGIN_PANELS_SHEET_LABEL } from "../lib/plugin-copy.ts";
import { PluginAnchoredSurfaces } from "./plugin-anchored-surfaces.tsx";

/** The header control. `null` while the caller has no showing flank panel, so a room without plugin panels grows
 *  no header control. */
export function PluginFlankSheet({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  const visible = useVisibleAnchoredSurfaces("chat-flank", chatId);
  const inSheet = useFlankInSheet();
  const { collapsed, toggle } = usePluginFlankCollapsed();
  if (visible.length === 0) {
    return null;
  }
  if (!inSheet) {
    return (
      <Button aria-expanded={!collapsed} aria-label={flankToggleLabel(collapsed)} intent="ghost" onClick={toggle} size="icon" type="button">
        <Icon icon={collapsed ? PanelRightOpen : PanelRightClose} size="sm" />
      </Button>
    );
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
