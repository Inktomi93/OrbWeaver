import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { GlyphButton } from "@orb/ui/glyph-button";
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
                    <GlyphButton aria-label="Constrained actions" variant="ghost" glyph="lg">
                      ⋯
                    </GlyphButton>
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

/** A trigger pinned to the screen's right edge, whose popup starts at the trigger and so would run past the edge. */
export function EdgeMenuStory(): ReactElement {
  return (
    <CtIsolation subject="Menu" isolates="Edge collision needs only an anchored popup, no application services.">
      <div style={{ position: "fixed", right: 0, top: 80 }}>
        <Menu>
          <MenuTrigger
            render={
              <Button aria-label="Edge actions" variant="ghost" square={true}>
                ⋯
              </Button>
            }
          />
          <MenuPopup align="start">
            <MenuItem>A command wider than the trigger</MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </CtIsolation>
  );
}
