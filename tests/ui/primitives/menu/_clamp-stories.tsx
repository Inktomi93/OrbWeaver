import { CtIsolation } from "@orb/testkit/browser";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";

/** Two menus over the same items: the default viewport clamp, and the one that stops a topbar row short of the edge. */
export function MenuClampStory(): ReactElement {
  return (
    <CtIsolation subject="Menu" isolates="The popup's viewport clamp needs no feature services.">
      <Menu>
        <MenuTrigger>Viewport clamp</MenuTrigger>
        <MenuPopup side="top">
          <MenuItem>One</MenuItem>
        </MenuPopup>
      </Menu>
      <Menu>
        <MenuTrigger>Below the chrome</MenuTrigger>
        <MenuPopup clamp="belowChrome" side="top">
          <MenuItem>One</MenuItem>
        </MenuPopup>
      </Menu>
    </CtIsolation>
  );
}
