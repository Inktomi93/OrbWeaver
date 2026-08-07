// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome
// forbids exporting a component from a `.ct.tsx`). Exercises the detached MENU handle, the part the
// menu seal was missing while its five sibling popup seals all wrapped one: a hidden trigger carries
// the payload, and `handle.open(triggerId)` opens the menu imperatively so the payload reaches the
// Root render-function children. Same API delta as popover/tooltip — no openWithPayload; payload
// rides the trigger (see menu/handle.ts).
import { createMenuHandle, Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useId, useState } from "react";

export function MenuHandleHarness(): ReactElement {
  const [handle] = useState(() => createMenuHandle<string>());
  const triggerId = useId();
  return (
    <>
      <button
        onClick={(): void => {
          handle.open(triggerId);
        }}
        type="button"
      >
        Open remotely
      </button>
      <MenuTrigger className="sr-only" handle={handle} id={triggerId} payload="Reached content">
        anchor
      </MenuTrigger>
      <Menu handle={handle}>
        {({ payload }): ReactElement => (
          <MenuPopup>
            <MenuItem>{payload ?? "no payload"}</MenuItem>
          </MenuPopup>
        )}
      </Menu>
    </>
  );
}
