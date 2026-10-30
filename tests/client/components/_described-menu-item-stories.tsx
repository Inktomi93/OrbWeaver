import { DescribedMenuItem } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser";
import { Menu, MenuCheckboxItem, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useState } from "react";

/** Production described commands with their native menu neighbors; no application services are involved. */
export function DescribedMenuItemStory(): ReactElement {
  const [lastCommand, setLastCommand] = useState("None");
  return (
    <CtIsolation subject="DescribedMenuItem" isolates="The production name/description composition and native Menu keyboard and pointer behavior.">
      <main>
        <output aria-label="Last command">{lastCommand}</output>
        <Menu>
          <MenuTrigger>Document actions</MenuTrigger>
          <MenuPopup>
            <DescribedMenuItem label="Archive" detail={undefined} onClick={(): void => setLastCommand("Archive")} />
            <DescribedMenuItem label="Duplicate" detail="Create an independent copy." onClick={(): void => setLastCommand("Duplicate")} />
            <DescribedMenuItem label="Export" detail="Choose a format before exporting." disabled={true} />
            <MenuCheckboxItem closeOnClick={false}>Keep open</MenuCheckboxItem>
          </MenuPopup>
        </Menu>
      </main>
    </CtIsolation>
  );
}

/** A deliberate name mismatch beside a healthy native command qualifies the vendor detector. */
export function MenuNameDetectorControlsStory(): ReactElement {
  return (
    <CtIsolation subject="Menu name controls" isolates="The unchanged vendor label-in-name rule recognizes an intentional defect and its healthy neighbor.">
      <main>
        <Menu>
          <MenuTrigger>Detector controls</MenuTrigger>
          <MenuPopup>
            <MenuItem aria-label="Healthy command">Healthy command</MenuItem>
            <MenuItem aria-label="Unrelated command">Visible command</MenuItem>
          </MenuPopup>
        </Menu>
      </main>
    </CtIsolation>
  );
}
