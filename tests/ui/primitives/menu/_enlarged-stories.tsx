import { CtIsolation } from "@orb/testkit/browser";
import { Menu, MenuItem, MenuPopup, MenuSubmenuRoot, MenuSubmenuTrigger, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";

/** A command with a long label and a submenu with a long label, in a popup opened from the top-left corner of the screen. */
export function LongLabelMenuStory(): ReactElement {
  return (
    <CtIsolation subject="Menu" isolates="Row wrapping inside the popup needs no application services.">
      <Menu>
        <MenuTrigger>Long label commands</MenuTrigger>
        <MenuPopup>
          <MenuItem>Regenerate the last reply with a different model</MenuItem>
          <MenuSubmenuRoot>
            <MenuSubmenuTrigger>Draft your line on behalf of another persona</MenuSubmenuTrigger>
            <MenuPopup>
              <MenuItem>Persona</MenuItem>
            </MenuPopup>
          </MenuSubmenuRoot>
        </MenuPopup>
      </Menu>
    </CtIsolation>
  );
}
