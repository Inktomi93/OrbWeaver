// The CONTEXT Actions menu — the persistent options menu above the CONTEXT tab strip: Open in Refinery ·
// Duplicate · Convert to persona · Set as welcome greeter · Delete. All immediate identity gestures.
// Duplicate and Delete sit behind a `ConfirmDialog` interrupt, opened via controlled state outside the
// Menu (a menu item closes the menu on click).
//
// "OPEN IN REFINERY" IS A CROSS-SECTION DOOR, AND IT IS NOT A SIDEWAYS IMPORT (owner scope-add,
// 2026-08-17, #157 — "the CHARACTERS section gains an 'Open in Refinery' affordance that jumps straight
// into a refinery session on that character"). A feature may never import another feature, so the flow
// lives at the shared client seam (`#data`'s `useOpenRefinery`) exactly as this feature's own "New chat"
// rides `#data`'s `useStartChat` — same tier, same reason, and `lib/character-chat-intents.ts` is the
// precedent this follows. It is the SAME flow the refinery's two own doors fire, so this jump obeys the
// resume-or-mint rule (#79) rather than minting a duplicate session per press.
//
// EXPORT IS DELIBERATELY ABSENT: card export homes on the character LIST row kebab, its ONE home (the
// ratified lifecycle placement — import on the list band, export on the row kebab, no lifecycle chrome in
// the editor).

import type { CharacterId } from "@orb/kit/ids";
import { MenuItem } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog, RowActionsMenu } from "#components";
import { useInvalidation, useOpenRefinery, useTRPC } from "#data";
import { clearCharacterSelection, selectCharacter } from "#state";
import { useCreatePersonaFromCharacter, useDuplicateCharacter, useRemoveCharacter, useSetWelcomeGreeter } from "../hooks/use-character-context-mutations.ts";

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
  const { openRefinery } = useOpenRefinery();

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
        <MenuItem
          onClick={(): void => {
            // @orb-gate-ignore caught-failure-ownership(promise:openRefinery): useOpenRefinery's own errorToast surfaces the failure; a failed open just leaves the actor on this menu. Ends if useOpenRefinery drops its errorToast.
            void openRefinery(characterId).catch(() => undefined);
          }}
        >
          Open in Refinery
        </MenuItem>
        <MenuItem onClick={(): void => setDuplicateOpen(true)}>Duplicate</MenuItem>
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
