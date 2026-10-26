// Explicit sidecar selections use a column on fine pointers and a sheet on touch devices.
// One published host answer controls both the room geometry and the sheet menu without duplicate state reads.

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Drawer, DrawerClose, DrawerPopup, DrawerTitle, DrawerVirtualKeyboardProvider } from "@orb/ui/drawer";
import { Blocks, Icon, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { MenuItem, MenuSeparator } from "@orb/ui/menu";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { publishFlankHost, setFlankSheetOpen, useFlankHost, useFlankSheetOpen } from "#lib";
import { usePluginFlankCollapsed } from "../hooks/use-plugin-chat-visibility.ts";
import { useFlankInSheet, useVisibleAnchoredSurfaces } from "../hooks/use-visible-anchored-surfaces.ts";
import { PLUGIN_PANELS_SHEET_LABEL } from "../lib/plugin-copy.ts";
import { PluginAnchoredSurfaceList } from "./plugin-anchored-surfaces.tsx";

/** The `chat-flank` anchor's body: the room's own column on a fine pointer, the sheet on a touch device. */
export function PluginChatFlank({ chatId }: { readonly chatId?: ChatId }): ReactElement | null {
  const chat = chatId === undefined ? {} : { chatId };
  const visible = useVisibleAnchoredSurfaces("chat-flank", chatId, true);
  const touch = useFlankInSheet();
  const { ready, collapsed, toggle } = usePluginFlankCollapsed();
  const latestToggle = useRef(toggle);
  useEffect(() => {
    latestToggle.current = toggle;
  });
  const [toggleLatest] = useState(() => (): void => latestToggle.current());
  const hasPanels = ready && visible.length > 0;
  useEffect(() => {
    publishFlankHost({ panels: hasPanels, collapsed, toggle: toggleLatest });
    return (): void => publishFlankHost(null);
  }, [hasPanels, collapsed, toggleLatest]);
  if (!hasPanels) {
    return null;
  }
  const panels = <PluginAnchoredSurfaceList anchor="chat-flank" sidecar={true} inSheet={touch} surfaces={visible} {...chat} />;
  return touch ? <FlankSheet>{panels}</FlankSheet> : panels;
}

function FlankSheet({ children }: { readonly children: ReactNode }): ReactElement {
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
            {children}
          </Stack>
        </DrawerPopup>
      </DrawerVirtualKeyboardProvider>
    </Drawer>
  );
}

/** The sheet's door in Message tools: on a touch device, and only while there is a panel to show. It leads the
 *  menu, so it closes with the separator. */
export function PluginPanelsMenuItem(): ReactElement | null {
  const host = useFlankHost();
  const touch = useFlankInSheet();
  if (!(touch && host.panels)) {
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
