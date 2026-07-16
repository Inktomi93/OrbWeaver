// The shared Impersonate submenu — the 1st/2nd/3rd-person perspective picker rendered by BOTH the
// composer wand and the chat-options menu. `PERSON_LABEL` is the ONE display map over the
// `GUIDED_IMPERSONATE_PERSONS` tuple; `onPick` carries the perspective back to the caller's own dispatch
// (the wand fires-and-clears the draft; the options menu fires with an empty steer). derive-modernization §W5.
import type { GuidedImpersonatePerson } from "@orb/contracts/preset";
import { GUIDED_IMPERSONATE_PERSONS } from "@orb/contracts/preset";
import { MenuItem, MenuPopup, MenuSubmenuRoot, MenuSubmenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";

const PERSON_LABEL: Record<GuidedImpersonatePerson, string> = {
  first: "1st person",
  second: "2nd person",
  third: "3rd person",
};

export function ImpersonateSubmenu({ onPick }: { readonly onPick: (person: GuidedImpersonatePerson) => void }): ReactElement {
  return (
    <MenuSubmenuRoot>
      <MenuSubmenuTrigger>Impersonate</MenuSubmenuTrigger>
      <MenuPopup>
        {GUIDED_IMPERSONATE_PERSONS.map((person) => (
          <MenuItem key={person} onClick={(): void => onPick(person)}>
            {PERSON_LABEL[person]}
          </MenuItem>
        ))}
      </MenuPopup>
    </MenuSubmenuRoot>
  );
}
