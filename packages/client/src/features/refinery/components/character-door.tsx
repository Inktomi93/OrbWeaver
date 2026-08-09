// The refinery's CHARACTER DOOR — a collapsed trigger that opens the shared `CharacterPicker` in an
// anchored Popover, and echoes the chosen card back on the trigger itself.
//
// WHY IT EXISTS (side-eye 2026-08-09 P1-14, and the P2 "two Pick-a-character homes with contradictory
// copy"). `CharacterPicker` is a PERMANENTLY-OPEN cmdk body by design — a search field plus its result
// list, meant to be dropped inside a surface that already owns the open/closed state (its two original
// consumers are a Popover and a modal focus-stack). Both refinery call sites dropped it INLINE instead,
// so the schema editor rendered a 281px always-expanded list — measured 281px past the dialog's bottom
// edge, i.e. off-screen — and the teaching state grew a second, differently-worded picker beside its own
// "Pick a character" button.
//
// One door, one copy, one open/closed state. The `AddMemberPopover` shape is the precedent (the OUTER
// chrome belongs to the consumer, the Command body is shared); this is that chrome for the refinery.
// The trigger states the CURRENT choice rather than a static verb, so the control is also the readout —
// which is what removes the need for a second echo line beside it.

import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import type { ReactElement } from "react";
import { useState } from "react";
import { CharacterPicker } from "#components";
import { testId } from "#lib";

export interface CharacterDoorProps {
  /** The trigger's copy while nothing is chosen — the ONE place this feature words the invitation. */
  readonly placeholder: string;
  /** The picker's accessible label (announced on the search field). */
  readonly label: string;
  /** The chosen card's display name, or null while none is chosen. Rendered ON the trigger. */
  readonly chosenName: string | null;
  readonly disabled?: boolean;
  readonly onSelect: (id: CharacterId, name: string) => void;
}

export function CharacterDoor({ placeholder, label, chosenName, disabled = false, onSelect }: CharacterDoorProps): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button data-testid={testId("refineryCharacterDoor")} disabled={disabled} intent="secondary" size="sm">
            {chosenName ?? placeholder}
          </Button>
        }
      />
      <PopoverPopup>
        <CharacterPicker
          autoFocusSearch={true}
          emptyText="No characters match."
          label={label}
          onEscape={(): void => setOpen(false)}
          onSelect={(id, name): void => {
            setOpen(false);
            onSelect(id, name);
          }}
          placeholder="Search characters…"
        />
      </PopoverPopup>
    </Popover>
  );
}
