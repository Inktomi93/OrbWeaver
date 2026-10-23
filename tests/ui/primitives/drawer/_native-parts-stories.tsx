import { CtIsolation } from "@orb/testkit/browser/ct-isolated-subject.tsx";
import { Button } from "@orb/ui/button";
import {
  createDrawerHandle,
  Drawer,
  DrawerClose,
  DrawerDescription,
  DrawerIndent,
  DrawerIndentBackground,
  DrawerPopup,
  DrawerProvider,
  DrawerSwipeArea,
  DrawerTitle,
  DrawerTrigger,
  DrawerVirtualKeyboardProvider,
} from "@orb/ui/drawer";
import type { ReactElement } from "react";
import { useState } from "react";

export function DrawerDepthStory(): ReactElement {
  return (
    <CtIsolation subject="Drawer" isolates="Depth and edge-target geometry belong to the native primitive, not the application shell.">
      <DrawerProvider>
        <DrawerIndentBackground />
        <DrawerIndent>
          <Drawer side="bottom">
            <DrawerSwipeArea side="bottom" />
            <DrawerTrigger>Open filters</DrawerTrigger>
            <DrawerVirtualKeyboardProvider>
              <DrawerPopup side="bottom">
                <DrawerTitle>Filters</DrawerTitle>
                <DrawerDescription>Narrow the list.</DrawerDescription>
                <DrawerClose>Done</DrawerClose>
              </DrawerPopup>
            </DrawerVirtualKeyboardProvider>
          </Drawer>
        </DrawerIndent>
      </DrawerProvider>
    </CtIsolation>
  );
}

export function DrawerHandleStory(): ReactElement {
  const [handle] = useState(() => createDrawerHandle<string>());
  return (
    <CtIsolation subject="Drawer" isolates="Native payload delivery is independent of application data.">
      <Button onClick={(): void => handle.openWithPayload("Remote filters")}>Open remotely</Button>
      <DrawerTrigger handle={handle} payload="Character filters">
        Characters
      </DrawerTrigger>
      <DrawerTrigger handle={handle} payload="Room filters">
        Rooms
      </DrawerTrigger>
      <Drawer handle={handle}>
        {({ payload }): ReactElement => (
          <DrawerPopup>
            <DrawerTitle>Filter selection</DrawerTitle>
            <DrawerDescription>{payload}</DrawerDescription>
            <DrawerClose>Done</DrawerClose>
          </DrawerPopup>
        )}
      </Drawer>
    </CtIsolation>
  );
}
