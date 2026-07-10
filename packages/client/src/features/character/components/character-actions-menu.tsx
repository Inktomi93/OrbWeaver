// The CONTEXT Actions menu (FINAL-Character §7) — the persistent options menu ABOVE the CONTEXT tab strip
// (secondary chrome, rule 4): Duplicate · Export card · Convert to persona · Set as welcome greeter ·
// Delete. All immediate identity gestures (never the CONTENT save-bar). The two DESTRUCTIVE/irreversible-
// feeling ops (Duplicate spawns a copy; Delete cascades hard) sit behind an AlertDialog INTERRUPT (§13.8
// R4 — a legal AlertDialog, never a plain Dialog). Export is a straight `<a href>` to the SHIPPED route
// (MenuLinkItem — no build). The AlertDialogs live OUTSIDE the Menu (a menu item closes the menu on click,
// so the confirm is opened via controlled state — the chat-list-row-menu precedent).

import type { CharacterId } from "@orb/kit/ids";
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@orb/ui/alert-dialog";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Menu, MenuItem, MenuLinkItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { clearCharacterSelection, selectCharacter } from "#state";
import {
  useCreatePersonaFromCharacter,
  useDuplicateCharacter,
  useRemoveCharacter,
  useSetWelcomeGreeter,
} from "../hooks/use-character-context-mutations";

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
  const [deleteOpen, setDeleteOpen] = useState(false);

  // mutateAsync so the follow-up selection rides the result (the mutation surfaces its own errorToast;
  // the .catch keeps a rejected write from leaking an unhandled rejection — the ChatContextPanel precedent).
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
      <Menu>
        <MenuTrigger render={<Button intent="ghost">Actions</Button>} />
        <MenuPopup>
          <MenuItem onClick={(): void => setDuplicateOpen(true)}>Duplicate</MenuItem>
          <MenuLinkItem href={`/api/export/character/${characterId}`} download={true}>
            Export card
          </MenuLinkItem>
          <MenuItem onClick={(): void => convert.mutate({ characterId, swapMacros: true })}>
            Convert to persona
          </MenuItem>
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
          <MenuSeparator />
          <MenuItem onClick={(): void => setDeleteOpen(true)}>Delete</MenuItem>
        </MenuPopup>
      </Menu>

      <AlertDialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <AlertDialogPopup>
          <Stack gap="block">
            <AlertDialogTitle>Duplicate this character?</AlertDialogTitle>
            {/* Plain children — AlertDialogDescription IS the <p>; a nested <Text> (also <p>) is invalid HTML. */}
            <AlertDialogDescription>
              This creates an independent copy of the card. The copy opens in the editor.
            </AlertDialogDescription>
            <AlertDialogActions>
              <AlertDialogClose render={<Button intent="ghost">Cancel</Button>} />
              <AlertDialogClose
                render={
                  <Button intent="primary" onClick={confirmDuplicate}>
                    Duplicate
                  </Button>
                }
              />
            </AlertDialogActions>
          </Stack>
        </AlertDialogPopup>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogPopup>
          <Stack gap="block">
            <AlertDialogTitle>Delete this character?</AlertDialogTitle>
            {/* Plain children — AlertDialogDescription IS the <p>; a nested <Text> (also <p>) is invalid HTML. */}
            <AlertDialogDescription>
              This permanently deletes the character and everything attached to it. This can't be
              undone.
            </AlertDialogDescription>
            <AlertDialogActions>
              <AlertDialogClose render={<Button intent="ghost">Cancel</Button>} />
              <AlertDialogClose
                render={
                  <Button intent="destructive" onClick={confirmDelete}>
                    Delete
                  </Button>
                }
              />
            </AlertDialogActions>
          </Stack>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
