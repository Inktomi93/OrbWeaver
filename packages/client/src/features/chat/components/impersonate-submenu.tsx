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

export function ImpersonateSubmenu({
  onPick,
  disabled = false,
  reason,
}: {
  readonly onPick: (person: GuidedImpersonatePerson) => void;
  /** Disables the whole submenu when there's no committed turn to impersonate into (a draft). */
  readonly disabled?: boolean;
  /** The hover reason shown on the disabled trigger (the unlock condition) — the submenu trigger is a
   *  div[role=menuitem] rendered aria-disabled (not native-disabled), so it still receives hover and the
   *  `title` surfaces. */
  readonly reason?: string | undefined;
}): ReactElement {
  return (
    <MenuSubmenuRoot>
      <MenuSubmenuTrigger disabled={disabled} title={disabled ? reason : undefined}>
        Impersonate
      </MenuSubmenuTrigger>
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
