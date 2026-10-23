import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import {
  createMenuHandle,
  Menu,
  MenuArrow,
  MenuBackdrop,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
  MenuViewport,
} from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useId, useState } from "react";

export function MenuChoiceStory(): ReactElement {
  const [vetoes, setVetoes] = useState(0);
  return (
    <CtIsolation subject="Menu" isolates="Native selection, callback cancellation and popup lifecycle require no feature services.">
      <output aria-label="Refused changes">{String(vetoes)}</output>
      <Menu>
        <MenuTrigger>View options</MenuTrigger>
        <MenuBackdrop />
        <MenuPopup>
          <MenuArrow />
          <MenuViewport>
            <MenuCheckboxItem closeOnClick={false}>Show minimap</MenuCheckboxItem>
            <MenuCheckboxItem
              closeOnClick={false}
              onCheckedChange={(_checked, details): void => {
                details.cancel();
                setVetoes((count) => count + 1);
              }}
            >
              Locked option
            </MenuCheckboxItem>
            <MenuRadioGroup defaultValue="date">
              <MenuRadioItem value="date">Date</MenuRadioItem>
              <MenuRadioItem value="name">Name</MenuRadioItem>
            </MenuRadioGroup>
          </MenuViewport>
        </MenuPopup>
      </Menu>
    </CtIsolation>
  );
}

export function MenuHandleStory(): ReactElement {
  const [handle] = useState(() => createMenuHandle<string>());
  const triggerId = useId();
  return (
    <CtIsolation subject="Menu" isolates="The native handle must resolve a detached anchor and its payload.">
      <Button onClick={(): void => handle.open(triggerId)}>Open remotely</Button>
      <MenuTrigger handle={handle} id={triggerId} payload="Character actions">
        Characters
      </MenuTrigger>
      <MenuTrigger handle={handle} payload="Room actions">
        Rooms
      </MenuTrigger>
      <Menu handle={handle}>
        {({ payload }): ReactElement => (
          <MenuPopup>
            <MenuViewport>
              <MenuItem>{payload}</MenuItem>
            </MenuViewport>
          </MenuPopup>
        )}
      </Menu>
    </CtIsolation>
  );
}
