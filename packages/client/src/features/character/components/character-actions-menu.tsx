// The CONTEXT Actions menu (FINAL-Character §7) — the persistent options menu ABOVE the CONTEXT tab strip
// (secondary chrome, rule 4): Duplicate · Export card · Convert to persona · Set as welcome greeter ·
// Delete. All immediate identity gestures (never the CONTENT save-bar). The two DESTRUCTIVE/irreversible-
// feeling ops (Duplicate spawns a copy; Delete cascades hard) sit behind a `ConfirmDialog` INTERRUPT
// (§13.8 R4 — a legal AlertDialog, never a plain Dialog). Export is a straight `<a href>` to the SHIPPED
// route (MenuLinkItem — no build). The ConfirmDialogs live OUTSIDE the Menu (a menu item closes the menu
// on click, so the confirm is opened via controlled state — the chat-list-row-menu precedent).

import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Icon/MoreHorizontal fine (the character-card.tsx precedent).
import { Icon, MoreHorizontal } from "@orb/ui/icons";
import { Menu, MenuItem, MenuLinkItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog } from "#components";
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
        {/* Icon-only kebab (the every-list-row MoreHorizontal convention) — a text "Actions" button was a
            fat ~76px `shrink-0` sibling that starved the inline tab strip at the docked ~264px width, clipping
            "Options". The icon frees ~50px so the 3 equal-width tabs fit without overflow. Labeled for AT. */}
        <MenuTrigger
          render={
            <Button aria-label="Character actions" intent="ghost" size="icon" type="button">
              <Icon icon={MoreHorizontal} size="sm" />
            </Button>
          }
        />
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

      <ConfirmDialog
        confirmIntent="primary"
        confirmLabel="Duplicate"
        description="This creates an independent copy of the card. The copy opens in the editor."
        onConfirm={confirmDuplicate}
        onOpenChange={setDuplicateOpen}
        open={duplicateOpen}
        title="Duplicate this character?"
      />

      <ConfirmDialog
        confirmLabel="Delete"
        description="This permanently deletes the character and everything attached to it. This can't be undone."
        onConfirm={confirmDelete}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title="Delete this character?"
      />
    </>
  );
}
