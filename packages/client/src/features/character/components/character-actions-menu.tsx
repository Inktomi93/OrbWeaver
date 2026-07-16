// The CONTEXT Actions menu — the persistent options menu above the CONTEXT tab strip: Duplicate · Export
// card · Convert to persona · Set as welcome greeter · Delete. All immediate identity gestures. Duplicate
// and Delete sit behind a `ConfirmDialog` interrupt, opened via controlled state outside the Menu (a menu
// item closes the menu on click).

import type { CharacterId } from "@orb/kit/ids";
import { MenuItem, MenuLinkItem } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog, RowActionsMenu } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { clearCharacterSelection, selectCharacter } from "#state";
import { useCreatePersonaFromCharacter, useDuplicateCharacter, useRemoveCharacter, useSetWelcomeGreeter } from "../hooks/use-character-context-mutations";

export interface CharacterActionsMenuProps {
  readonly characterId: CharacterId;
}

export function CharacterActionsMenu({ characterId }: CharacterActionsMenuProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const duplicate = useDuplicateCharacter({ trpc, invalidation });
  const remove = useRemoveCharacter({ trpc, invalidation });
  const convert = useCreatePersonaFromCharacter({ trpc, invalidation });
  const setWelcome = useSetWelcomeGreeter({ trpc, invalidation });

  const [duplicateOpen, setDuplicateOpen] = useState(false);

  const confirmDuplicate = (): void => {
    void duplicate
      .mutateAsync({ characterId })
      .then((created) => selectCharacter(created.id))
      .catch(() => undefined);
  };
  const confirmDelete = (): void => {
    void remove
      .mutateAsync({ characterId })
      .then(() => clearCharacterSelection())
      .catch(() => undefined);
  };

  return (
    <>
      <RowActionsMenu
        align="start"
        label="Character actions"
        destructive={{
          title: "Delete this character?",
          description: "This permanently deletes the character and everything attached to it. This can't be undone.",
          onConfirm: confirmDelete,
        }}
      >
        <MenuItem onClick={(): void => setDuplicateOpen(true)}>Duplicate</MenuItem>
        <MenuLinkItem href={`/api/export/character/${characterId}`} download={true}>
          Export card
        </MenuLinkItem>
        <MenuItem onClick={(): void => convert.mutate({ characterId, swapMacros: true })}>Convert to persona</MenuItem>
        <MenuItem
          onClick={(): void =>
            setWelcome.mutate({
              section: "seeds",
              patch: { welcomeAssistantCharacterId: characterId },
            })
          }
        >
          Set as welcome greeter
        </MenuItem>
      </RowActionsMenu>

      <ConfirmDialog
        confirmIntent="primary"
        confirmLabel="Duplicate"
        description="This creates an independent copy of the card. The copy opens in the editor."
        onConfirm={confirmDuplicate}
        onOpenChange={setDuplicateOpen}
        open={duplicateOpen}
        title="Duplicate this character?"
      />
    </>
  );
}
