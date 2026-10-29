import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useState } from "react";

export function ConstrainedMenuStory(): ReactElement {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <CtIsolation subject="Menu" isolates="Native anchored positioning and constrained keyboard selection need no application services.">
      <output aria-label="Selected action">{selected === null ? "None" : `Action ${selected}`}</output>
      <div style={{ position: "fixed", left: 80, bottom: 16 }}>
        <Menu>
          <Tooltip>
            <TooltipTrigger
              render={
                <MenuTrigger
                  render={
                    <Button aria-label="Constrained actions" intent="ghost" size="glyph-lg">
                      ⋯
                    </Button>
                  }
                />
              }
            />
            <TooltipPopup side="top">Constrained actions</TooltipPopup>
          </Tooltip>
          <MenuPopup align="end">
            {Array.from({ length: 12 }, (_, index) => index + 1).map((number) => (
              <MenuItem key={number} onClick={(): void => setSelected(number)}>
                Action {number}
              </MenuItem>
            ))}
          </MenuPopup>
        </Menu>
      </div>
    </CtIsolation>
  );
}
