// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome
// forbids exporting a component from a `.ct.tsx`). Exercises the detached drawer handle:
// `handle.openWithPayload(payload)` opens the drawer imperatively WITHOUT any trigger association
// and routes the payload to the Root render-function children (Base UI drawer re-exports the dialog
// createHandle mechanism).
import { createDrawerHandle, Drawer, DrawerPopup, DrawerTitle, DrawerTrigger } from "@orb/ui/drawer";
import type { ReactElement } from "react";
import { useState } from "react";

export function DrawerHandleHarness(): ReactElement {
  const [handle] = useState(() => createDrawerHandle<string>());
  return (
    <>
      <button
        onClick={(): void => {
          handle.openWithPayload("Reached content");
        }}
        type="button"
      >
        Open remotely
      </button>
      <Drawer handle={handle}>
        {({ payload }): ReactElement => (
          <DrawerPopup>
            <DrawerTitle>{payload ?? "no payload"}</DrawerTitle>
          </DrawerPopup>
        )}
      </Drawer>
    </>
  );
}

// Exercises the DETACHED-TRIGGER shape (distinct from openWithPayload above): two `<DrawerTrigger
// handle payload>` buttons, each carrying its OWN payload, both wired to the same handle-driven
// drawer — the "N triggers, one handle-driven drawer" primitive that DrawerTrigger's generic
// `Payload` type param exists for (mirrors DialogTrigger/AlertDialogTrigger; was a type regression
// before DrawerTrigger became generic).
export function DrawerTriggerPayloadHarness(): ReactElement {
  const [handle] = useState(() => createDrawerHandle<string>());
  return (
    <>
      <DrawerTrigger handle={handle} payload="From trigger A">
        Trigger A
      </DrawerTrigger>
      <DrawerTrigger handle={handle} payload="From trigger B">
        Trigger B
      </DrawerTrigger>
      <Drawer handle={handle}>
        {({ payload }): ReactElement => (
          <DrawerPopup>
            <DrawerTitle>{payload ?? "no payload"}</DrawerTitle>
          </DrawerPopup>
        )}
      </Drawer>
    </>
  );
}
