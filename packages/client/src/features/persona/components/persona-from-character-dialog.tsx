// The list band's "From character" door (#866 S4): a small dialog — the shared `CharacterPicker` + the
// "Swap {{char}}/{{user}}" switch — over `persona.createFromCharacter` (the server's non-lossy mint: it
// copies name/description/avatar and stamps provenance; the swap inverts the description's POV macros,
// because roles invert when a card becomes a persona). Picking a character IS the create (one activation,
// the picker's own grammar); the switch is read at pick time, so it sits ABOVE the list.

import type { CharacterId, PersonaId } from "@orb/kit/ids";
// @orb-waive dialog-via-composite(Dialog): selecting a CharacterPicker row performs creation and dismisses, with no submit or bound fields; ends if a picker composite owns this flow.
import { Dialog, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Row, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { CharacterPicker } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { usePersonaFromCharacter } from "../hooks/use-persona-mutations.ts";

const SWAP_LABEL = "Swap {{char}}/{{user}} in the copied description";

export interface PersonaFromCharacterDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Fired with the minted persona's id on success — the list expands the fresh row (the New-door flow). */
  readonly onCreated: (personaId: PersonaId) => void;
}

/** The From-character mint dialog. Controlled by the list band (its trigger lives there). */
export function PersonaFromCharacterDialog({ open, onOpenChange, onCreated }: PersonaFromCharacterDialogProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const createFrom = usePersonaFromCharacter({ trpc, invalidation });
  const [swapMacros, setSwapMacros] = useState(true);

  const onPick = (characterId: CharacterId, name: string): void => {
    if (createFrom.isPending) {
      return;
    }
    createFrom.mutate(
      { characterId, swapMacros },
      {
        onSuccess: (persona): void => {
          notify.success(`Created “${persona.name}” from ${name}.`);
          onOpenChange(false);
          onCreated(persona.id);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <Stack gap="block">
          <DialogTitle>New persona from a character</DialogTitle>
          <Row gap="row" align="center" className="justify-between">
            <Text voice="label">{SWAP_LABEL}</Text>
            {/* Default ON: a card's description speaks about {{char}}; as a persona the same prose must
                speak about {{user}} or every self-reference points at the wrong seat. */}
            <Switch aria-label={SWAP_LABEL} checked={swapMacros} onCheckedChange={setSwapMacros} />
          </Row>
          <CharacterPicker
            autoFocusSearch={true}
            emptyText="No characters match."
            label="New persona from a character"
            onEscape={(): void => onOpenChange(false)}
            onSelect={onPick}
            placeholder="Search characters…"
            reserveKey="persona.fromCharacterPicker"
          />
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}
