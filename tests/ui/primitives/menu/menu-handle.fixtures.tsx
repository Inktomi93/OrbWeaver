// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome
// forbids exporting a component from a `.ct.tsx`). Exercises the detached MENU handle, the part the
// menu seal was missing while its five sibling popup seals all wrapped one: a hidden trigger carries
// the payload, and `handle.open(triggerId)` opens the menu imperatively so the payload reaches the
// Root render-function children. Same API delta as popover/tooltip — no openWithPayload; payload
// rides the trigger (see menu/handle.ts).
import { Icon, Pencil } from "@orb/ui/icons";
import { createMenuHandle, Menu, MenuItem, MenuPopup, MenuSubmenuRoot, MenuSubmenuTrigger, MenuTrigger } from "@orb/ui/menu";
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

/**
 * The MIXED-ROW menu — an iconed command, a bare-text command, a bare-text submenu trigger, an iconed
 * submenu trigger. The four label positions the ragged-column finding is about (side-eye 2026-08-06 P2).
 *
 * It lives HERE and not in the `.ct.tsx` for a mechanical reason worth keeping: `<Icon>` is an @orb/ui
 * COMPONENT, and playwright-ct refuses to mount a component whose definition it resolves through the test
 * file ("Component \"Icon\" cannot be mounted … Create a test story instead") — both a named import and a
 * namespace import fail, the named one at parse time.
 */
export function MenuLabelColumnHarness(): ReactElement {
  return (
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuPopup>
        <MenuItem>
          <Icon icon={Pencil} size="sm" />
          Rename
        </MenuItem>
        <MenuItem>Select messages…</MenuItem>
        <MenuSubmenuRoot>
          <MenuSubmenuTrigger>Character galleries</MenuSubmenuTrigger>
          <MenuPopup>
            <MenuItem>Nova</MenuItem>
          </MenuPopup>
        </MenuSubmenuRoot>
        <MenuSubmenuRoot>
          <MenuSubmenuTrigger>
            <Icon icon={Pencil} size="sm" />
            Iconed submenu
          </MenuSubmenuTrigger>
          <MenuPopup>
            <MenuItem>Nova</MenuItem>
          </MenuPopup>
        </MenuSubmenuRoot>
      </MenuPopup>
    </Menu>
  );
}
